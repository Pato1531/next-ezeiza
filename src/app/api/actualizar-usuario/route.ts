import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// POST /api/actualizar-usuario
// Actualiza campos de un usuario (rol, nombre, etc.)
// Solo puede modificar usuarios del mismo instituto
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':actualizar-usuario', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id, datos } = await req.json()
    if (!id || !datos) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }

    // Campos permitidos para actualizar
    const camposPermitidos = ['rol', 'nombre', 'color']
    const update: Record<string, any> = {}
    for (const k of camposPermitidos) {
      if (datos[k] !== undefined) update[k] = datos[k]
    }

    if (Object.keys(update).length === 0) {
      return NextResponse.json({ error: 'No hay campos válidos para actualizar' }, { status: 400 })
    }

    const supabase = sb()

    // Verificar que el usuario pertenece al mismo instituto
    const { data: check } = await supabase
      .from('usuarios')
      .select('id')
      .eq('id', id)
      .eq('instituto_id', institutoId)
      .single()

    if (!check) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }

    const { error } = await supabase
      .from('usuarios')
      .update(update)
      .eq('id', id)

    if (error) {
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[actualizar-usuario] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
