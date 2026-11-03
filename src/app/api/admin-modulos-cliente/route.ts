import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { MODULOS_IDS } from '@/lib/modulos-plan'
import { ajustarModulo, ajusteValido, modulosEfectivos, MODULOS_SIEMPRE, AjusteModulos } from '@/lib/modulos-efectivos'

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

// POST /api/admin-modulos-cliente · solo panel admin
// { instituto_id, modulo, activo: true | false | null }  → ajusta un módulo (null = volver al plan)
// { instituto_id, reset: true }                          → vuelve todos los módulos al plan
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(getClientIp(req) + ':admin-modulos-cliente', { limit: 60, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)
    if (!claveValida(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const institutoId = typeof body.instituto_id === 'string' ? body.instituto_id : ''
    if (!institutoId) return NextResponse.json({ error: 'Falta el instituto' }, { status: 400 })

    const supabase = sb()
    const { data: inst, error: errInst } = await supabase
      .from('institutos')
      .select('id, plan, modulos_override')
      .eq('id', institutoId)
      .single()
    if (errInst || !inst) return NextResponse.json({ error: 'Instituto no encontrado' }, { status: 404 })

    const { data: plan } = await supabase
      .from('planes')
      .select('modulos')
      .eq('codigo', inst.plan)
      .single()
    if (!plan) return NextResponse.json({ error: 'El instituto no tiene un plan válido' }, { status: 400 })
    const enPlan: string[] = Array.isArray(plan.modulos) ? plan.modulos : []

    let nuevoAjuste: AjusteModulos
    if (body.reset === true) {
      nuevoAjuste = {}
    } else {
      const modulo = body.modulo
      const activo = body.activo
      if (!MODULOS_IDS.includes(modulo)) return NextResponse.json({ error: 'Módulo no válido' }, { status: 400 })
      if (activo !== true && activo !== false && activo !== null) {
        return NextResponse.json({ error: 'Valor no válido' }, { status: 400 })
      }
      if (activo === false && MODULOS_SIEMPRE.includes(modulo)) {
        return NextResponse.json({ error: 'Este módulo no se puede desactivar' }, { status: 400 })
      }
      const actual: AjusteModulos = ajusteValido(inst.modulos_override) ? inst.modulos_override : {}
      nuevoAjuste = ajustarModulo(actual, modulo, activo, enPlan.includes(modulo))
    }

    const efectivos = modulosEfectivos(enPlan, nuevoAjuste)
    const { error } = await supabase
      .from('institutos')
      .update({ modulos_override: nuevoAjuste, modulos_activos: efectivos })
      .eq('id', institutoId)
    if (error) return NextResponse.json({ error: 'No se pudo guardar' }, { status: 500 })

    return NextResponse.json({ ok: true, modulos_activos: efectivos, modulos_override: nuevoAjuste })
  } catch (error: any) {
    console.error('[admin-modulos-cliente]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
