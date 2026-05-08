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

export async function GET(req: NextRequest) {
  try {
    const institutoId = req.headers.get('x-instituto-id')
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const admin = getAdminClient()
    const { data, error } = await admin.from('usuarios')
      .select('id, nombre, email, rol, color, activo, initials')
      .eq('instituto_id', institutoId)
      .order('nombre')
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { accion, ...datos } = body
    const admin = getAdminClient()
    const institutoId = req.headers.get('x-instituto-id')

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
        id: uid, nombre, rol, color: color || '#652f8d', initials, activo: true,
        instituto_id: institutoId,
      })
      if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })

      // Si es profesora, crear registro en profesoras con usuario_id vinculado
      if (rol === 'profesora') {
        const partes = nombre.trim().split(' ')
        const apellido = partes.length >= 2 ? partes.slice(1).join(' ') : partes[0]
        await admin.from('profesoras').insert({
          nombre,
          apellido,
          email,
          activa: true,
          instituto_id: institutoId,
          usuario_id: uid,
          color: color || '#652f8d',
          tipo_contrato: 'hora',
          valor_hora: 0,
          valor_fijo: 0,
        }).then(({ error: e }) => {
          if (e) console.error('[usuarios/crear] profesoras insert:', e.message)
        })
      }

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

    // Desactivar usuario — elimina de Auth + marca inactivo en DB
    // Se elimina de Auth para liberar el email y poder recrearlo si es necesario
    if (accion === 'desactivar') {
      const { user_id } = datos
      if (!user_id) return NextResponse.json({ error: 'Falta user_id' }, { status: 400 })
      // Eliminar de Supabase Auth (libera el email)
      await admin.auth.admin.deleteUser(user_id)
      // Marcar inactivo en tabla usuarios (se conserva para historial)
      await admin.from('usuarios').update({ activo: false }).eq('id', user_id)
      // Si era profesora, desactivar en profesoras también
      await admin.from('profesoras').update({ activa: false }).eq('usuario_id', user_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
