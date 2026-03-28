import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

// Admin client con service role — solo se usa server-side
function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { accion, ...datos } = body
    const admin = getAdminClient()

    // Crear usuario nuevo
    if (accion === 'crear') {
      const { email, password, nombre, rol, color } = datos
      if (!email || !password || !nombre || !rol) {
        return NextResponse.json({ error: 'Faltan datos obligatorios' }, { status: 400 })
      }

      // Crear en Auth
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { nombre, rol }
      })
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

      const uid = authData.user.id
      const initials = nombre.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)

      // Insertar en tabla usuarios
      const { error: dbError } = await admin.from('usuarios').upsert({
        id: uid, nombre, rol, color: color || '#652f8d', initials, activo: true
      })
      if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })

      return NextResponse.json({ ok: true, id: uid })
    }

    // Cambiar contraseña
    if (accion === 'cambiar_password') {
      const { user_id, nueva_password } = datos
      if (!user_id || !nueva_password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
      if (nueva_password.length < 6) return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })

      const { error } = await admin.auth.admin.updateUserById(user_id, { password: nueva_password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // Actualizar rol/nombre en auth metadata
    if (accion === 'actualizar_metadata') {
      const { user_id, nombre, rol } = datos
      const { error } = await admin.auth.admin.updateUserById(user_id, {
        user_metadata: { nombre, rol }
      })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // Desactivar usuario
    if (accion === 'desactivar') {
      const { user_id } = datos
      await admin.from('usuarios').update({ activo: false }).eq('id', user_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
