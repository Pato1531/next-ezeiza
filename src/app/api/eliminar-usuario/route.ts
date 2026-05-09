import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getInstitutoId , verificarAuthRol} from '@/lib/server-utils'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// getInstitutoId imported from @/lib/server-utils

// POST /api/eliminar-usuario
// Desactiva el acceso de un colaborador (no borra auth.users para preservar historial)
// Solo puede eliminar usuarios del mismo instituto y no puede eliminar directores
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':eliminar-usuario', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { id } = await req.json()
    if (!id) {
      return NextResponse.json({ error: 'Falta el id de usuario' }, { status: 400 })
    }

    const supabase = sb()

    // Verificar que el usuario pertenece al instituto y no es director
    const { data: usuario } = await supabase
      .from('usuarios')
      .select('id, rol')
      .eq('id', id)
      .eq('instituto_id', institutoId)
      .single()

    if (!usuario) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 404 })
    }
    if (usuario.rol === 'director') {
      return NextResponse.json({ error: 'No se puede eliminar el director' }, { status: 403 })
    }

    // Deshabilitar en Auth (no borrar — preservar historial)
    await supabase.auth.admin.updateUser(id, { ban_duration: '87600h' }) // 10 años = baja efectiva

    // Marcar como inactivo en tabla usuarios
    await supabase.from('usuarios').update({ activo: false }).eq('id', id)

    // Si era profesora, desactivar en tabla profesoras también
    await supabase.from('profesoras').update({ activa: false }).eq('usuario_id', id)

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    console.error('[eliminar-usuario] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
