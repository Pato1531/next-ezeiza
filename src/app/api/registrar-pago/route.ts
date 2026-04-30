import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { getInstitutoId } from '@/lib/server-utils'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':registrar-pago', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    const pago = await req.json()

    if (!pago.alumno_id || !pago.mes || !pago.anio) {
      return NextResponse.json({ error: 'Faltan campos obligatorios: alumno_id, mes, anio' }, { status: 400 })
    }

    const supabase = sb()
    const tipo = pago.tipo || 'cuota'

    // ── LÓGICA DE REEMPLAZO SELECTIVA ──────────────────────────────────────────
    // Solo se elimina el pago previo si es del MISMO TIPO.
    // Esto evita que registrar una cuota mensual borre un proporcional previo,
    // o que una matrícula borre una cuota del mismo mes.
    //
    // Tipos que REEMPLAZAN (solo puede haber 1 por mes):
    //   'cuota'         → cuota mensual estándar
    //   'recargo'       → cuota con recargo
    //   'cuota_recargo' → alias de recargo
    //   'matricula'     → matrícula anual
    //
    // Tipos que ACUMULAN (pueden existir varios en el mismo mes):
    //   'proporcional'  → cobro parcial, siempre se agrega como registro nuevo
    // ───────────────────────────────────────────────────────────────────────────
    const TIPOS_QUE_REEMPLAZAN = ['cuota', 'recargo', 'cuota_recargo', 'matricula']

    if (TIPOS_QUE_REEMPLAZAN.includes(tipo)) {
      let delQ = supabase
        .from('pagos_alumnos')
        .delete()
        .eq('alumno_id', pago.alumno_id)
        .eq('mes', pago.mes)
        .eq('anio', pago.anio)
        .eq('tipo', tipo)
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
    // Para 'proporcional' y cualquier tipo no listado:
    // no se borra nada → se inserta directamente como registro adicional.

    // ── INSERT ─────────────────────────────────────────────────────────────────
    const insertData: any = {
      alumno_id: pago.alumno_id,
      mes: pago.mes,
      anio: pago.anio,
      monto: pago.monto ?? 0,
      metodo: pago.metodo || 'Efectivo',
      fecha_pago: pago.fecha_pago || new Date().toISOString().split('T')[0],
      observaciones: pago.observaciones || null,
      ...(institutoId ? { instituto_id: institutoId } : {}),
    }

    // Intentar con campo 'tipo' (columna puede no existir en instancias sin migración)
    let result = await supabase
      .from('pagos_alumnos')
      .insert({ ...insertData, tipo })
      .select()
      .single()

    // Si falla por columna inexistente, reintentar sin 'tipo'
    if (result.error?.code === '42703') {
      console.warn('[registrar-pago] columna tipo no existe, reintentando sin ella')
      result = await supabase
        .from('pagos_alumnos')
        .insert(insertData)
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
