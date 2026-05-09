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

// POST /api/admin-crear-usuario
// Crea un usuario en Supabase Auth + tabla usuarios + tabla profesoras (si rol === profesora)
// Solo puede ser llamado por el director (validado por instituto_id en header)
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':admin-crear-usuario', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { nombre, email, password, rol } = await req.json()

    if (!nombre || !email || !password || !rol) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }
    if (password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres' }, { status: 400 })
    }

    const rolesValidos = ['profesora', 'secretaria', 'coordinadora']
    if (!rolesValidos.includes(rol)) {
      return NextResponse.json({ error: 'Rol no válido' }, { status: 400 })
    }

    const supabase = sb()

    // 1. Crear usuario en Supabase Auth
    const { data: authData, error: authError } = await supabase.auth.admin.createUser({
      email,
      password,
      email_confirm: true, // confirmar email automáticamente
    })

    if (authError) {
      console.error('[admin-crear-usuario] auth error:', authError)
      if (authError.message.includes('already registered')) {
        return NextResponse.json({ error: 'Ya existe un usuario con ese email' }, { status: 400 })
      }
      return NextResponse.json({ error: authError.message }, { status: 500 })
    }

    const userId = authData.user.id

    // 2. Insertar en tabla usuarios
    const color = '#' + Math.floor(Math.random() * 0xffffff).toString(16).padStart(6, '0')
    const { error: usuarioError } = await supabase.from('usuarios').insert({
      id: userId,
      nombre,
      email,
      rol,
      instituto_id: institutoId,
      color,
      activo: true,
    })

    if (usuarioError) {
      console.error('[admin-crear-usuario] usuarios insert error:', usuarioError)
      // Rollback: eliminar el usuario de Auth
      await supabase.auth.admin.deleteUser(userId)
      return NextResponse.json({ error: 'Error al crear el usuario: ' + usuarioError.message }, { status: 500 })
    }

    // 3. Si es profesora, crear registro en tabla profesoras también
    if (rol === 'profesora') {
      const partes = nombre.trim().split(' ')
      const apellido = partes.length >= 2 ? partes.slice(1).join(' ') : partes[0]
      const nombrePila = partes[0]

      const { error: profError } = await supabase.from('profesoras').insert({
        nombre,       // nombre completo en campo nombre para compatibilidad con búsquedas
        apellido,
        email,
        activa: true,
        instituto_id: institutoId,
        usuario_id: userId,  // vínculo directo con auth.uid
        color,
        tipo_contrato: 'hora',
        valor_hora: 0,
        valor_fijo: 0,
      })

      if (profError) {
        // No es crítico — el usuario se creó igual. Solo loguear.
        console.error('[admin-crear-usuario] profesoras insert error:', profError)
      }
    }

    return NextResponse.json({ ok: true, userId })
  } catch (e: any) {
    console.error('[admin-crear-usuario] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
