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

    // Eliminar pago previo del mismo alumno/mes/año para hacer upsert limpio.
    // No filtramos por 'tipo' porque la columna puede no existir aún en la BD.
    // Si hay columna tipo, el INSERT siguiente la incluye igualmente.
    try {
      await supabase
        .from('pagos_alumnos')
        .delete()
        .eq('alumno_id', pago.alumno_id)
        .eq('mes', pago.mes)
        .eq('anio', pago.anio)
    } catch (_) {
      // ignorar error del delete — el insert va a fallar también si hay problema grave
    }

    // Construir objeto de inserción — incluir 'tipo' solo si la columna existe
    // Si no existe, el campo extra simplemente se ignora por Supabase
    const insertData: any = {
      alumno_id: pago.alumno_id,
      mes: pago.mes,
      anio: pago.anio,
      monto: pago.monto,
      metodo: pago.metodo || 'Efectivo',
      fecha_pago: pago.fecha_pago || new Date().toISOString().split('T')[0],
      observaciones: pago.observaciones || null,
      ...(institutoId ? { instituto_id: institutoId } : {}),
    }
    // Intentar con tipo primero, si falla sin tipo
    let data: any = null
    let error: any = null;
    ({ data, error } = await supabase.from('pagos_alumnos').insert({ ...insertData, tipo }).select().single())
    if (error?.code === '42703') {
      // columna 'tipo' no existe — insertar sin ella
      ;({ data, error } = await supabase.from('pagos_alumnos').insert(insertData).select().single())
    }

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
