import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { getInstitutoId, verificarAuth } from '@/lib/server-utils'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':registrar-pago', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    const pago = await req.json()

    if (!pago.alumno_id || !pago.mes || !pago.anio) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: alumno_id, mes, anio' }, { status: 400 })
    }

    const supabase = sb()
    const tipo = pago.tipo || 'cuota'

    // ── LÓGICA DE REEMPLAZO SELECTIVA ──────────────────────────────────────────
    // "Familia cuota": representan la MISMA obligación (la cuota mensual del
    // alumno), solo que con variantes de monto. Solo puede existir UNA de estas
    // por alumno/mes — si ya había otra variante (ej. 'cuota' plana) y ahora se
    // registra 'cuota_descuento', se borra la anterior para no duplicar el cobro.
    //   'cuota'            → cuota mensual estándar (monto fijo del alumno)
    //   'recargo'          → cuota con recargo (monto uniforme para el grupo)
    //   'cuota_recargo'    → alias de recargo
    //   'cuota_descuento'  → cuota mensual con descuento (monto editable por alumno)
    //
    // 'matricula' reemplaza solo a sí misma (no es parte de la familia cuota).
    //
    // Tipos que ACUMULAN (pueden existir varios en el mismo mes):
    //   'proporcional'  → cobro parcial, siempre se agrega como registro nuevo
    // ───────────────────────────────────────────────────────────────────────────
    const FAMILIA_CUOTA = ['cuota', 'recargo', 'cuota_recargo', 'cuota_descuento']
    const TIPOS_QUE_REEMPLAZAN = [...FAMILIA_CUOTA, 'matricula']

    if (TIPOS_QUE_REEMPLAZAN.includes(tipo)) {
      let delQ = supabase
        .from('pagos_alumnos')
        .delete()
        .eq('alumno_id', pago.alumno_id)
        .eq('mes', pago.mes)
        .eq('anio', pago.anio)
      if (FAMILIA_CUOTA.includes(tipo)) {
        // Borra cualquier variante previa de la familia cuota (incluye NULL,
        // pagos legacy sin columna 'tipo' migrada)
        delQ = (delQ as any).or(
          "tipo.is.null,tipo.eq.cuota,tipo.eq.recargo,tipo.eq.cuota_recargo,tipo.eq.cuota_descuento"
        )
      } else {
        delQ = delQ.eq('tipo', tipo)
      }
      if (institutoId) delQ = (delQ as any).eq('instituto_id', institutoId)

      const { error: delError } = await delQ
      if (delError) {
        // Si la columna 'tipo' no existe todavía (migración pendiente),
        // hacer delete amplio como fallback para no dejar duplicados
        if (delError.code === '42703') {
          let delQFallback = supabase
            .from('pagos_alumnos')
            .delete()
            .eq('alumno_id', pago.alumno_id)
            .eq('mes', pago.mes)
            .eq('anio', pago.anio)
          if (institutoId) delQFallback = (delQFallback as any).eq('instituto_id', institutoId)
          await delQFallback
        } else {
          console.warn('[registrar-pago] DELETE warning:', delError.message, delError.code)
        }
      }
    }
    // Para 'proporcional', 'clase_particular' y cualquier tipo no listado:
    // no se borra nada → se inserta directamente como registro adicional.
    // 'clase_particular' es a propósito: cada clase pagada debe quedar como
    // una fila propia e inmutable (ver src/lib/pagos.ts), para que el recibo
    // de una clase no se rompa ni cambie de monto cuando se cobra la
    // siguiente.

    // ── Guard de idempotencia para pagos ligados a una clase puntual ────────────
    // Evita cobrar dos veces la misma clase (doble tap, doble submit) — el
    // índice único en la base ya lo impediría, pero acá devolvemos un error
    // claro en vez de un 500 genérico.
    if (tipo === 'clase_particular' && pago.clase_id) {
      const { data: existente } = await supabase
        .from('pagos_alumnos')
        .select('id')
        .eq('alumno_id', pago.alumno_id)
        .eq('clase_id', pago.clase_id)
        .maybeSingle()
      if (existente) {
        return NextResponse.json({ error: 'Esa clase ya tiene un pago registrado', code: 'CLASE_YA_PAGADA' }, { status: 409 })
      }
    }

    // ── INSERT ─────────────────────────────────────────────────────────────────
    const insertData: any = {
      alumno_id: pago.alumno_id,
      mes: pago.mes,
      anio: pago.anio,
      monto: pago.monto ?? 0,
      metodo: pago.metodo || 'Efectivo',
      fecha_pago: pago.fecha_pago || new Date().toISOString().split('T')[0],
      observaciones: pago.observaciones || null,
      ...(pago.clase_id ? { clase_id: pago.clase_id } : {}),
      ...(institutoId ? { instituto_id: institutoId } : {}),
    }

    // Intentar con campo 'tipo' (columna puede no existir en instancias sin migración)
    let result = await supabase
      .from('pagos_alumnos')
      .insert({ ...insertData, tipo })
      .select()
      .single()

    // Si falla por columna inexistente (tipo o clase_id, según la migración
    // pendiente en esa instancia), reintentar con un insert más chico
    if (result.error?.code === '42703') {
      console.warn('[registrar-pago] columna inexistente, reintentando sin tipo/clase_id:', result.error.message)
      const { clase_id, ...insertDataSinClase } = insertData
      result = await supabase
        .from('pagos_alumnos')
        .insert(insertDataSinClase)
        .select()
        .single()
    }

    if (result.error) {
      console.error('[registrar-pago] INSERT error:', result.error)
      return NextResponse.json({ error: result.error.message, code: result.error.code }, { status: 500 })
    }

    return NextResponse.json({ data: result.data })
  } catch (e: any) {
    console.error('[registrar-pago] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET — listar pagos del mes para saber quiénes ya pagaron (usa service_role, bypasea RLS)
export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes')
    const anio = searchParams.get('anio')
    const institutoId = getInstitutoId(req)

    if (!mes || !anio) {
      return NextResponse.json({ error: 'Faltan mes y anio' }, { status: 400 })
    }

    let q = sb().from('pagos_alumnos').select('alumno_id, monto, tipo').eq('mes', mes).eq('anio', parseInt(anio))
    if (institutoId) q = (q as any).eq('instituto_id', institutoId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

// DELETE — eliminar un pago por id
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id del pago' }, { status: 400 })

    const institutoId = getInstitutoId(req)
    const { error } = await sb()
      .from('pagos_alumnos')
      .delete()
      .eq('id', id)
      .eq('instituto_id', institutoId)

    if (error) {
      console.error('[registrar-pago DELETE]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
