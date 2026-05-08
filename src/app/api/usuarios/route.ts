import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function getAdminClient() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// GET — Listar todos los usuarios del instituto (para módulo Permisos)
export async function GET(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const admin = getAdminClient()
    const { data, error } = await admin
      .from('usuarios')
      .select('id, nombre, email, rol, color, initials, activo, instituto_id')
      .eq('instituto_id', institutoId)
      .order('nombre', { ascending: true })
    if (error) {
      console.error('[usuarios GET] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    console.error('[usuarios GET] catch:', e)
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':usuarios', { limit: 10, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    const body = await req.json()
    const { accion, ...datos } = body
    const admin = getAdminClient()

    // ── CREAR usuario ──────────────────────────────────────────────────────
    if (accion === 'crear') {
      const { email, password, nombre, rol, color } = datos
      if (!email || !password || !nombre || !rol) {
        return NextResponse.json({ error: 'Faltan datos: email, password, nombre, rol' }, { status: 400 })
      }

      // 1. Crear en Supabase Auth
      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: email.trim().toLowerCase(),
        password,
        email_confirm: true,
        user_metadata: { nombre, rol },
      })
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

      const uid = authData.user.id
      const initials = nombre.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)

      // 2. Insertar en tabla usuarios
      const { error: dbError } = await admin.from('usuarios').upsert({
        id: uid,
        nombre,
        email: email.trim().toLowerCase(),
        rol,
        color: color || '#652f8d',
        initials,
        activo: true,
        ...(institutoId ? { instituto_id: institutoId } : {}),
      })
      if (dbError) {
        // Rollback auth user si falla la DB
        await admin.auth.admin.deleteUser(uid)
        return NextResponse.json({ error: dbError.message }, { status: 400 })
      }

      // 3. Si es profesora, crear registro en profesoras con usuario_id vinculado
      //    CRÍTICO: esperar el resultado y manejar el error explícitamente
      if (rol === 'profesora') {
        const partes = nombre.trim().split(' ')
        const apellido = partes.length >= 2 ? partes.slice(1).join(' ') : partes[0]

        const { error: profInsertError } = await admin.from('profesoras').insert({
          nombre,
          apellido,
          email: email.trim().toLowerCase(),
          activa: true,
          instituto_id: institutoId,
          usuario_id: uid,
          color: color || '#652f8d',
          tipo_contrato: 'hora',
          tarifa_hora: 0,
          sueldo_fijo: 0,
        })

        if (profInsertError) {
          console.error('[usuarios/crear] profesoras insert error:', profInsertError.message)
          // Si falla el insert (ej: ya existe por email), intentar update del registro existente
          const { error: profUpdateError } = await admin.from('profesoras')
            .update({ activa: true, usuario_id: uid, nombre, apellido })
            .eq('email', email.trim().toLowerCase())
            .eq('instituto_id', institutoId)
          if (profUpdateError) {
            console.error('[usuarios/crear] profesoras update fallback error:', profUpdateError.message)
          }
        }
      }

      return NextResponse.json({ ok: true, id: uid })
    }

    // ── CAMBIAR CONTRASEÑA ─────────────────────────────────────────────────
    if (accion === 'cambiar_password') {
      const { user_id, nueva_password } = datos
      if (!user_id || !nueva_password) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
      if (nueva_password.length < 6) return NextResponse.json({ error: 'Mínimo 6 caracteres' }, { status: 400 })
      const { error } = await admin.auth.admin.updateUserById(user_id, { password: nueva_password })
      if (error) return NextResponse.json({ error: error.message }, { status: 400 })
      return NextResponse.json({ ok: true })
    }

    // ── ACTUALIZAR ROL / NOMBRE ────────────────────────────────────────────
    if (accion === 'actualizar') {
      const { user_id, nombre, rol, color } = datos
      if (!user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })
      const updates: Record<string, any> = {}
      if (nombre) updates.nombre = nombre
      if (rol) updates.rol = rol
      if (color) updates.color = color
      await admin.from('usuarios').update(updates).eq('id', user_id)
      if (nombre || rol) {
        await admin.auth.admin.updateUserById(user_id, {
          user_metadata: { ...(nombre ? { nombre } : {}), ...(rol ? { rol } : {}) },
        })
      }
      return NextResponse.json({ ok: true })
    }

    // ── DESACTIVAR usuario — elimina de Auth + marca inactivo en DB ────────
    // Se elimina de Auth para liberar el email si se necesita recrear el usuario
    if (accion === 'desactivar') {
      const { user_id } = datos
      if (!user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })
      // Eliminar de Auth (libera el email)
      await admin.auth.admin.deleteUser(user_id)
      // Marcar inactivo en tabla usuarios (preserva historial)
      await admin.from('usuarios').update({ activo: false }).eq('id', user_id)
      // Si era profesora, desactivar en profesoras también
      await admin.from('profesoras').update({ activa: false }).eq('usuario_id', user_id)
      return NextResponse.json({ ok: true })
    }

    // ── REACTIVAR usuario — solo actualiza flags en DB ─────────────────────
    // Nota: si el usuario fue eliminado de Auth (por desactivar),
    // debe recrearse desde el formulario de Permisos con nuevo email/contraseña
    if (accion === 'reactivar') {
      const { user_id } = datos
      if (!user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })
      await admin.from('usuarios').update({ activo: true }).eq('id', user_id)
      await admin.from('profesoras').update({ activa: true }).eq('usuario_id', user_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (e: any) {
    console.error('[usuarios POST] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
