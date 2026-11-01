import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getInstitutoId, verificarAuthRol } from '@/lib/server-utils'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

const HEX = /^#[0-9a-fA-F]{6}$/
const UMBRAL_MIN = 1
const UMBRAL_MAX = 10
const NOMBRE_MAX = 80

// POST /api/personalizaciones · solo director
// Actualiza nombre, color_primario y umbral_ausencias del instituto.
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':personalizaciones', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const update: Record<string, string | number> = {}

    if (body.nombre !== undefined) {
      const nombre = typeof body.nombre === 'string' ? body.nombre.trim() : ''
      if (!nombre || nombre.length > NOMBRE_MAX) {
        return NextResponse.json({ error: `El nombre debe tener entre 1 y ${NOMBRE_MAX} caracteres` }, { status: 400 })
      }
      update.nombre = nombre
    }

    if (body.color_primario !== undefined) {
      if (typeof body.color_primario !== 'string' || !HEX.test(body.color_primario)) {
        return NextResponse.json({ error: 'El color no es válido' }, { status: 400 })
      }
      update.color_primario = body.color_primario.toLowerCase()
    }

    if (body.umbral_ausencias !== undefined) {
      const n = Number(body.umbral_ausencias)
      if (!Number.isInteger(n) || n < UMBRAL_MIN || n > UMBRAL_MAX) {
        return NextResponse.json({ error: `El umbral debe estar entre ${UMBRAL_MIN} y ${UMBRAL_MAX}` }, { status: 400 })
      }
      update.umbral_ausencias = n
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No hay cambios para guardar' }, { status: 400 })
    }

    const { data, error } = await sb().from('institutos').update(update).eq('id', institutoId)
      .select('id, nombre, color_primario, umbral_ausencias').single()
    if (error) {
      console.error('[personalizaciones]', error)
      return NextResponse.json({ error: 'No se pudieron guardar los cambios' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    console.error('[personalizaciones]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
