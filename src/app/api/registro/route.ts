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
  // Rate limit: 3 registros por hora por IP
  const ip = getClientIp(req)
  const rl = rateLimit(ip + ':registro', { limit: 3, windowMs: 60 * 60 * 1000 })
  if (!rl.ok) return rateLimitResponse(rl.resetMs)

  try {
    const {
      instituto_nombre,
      director_nombre,
      director_email,
      director_password,
    } = await req.json()

    // Validaciones básicas
    if (!instituto_nombre?.trim()) {
      return NextResponse.json({ error: 'El nombre del instituto es obligatorio.' }, { status: 400 })
    }
    if (!director_nombre?.trim()) {
      return NextResponse.json({ error: 'Tu nombre es obligatorio.' }, { status: 400 })
    }
    if (!director_email?.includes('@')) {
      return NextResponse.json({ error: 'El email no es válido.' }, { status: 400 })
    }
    if (!director_password || director_password.length < 8) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 8 caracteres.' }, { status: 400 })
    }

    const supabase = sb()

    // Generar slug único
    let slug = slugify(instituto_nombre)
    const { data: slugExiste } = await supabase
      .from('institutos')
      .select('id')
      .eq('slug', slug)
      .single()

    if (slugExiste) {
      slug = slug + '-' + Math.floor(Math.random() * 9000 + 1000)
    }

    // 1. Crear el instituto
    const { data: instituto, error: errorInstituto } = await supabase
      .from('institutos')
      .insert({
        nombre: instituto_nombre.trim(),
        slug,
        plan: 'starter',
        color_primario: '#652f8d',
        activo: true,
      })
      .select()
      .single()

    if (errorInstituto) {
      console.error('[registro] error creando instituto:', errorInstituto)
      return NextResponse.json({ error: 'Error al crear el instituto. Intentá de nuevo.' }, { status: 500 })
    }

    // 2. Crear el usuario en auth.users
    const { data: authData, error: errorAuth } = await supabase.auth.admin.createUser({
      email: director_email.trim().toLowerCase(),
      password: director_password,
      email_confirm: true, // confirmar automáticamente sin email
    })

    if (errorAuth) {
      // Rollback: eliminar el instituto creado
      await supabase.from('institutos').delete().eq('id', instituto.id)
      if (errorAuth.message?.includes('already registered')) {
        return NextResponse.json({ error: 'Ya existe una cuenta con ese email.' }, { status: 400 })
      }
      return NextResponse.json({ error: 'Error al crear el usuario. Intentá de nuevo.' }, { status: 500 })
    }

    // 3. Crear el usuario en la tabla usuarios
    const initials = director_nombre.trim().split(' ')
      .map((n: string) => n[0]?.toUpperCase() || '')
      .slice(0, 2)
      .join('')

    const { error: errorUsuario } = await supabase
      .from('usuarios')
      .insert({
        id: authData.user.id,
        nombre: director_nombre.trim(),
        rol: 'director',
        color: '#652f8d',
        initials,
        activo: true,
        instituto_id: instituto.id,
      })

    if (errorUsuario) {
      // Rollback: eliminar auth user e instituto
      await supabase.auth.admin.deleteUser(authData.user.id)
      await supabase.from('institutos').delete().eq('id', instituto.id)
      return NextResponse.json({ error: 'Error al configurar el usuario. Intentá de nuevo.' }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      instituto: { nombre: instituto.nombre, slug: instituto.slug },
    })

  } catch (e: any) {
    console.error('[registro]', e)
    return NextResponse.json({ error: 'Error inesperado. Intentá de nuevo.' }, { status: 500 })
  }
}
