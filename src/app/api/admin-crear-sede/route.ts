import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function slugify(nombre: string): string {
  return nombre.toLowerCase().normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)
}

export async function POST(req: NextRequest) {
  try {
    const { instituto_nombre, director_nombre, director_email, director_password } = await req.json()

    if (!instituto_nombre?.trim()) return NextResponse.json({ error: 'Nombre del instituto obligatorio' }, { status: 400 })
    if (!director_nombre?.trim()) return NextResponse.json({ error: 'Nombre del director obligatorio' }, { status: 400 })
    const emailOk = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(director_email?.trim() || '')
    if (!emailOk) return NextResponse.json({ error: 'Email no válido' }, { status: 400 })
    if (!director_password || director_password.length < 6) return NextResponse.json({ error: 'Contraseña mínimo 6 caracteres' }, { status: 400 })

    const supabase = sb()

    // 1. Slug único
    let slug = slugify(instituto_nombre)
    const { data: slugExiste } = await supabase.from('institutos').select('id').eq('slug', slug).single()
    if (slugExiste) slug = slug + '-' + Math.floor(Math.random() * 9000 + 1000)

    // 2. Crear instituto
    const { data: instituto, error: errInst } = await supabase
      .from('institutos')
      .insert({ nombre: instituto_nombre.trim(), slug, plan: 'standard', activo: true })
      .select().single()

    if (errInst) {
      console.error('[admin-crear-sede] instituto:', errInst)
      return NextResponse.json({ error: 'Error al crear instituto: ' + errInst.message }, { status: 500 })
    }

    // 3. Crear usuario en Auth
    // Log para diagnóstico: confirmar URL del proyecto
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL || 'NO CONFIGURADA'
    console.log('[admin-crear-sede] usando Supabase URL:', supabaseUrl.slice(0, 40))
    const { data: authData, error: errAuth } = await supabase.auth.admin.createUser({
      email: director_email.trim().toLowerCase(),
      password: director_password,
      email_confirm: true,
    })

    if (errAuth) {
      await supabase.from('institutos').delete().eq('id', instituto.id)
      console.error('[admin-crear-sede] auth:', errAuth)
      const msg = errAuth.message || ''
      let userMsg = 'Error al crear usuario: ' + msg
      if (msg.includes('already registered') || msg.includes('already exists')) userMsg = 'Ya existe una cuenta con ese email'
      else if (msg.includes('Database error')) userMsg = 'Error de base de datos en Supabase Auth. Verificá que el SUPABASE_SERVICE_ROLE_KEY en Vercel sea del proyecto correcto (Next Ezeiza, no App Gestion Docente).'
      else if (msg.includes('invalid')) userMsg = 'Email con formato inválido según Supabase: ' + msg
      return NextResponse.json({ error: userMsg }, { status: 400 })
    }

    // 4. Crear registro en tabla usuarios
    const initials = director_nombre.trim().split(' ').map((n: string) => n[0]?.toUpperCase() || '').slice(0, 2).join('')

    const { error: errUser } = await supabase.from('usuarios').insert({
      id: authData.user.id,
      nombre: director_nombre.trim(),
      email: director_email.trim().toLowerCase(),
      rol: 'director',
      color: '#652f8d',
      initials,
      activo: true,
      instituto_id: instituto.id,
    })

    if (errUser) {
      await supabase.auth.admin.deleteUser(authData.user.id)
      await supabase.from('institutos').delete().eq('id', instituto.id)
      console.error('[admin-crear-sede] usuario:', errUser)
      return NextResponse.json({ error: 'Error al crear usuario: ' + errUser.message }, { status: 500 })
    }

    return NextResponse.json({
      ok: true,
      instituto_id: instituto.id,
      instituto: { nombre: instituto.nombre, slug: instituto.slug },
    })

  } catch (e: any) {
    console.error('[admin-crear-sede] catch:', e)
    return NextResponse.json({ error: 'Error inesperado: ' + e.message }, { status: 500 })
  }
}
