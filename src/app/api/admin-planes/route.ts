import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { MODULOS_PLAN, MODULOS_IDS } from '@/lib/modulos-plan'
import { modulosEfectivos, ajusteValido } from '@/lib/modulos-efectivos'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const PLANES_VALIDOS = ['standard', 'premium']

function claveValida(req: NextRequest): boolean {
  const expected = process.env.ADMIN_KEY || ''
  return Boolean(expected) && req.headers.get('x-admin-key') === expected
}

// GET /api/admin-planes · planes con precio, promo y módulos; catálogo de módulos
export async function GET(req: NextRequest) {
  try {
    const rl = rateLimit(getClientIp(req) + ':admin-planes', { limit: 60, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)
    if (!claveValida(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { data, error } = await sb()
      .from('planes')
      .select('codigo, nombre, precio_mensual, moneda, promo_porcentaje, promo_meses, modulos')
      .order('codigo')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ planes: data || [], catalogo: MODULOS_PLAN })
  } catch (error: any) {
    console.error('[admin-planes GET]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// POST /api/admin-planes · guarda precio, promo y módulos de un plan
export async function POST(req: NextRequest) {
  try {
    const rl = rateLimit(getClientIp(req) + ':admin-planes-post', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)
    if (!claveValida(req)) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { codigo, precio_mensual, promo_porcentaje, promo_meses, modulos } = await req.json()
    if (!PLANES_VALIDOS.includes(codigo)) return NextResponse.json({ error: 'Plan no válido' }, { status: 400 })

    const precio = Number(precio_mensual)
    if (!Number.isFinite(precio) || precio < 0 || precio > 100000000) {
      return NextResponse.json({ error: 'El precio debe ser un número entre 0 y 100.000.000' }, { status: 400 })
    }
    const promoPct = Number(promo_porcentaje)
    if (!Number.isInteger(promoPct) || promoPct < 0 || promoPct > 100) {
      return NextResponse.json({ error: 'El descuento debe ser un entero entre 0 y 100' }, { status: 400 })
    }
    const promoMeses = Number(promo_meses)
    if (!Number.isInteger(promoMeses) || promoMeses < 0 || promoMeses > 12) {
      return NextResponse.json({ error: 'Los meses de promo deben ser un entero entre 0 y 12' }, { status: 400 })
    }
    if (!Array.isArray(modulos) || !modulos.every((m: unknown) => typeof m === 'string' && MODULOS_IDS.includes(m))) {
      return NextResponse.json({ error: 'Lista de módulos no válida' }, { status: 400 })
    }

    const supabase = sb()
    const modulosNuevos = Array.from(new Set<string>(modulos))
    const { data, error } = await supabase
      .from('planes')
      .update({
        precio_mensual: Math.round(precio * 100) / 100,
        promo_porcentaje: promoPct,
        promo_meses: promoMeses,
        modulos: modulosNuevos,
        actualizado_at: new Date().toISOString(),
      })
      .eq('codigo', codigo)
      .select()
      .single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar el plan' }, { status: 500 })

    // Recalcula los módulos activos de los clientes de este plan, respetando sus ajustes de soporte
    const { data: clientes } = await supabase
      .from('institutos')
      .select('id, modulos_override')
      .eq('plan', codigo)
    await Promise.all(
      (clientes || []).map((c: any) =>
        supabase
          .from('institutos')
          .update({ modulos_activos: modulosEfectivos(modulosNuevos, ajusteValido(c.modulos_override) ? c.modulos_override : {}) })
          .eq('id', c.id)
      )
    )
    return NextResponse.json({ ok: true, plan: data })
  } catch (error: any) {
    console.error('[admin-planes POST]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
