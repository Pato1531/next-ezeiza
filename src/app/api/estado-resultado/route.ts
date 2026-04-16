import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// Conceptos predefinidos del estado de resultado
const CONCEPTOS_DEFAULT = [
  // Egresos
  { concepto: 'Alquiler', tipo: 'egreso', importe: 0 },
  { concepto: 'Regalías', tipo: 'egreso', importe: 0 },
  { concepto: 'Luz', tipo: 'egreso', importe: 0 },
  { concepto: 'Emergencias', tipo: 'egreso', importe: 0 },
  { concepto: 'Seguro Integral', tipo: 'egreso', importe: 0 },
  { concepto: 'Agua', tipo: 'egreso', importe: 0 },
  { concepto: 'Municipal', tipo: 'egreso', importe: 0 },
  { concepto: 'Internet', tipo: 'egreso', importe: 0 },
  { concepto: 'Sueldos Administrativos', tipo: 'egreso', importe: 0 },
  { concepto: 'Sueldo Coordinadora', tipo: 'egreso', importe: 0 },
  { concepto: 'Gastos Limpieza', tipo: 'egreso', importe: 0 },
  { concepto: 'Redes Sociales', tipo: 'egreso', importe: 0 },
  { concepto: 'Publicidad', tipo: 'egreso', importe: 0 },
  { concepto: 'Bonos', tipo: 'egreso', importe: 0 },
  // Ingresos extra (manuales)
  { concepto: 'Ingresos por Exámenes', tipo: 'ingreso_extra', importe: 0 },
  { concepto: 'Ingresos por Matrículas', tipo: 'ingreso_extra', importe: 0 },
]

// GET — Cargar estado de resultado del mes/año
// Calcula automáticamente los ingresos de pagos_alumnos
export async function GET(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const { searchParams } = new URL(req.url)
    const mes = searchParams.get('mes')
    const anio = searchParams.get('anio')

    if (!mes || !anio) {
      return NextResponse.json({ error: 'Faltan parámetros: mes, anio' }, { status: 400 })
    }
    // institutoId puede ser null en instancias single-tenant — las queries lo manejan opcionalmente

    const supabase = sb()

    // 1. Calcular ingresos automáticos del mes desde pagos_alumnos
    let pagosQuery = supabase
      .from('pagos_alumnos')
      .select('monto, tipo')
      .eq('mes', mes)
      .eq('anio', parseInt(anio))
    if (institutoId) pagosQuery = (pagosQuery as any).eq('instituto_id', institutoId)
    const { data: pagos } = await pagosQuery

    const ingresosCuotas = (pagos || [])
      .filter((p: any) => p.tipo === 'cuota' || !p.tipo)
      .reduce((acc: number, p: any) => acc + (p.monto || 0), 0)

    const ingresosMatriculas = (pagos || [])
      .filter((p: any) => p.tipo === 'matricula')
      .reduce((acc: number, p: any) => acc + (p.monto || 0), 0)

    // 2. Obtener registros guardados del estado de resultado
    let regQuery = supabase
      .from('estado_resultado_mensual')
      .select('*')
      .eq('mes', mes)
      .eq('anio', parseInt(anio))
    if (institutoId) regQuery = (regQuery as any).eq('instituto_id', institutoId)
    const { data: registros } = await regQuery

    // 3. Si no existen registros, inicializar con los defaults
    if (!registros || registros.length === 0) {
      const rows = CONCEPTOS_DEFAULT.map(c => ({
        mes,
        anio: parseInt(anio),
        instituto_id: institutoId,
        concepto: c.concepto,
        tipo: c.tipo,
        importe: 0,
        es_automatico: false,
      }))
      const { data: nuevos, error } = await supabase
        .from('estado_resultado_mensual')
        .insert(rows)
        .select()
      if (error) console.error('[estado-resultado GET] init error:', error)

      return NextResponse.json({
        data: nuevos || rows,
        ingresos_cuotas: ingresosCuotas,
        ingresos_matriculas_auto: ingresosMatriculas,
      })
    }

    // 4. Actualizar el concepto "Ingresos por Matrículas" con el valor automático si > 0
    const conceptoMatricula = registros.find((r: any) => r.concepto === 'Ingresos por Matrículas')
    if (conceptoMatricula && ingresosMatriculas > 0 && conceptoMatricula.importe === 0) {
      await supabase
        .from('estado_resultado_mensual')
        .update({ importe: ingresosMatriculas })
        .eq('id', conceptoMatricula.id)
    }

    return NextResponse.json({
      data: registros,
      ingresos_cuotas: ingresosCuotas,
      ingresos_matriculas_auto: ingresosMatriculas,
    })
  } catch (e: any) {
    console.error('[estado-resultado GET] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — Actualizar importe de un concepto (upsert)
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':estado-resultado', { limit: 60, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    const { mes, anio, concepto, tipo, importe } = await req.json()

    if (!mes || !anio || !concepto || !institutoId) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }

    const supabase = sb()
    const { data, error } = await supabase
      .from('estado_resultado_mensual')
      .upsert({
        mes,
        anio: parseInt(anio),
        instituto_id: institutoId,
        concepto,
        tipo: tipo || 'egreso',
        importe: importe || 0,
        updated_at: new Date().toISOString(),
      }, { onConflict: 'mes,anio,instituto_id,concepto' })
      .select()
      .single()

    if (error) {
      console.error('[estado-resultado POST] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[estado-resultado POST] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
