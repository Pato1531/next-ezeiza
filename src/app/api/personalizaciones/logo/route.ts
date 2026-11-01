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

const MAX_BYTES = 300 * 1024
const EXT: Record<string, string> = { 'image/png': 'png', 'image/jpeg': 'jpg', 'image/webp': 'webp' }

// POST /api/personalizaciones/logo · solo director · multipart con campo "archivo"
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':logo', { limit: 10, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const form = await req.formData()
    const archivo = form.get('archivo')
    if (!(archivo instanceof File)) {
      return NextResponse.json({ error: 'Falta el archivo del logo' }, { status: 400 })
    }
    const ext = EXT[archivo.type]
    if (!ext) return NextResponse.json({ error: 'El logo debe ser PNG, JPG o WEBP' }, { status: 400 })
    if (archivo.size > MAX_BYTES) return NextResponse.json({ error: 'El logo no puede pesar más de 300 KB' }, { status: 400 })

    const db = sb()
    const path = `${institutoId}/logo-${Date.now()}.${ext}`
    const bytes = Buffer.from(await archivo.arrayBuffer())
    const { error: upErr } = await db.storage.from('logos').upload(path, bytes, {
      contentType: archivo.type,
      upsert: false,
    })
    if (upErr) {
      console.error('[logo upload]', upErr)
      return NextResponse.json({ error: 'No se pudo subir el logo' }, { status: 500 })
    }

    const { data: pub } = db.storage.from('logos').getPublicUrl(path)
    const { error: dbErr } = await db.from('institutos').update({ logo_url: pub.publicUrl }).eq('id', institutoId)
    if (dbErr) {
      console.error('[logo db]', dbErr)
      return NextResponse.json({ error: 'El logo se subió pero no se pudo guardar' }, { status: 500 })
    }
    return NextResponse.json({ ok: true, logo_url: pub.publicUrl })
  } catch (error: any) {
    console.error('[logo]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE /api/personalizaciones/logo · quita el logo (solo director)
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError
    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const { error } = await sb().from('institutos').update({ logo_url: null }).eq('id', institutoId)
    if (error) return NextResponse.json({ error: 'No se pudo quitar el logo' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
