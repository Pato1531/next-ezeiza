import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
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

    const tipo = pago.tipo || 'cuota' // 'cuota' | 'matricula'
    const supabase = sb()

    // Eliminar pago previo del mismo alumno/mes/año/tipo para hacer upsert limpio
    await supabase
      .from('pagos_alumnos')
      .delete()
      .eq('alumno_id', pago.alumno_id)
      .eq('mes', pago.mes)
      .eq('anio', pago.anio)
      .eq('tipo', tipo)

    const { data, error } = await supabase
      .from('pagos_alumnos')
      .insert({
        alumno_id: pago.alumno_id,
        mes: pago.mes,
        anio: pago.anio,
        monto: pago.monto,
        metodo: pago.metodo || 'Efectivo',
        fecha_pago: pago.fecha_pago || new Date().toISOString().split('T')[0],
        observaciones: pago.observaciones || null,
        tipo,
        ...(institutoId ? { instituto_id: institutoId } : {}),
      })
      .select()
      .single()

    if (error) {
      console.error('[registrar-pago] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('[registrar-pago] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
