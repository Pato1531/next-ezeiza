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

const KEYS = [
  'bienvenida', 'comprobante', 'recibo', 'cuota_recordatorio', 'cobranza_deudor',
  'cuota_vencida', 'cobranza_consulta', 'ausencias', 'boletin', 'consulta_lista_espera', 'cumpleanos',
]
const TEXTO_MAX = 1500

// POST /api/plantillas-whatsapp · director y secretaria
// Body: { plantillas: { [key]: texto } }. Texto vacío = volver al texto por defecto.
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director', 'secretaria'])
    if (authError) return authError

    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':plantillas', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const body = await req.json()
    const entrada = body?.plantillas
    if (!entrada || typeof entrada !== 'object') {
      return NextResponse.json({ error: 'Faltan las plantillas' }, { status: 400 })
    }

    const limpio: Record<string, string> = {}
    for (const key of Object.keys(entrada)) {
      if (!KEYS.includes(key)) return NextResponse.json({ error: `Plantilla desconocida: ${key}` }, { status: 400 })
      const texto = entrada[key]
      if (typeof texto !== 'string') return NextResponse.json({ error: 'Texto inválido' }, { status: 400 })
      if (texto.length > TEXTO_MAX) {
        return NextResponse.json({ error: `Cada plantilla puede tener hasta ${TEXTO_MAX} caracteres` }, { status: 400 })
      }
      if (texto.trim()) limpio[key] = texto
    }

    const db = sb()
    // Se guarda el objeto completo: se mezclan los cambios con lo que ya existe.
    const { data: actual, error: readErr } = await db.from('institutos')
      .select('plantillas_whatsapp').eq('id', institutoId).single()
    if (readErr) return NextResponse.json({ error: 'No se pudo leer el instituto' }, { status: 500 })

    const merge: Record<string, string> = { ...(actual?.plantillas_whatsapp || {}) }
    for (const key of Object.keys(entrada)) {
      if (limpio[key]) merge[key] = limpio[key]
      else delete merge[key]
    }

    const { error } = await db.from('institutos').update({ plantillas_whatsapp: merge }).eq('id', institutoId)
    if (error) return NextResponse.json({ error: 'No se pudieron guardar las plantillas' }, { status: 500 })
    return NextResponse.json({ ok: true, plantillas_whatsapp: merge })
  } catch (error: any) {
    console.error('[plantillas]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
