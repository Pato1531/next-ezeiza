import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getInstitutoId, verificarAuthRol } from '@/lib/server-utils'
import { validarConfigAlertas, RANGOS } from '@/lib/alertas'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST /api/alertas-config · director, coordinadora y secretaria
// Guarda la configuración de alertas (institutos.config_alertas) y el umbral de ausencias.
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director', 'coordinadora', 'secretaria'])
    if (authError) return authError

    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':alertas-config', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const update: Record<string, unknown> = {}

    if (body.config !== undefined) {
      const validada = validarConfigAlertas(body.config)
      if (!validada.ok) return NextResponse.json({ error: validada.error }, { status: 400 })
      update.config_alertas = validada.value
    }

    if (body.umbral_ausencias !== undefined) {
      const n = Number(body.umbral_ausencias)
      if (!Number.isInteger(n) || n < RANGOS.umbral.min || n > RANGOS.umbral.max) {
        return NextResponse.json({ error: `El umbral debe estar entre ${RANGOS.umbral.min} y ${RANGOS.umbral.max}` }, { status: 400 })
      }
      update.umbral_ausencias = n
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
    }

    const { data, error } = await sb().from('institutos').update(update).eq('id', institutoId)
      .select('id, config_alertas, umbral_ausencias').single()
    if (error) {
      console.error('[alertas-config]', error)
      return NextResponse.json({ error: 'No se pudieron guardar las alertas' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    console.error('[alertas-config]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
