import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function slugify(nombre: string): string {
  return nombre
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export async function POST(req: NextRequest) {
  const ip = getClientIp(req)
  const rl = rateLimit(ip + ':registro', { limit: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.ok) return rateLimitResponse(rl.resetMs)

  try {
    const { instituto_nombre, director_nombre, director_email, director_password } = await req.json()

    if (!instituto_nombre?.trim())
      return NextResponse.json({ error: 'El nombre del instituto es obligatorio.' }, { status: 400 })
    if (!director_nombre?.trim())
      return NextResponse.json({ error: 'Tu nombre es obligatorio.' }, { status: 400 })
    if (!director_email?.includes('@'))
      return NextResponse.json({ error: 'El email no es válido.' }, { status: 400 })
    if (!director_password || director_password.length < 8)
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 })

    const supabase = sb()

    // Slug único
    let slug = slugify(instituto_nombre)
    const { data: slugExiste } = await supabase
      .from('institutos').select('id').eq('slug', slug).single()
    if (slugExiste) slug = slug + '-' + Math.floor(Math.random() * 9000 + 1000)

    // 1. Crear instituto
    const { data: instituto, error: errorInstituto } = await supabase
      .from('institutos')
      .insert({ nombre: instituto_nombre.trim(), slug, plan: 'starter', color_primario: '#652f8d', activo: true })
      .select().single()

    if (errorInstituto) {
      console.error('[registro:instituto]', errorInstituto)
      return NextResponse.json({ error: 'Error al crear el instituto: ' + errorInstituto.message }, { status: 500 })
    }

    // 2. Crear usuario en auth
    const { data: authData, error: errorAuth } = await supabase.auth.admin.createUser({
      email: director_email.trim().toLowerCase(),
      password: director_password,
      email_confirm: true,
    })

    if (errorAuth) {
      await supabase.from('institutos').delete().eq('id', instituto.id)
      console.error('[registro:auth]', errorAuth)
      if (errorAuth.message?.includes('already registered'))
        return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 400 })
      return NextResponse.json({ error: 'Error al crear usuario: ' + errorAuth.message }, { status: 500 })
    }

    // 3. Crear registro en tabla usuarios
    const initials = director_nombre.trim().split(' ')
      .map((n: string) => n[0]?.toUpperCase() || '').slice(0, 2).join('')

    const emailNormalizado = director_email.trim().toLowerCase()

    const { error: errorUsuario } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        nombre: director_nombre.trim(),
        email: emailNormalizado,
        rol: 'director',
        color: '#652f8d',
        initials,
        activo: true,
        instituto_id: instituto.id,
      })

    if (errorUsuario) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      await supabase.from('institutos').delete().eq('id', instituto.id)
      console.error('[registro:usuario]', errorUsuario)
      return NextResponse.json({ error: 'Error al configurar usuario: ' + errorUsuario.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, instituto: { nombre: instituto.nombre, slug: instituto.slug } })

  } catch (e: any) {
    console.error('[registro:catch]', e)
    return NextResponse.json({ error: 'Error inesperado: ' + e.message }, { status: 500 })
  }
}
