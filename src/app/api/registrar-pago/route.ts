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

    // 1. Eliminar pago previo del mismo alumno/mes/año
    //    Filtrar por instituto_id cuando está disponible para evitar borrar de otros institutos
    let delQ = supabase
      .from('pagos_alumnos')
      .delete()
      .eq('alumno_id', pago.alumno_id)
      .eq('mes', pago.mes)
      .eq('anio', pago.anio)
    if (institutoId) delQ = (delQ as any).eq('instituto_id', institutoId)

    const { error: delError } = await delQ
    if (delError) {
      console.warn('[registrar-pago] DELETE warning:', delError.message, delError.code)
    }

    // 2. Construir payload del INSERT
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

    // 3. Intentar INSERT con campo 'tipo' (por si la migración ya se ejecutó)
    let result = await supabase
      .from('pagos_alumnos')
      .insert({ ...insertData, tipo: pago.tipo || 'cuota' })
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
