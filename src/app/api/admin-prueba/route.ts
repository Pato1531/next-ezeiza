import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { MODULOS_IDS } from '@/lib/modulos-plan'
import { modulosEfectivos, ajusteValido } from '@/lib/modulos-efectivos'
import { DIAS_PRUEBA, fechaFinPrueba, estadoPrueba } from '@/lib/prueba'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function claveValida(req: NextRequest): boolean {
  const expected = process.env.ADMIN_KEY || ''
  return Boolean(expected) && req.headers.get('x-admin-key') === expected
}

const PLANES_VALIDOS = ['standard', 'premium']

// POST /api/admin-prueba · solo panel admin
// { instituto_id, accion: 'extender' }                 → suma 7 días desde el fin actual (o desde hoy si ya venció)
// { instituto_id, accion: 'convertir', plan }          → termina la prueba y pasa al plan elegido
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(getClientIp(req) + ':admin-prueba', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)
    if (!claveValida(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const institutoId = typeof body.instituto_id === 'string' ? body.instituto_id : ''
    if (!institutoId) return NextResponse.json({ error: 'Falta el instituto' }, { status: 400 })

    const supabase = sb()
    const { data: inst, error: errInst } = await supabase
      .from('institutos')
      .select('id, plan, prueba_hasta, modulos_override')
      .eq('id', institutoId)
      .single()
    if (errInst || !inst) return NextResponse.json({ error: 'Instituto no encontrado' }, { status: 404 })

    if (body.accion === 'extender') {
      // Si la prueba todavía vale, se suma desde su fin; si ya venció, desde hoy
      const base = Math.max(Date.now(), inst.prueba_hasta ? Date.parse(inst.prueba_hasta) : 0)
      const nuevaFecha = new Date(base + DIAS_PRUEBA * 86400000).toISOString()
      const { error } = await supabase
        .from('institutos')
        .update({ prueba_hasta: nuevaFecha, modulos_activos: MODULOS_IDS })
        .eq('id', institutoId)
      if (error) return NextResponse.json({ error: 'No se pudo extender la prueba' }, { status: 500 })
      return NextResponse.json({ ok: true, prueba_hasta: nuevaFecha })
    }

    if (body.accion === 'convertir') {
      const plan = body.plan
      if (!PLANES_VALIDOS.includes(plan)) return NextResponse.json({ error: 'Plan no válido' }, { status: 400 })
      const { data: planRow } = await supabase.from('planes').select('modulos').eq('codigo', plan).single()
      if (!planRow) return NextResponse.json({ error: 'El plan no está configurado' }, { status: 400 })
      const ajuste = ajusteValido(inst.modulos_override) ? inst.modulos_override : {}
      const efectivos = modulosEfectivos(planRow.modulos || [], ajuste)
      const { error } = await supabase
        .from('institutos')
        .update({ plan, prueba_hasta: null, modulos_activos: efectivos })
        .eq('id', institutoId)
      if (error) return NextResponse.json({ error: 'No se pudo pasar al plan' }, { status: 500 })
      return NextResponse.json({ ok: true, plan, modulos_activos: efectivos })
    }

    return NextResponse.json({ error: 'Acción no válida' }, { status: 400 })
  } catch (error: any) {
    console.error('[admin-prueba]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
