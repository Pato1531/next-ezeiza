import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function getAdmin() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// GET — lista todos los usuarios del instituto (para módulo Permisos)
export async function GET(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const admin = getAdmin()
    let q = admin.from('usuarios')
      .select('id, nombre, email, rol, color, initials, activo, permisos_custom')
      .order('rol').order('nombre')
    if (institutoId) q = (q as any).eq('instituto_id', institutoId)
    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':usuarios', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    const body = await req.json()
    const { accion, ...datos } = body
    const admin = getAdmin()

    // ── CREAR usuario ──────────────────────────────────────────────────────
    if (accion === 'crear') {
      const { email, password, nombre, rol, color } = datos
      if (!email || !password || !nombre || !rol)
        return NextResponse.json({ error: 'Faltan datos: email, password, nombre, rol' }, { status: 400 })

      const { data: authData, error: authError } = await admin.auth.admin.createUser({
        email: email.trim().toLowerCase(), password,
        email_confirm: true, user_metadata: { nombre, rol }
      })
      if (authError) return NextResponse.json({ error: authError.message }, { status: 400 })

      const uid = authData.user.id
      const initials = nombre.split(' ').map((p: string) => p[0]).join('').toUpperCase().slice(0, 2)
      const { error: dbError } = await admin.from('usuarios').upsert({
        id: uid, nombre, email: email.trim().toLowerCase(), rol,
        color: color || '#652f8d', initials, activo: true,
        ...(institutoId ? { instituto_id: institutoId } : {})
      })
      if (dbError) return NextResponse.json({ error: dbError.message }, { status: 400 })
      return NextResponse.json({ ok: true, id: uid })
    }

    // ── ACTUALIZAR PERMISOS CUSTOM ─────────────────────────────────────────
    if (accion === 'actualizar_permisos') {
      const { user_id, permisos } = datos
      if (!user_id) return NextResponse.json({ error: 'user_id requerido' }, { status: 400 })
      // Si permisos es null → resetear a defaults del rol
      const { error } = await admin.from('usuarios')
        .update({ permisos_custom: permisos ?? null })
        .eq('id', user_id)
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true })
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

    // ── DESACTIVAR ────────────────────────────────────────────────────────
    if (accion === 'desactivar') {
      const { user_id } = datos
      await admin.from('usuarios').update({ activo: false }).eq('id', user_id)
      return NextResponse.json({ ok: true })
    }

    // ── REACTIVAR ─────────────────────────────────────────────────────────
    if (accion === 'reactivar') {
      const { user_id } = datos
      await admin.from('usuarios').update({ activo: true }).eq('id', user_id)
      return NextResponse.json({ ok: true })
    }

    return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
