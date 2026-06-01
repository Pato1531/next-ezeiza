// src/app/api/boletin-token/route.ts
// Genera un token temporal (48hs) para compartir un boletín sin login.
// Solo usuarios autenticados pueden crear tokens.

import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verificarAuth } from '@/lib/server-utils'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function generarToken(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789'
  let token = ''
  for (let i = 0; i < 32; i++) {
    token += chars[Math.floor(Math.random() * chars.length)]
  }
  return token
}

export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const { alumno_id, curso_id, periodo, instituto_id } = await req.json()

    if (!alumno_id || !curso_id || !periodo) {
      return NextResponse.json({ error: 'alumno_id, curso_id y periodo son requeridos' }, { status: 400 })
    }

    const token = generarToken()
    const expiresAt = new Date(Date.now() + 48 * 60 * 60 * 1000).toISOString()

    const { data, error } = await sb()
      .from('boletin_tokens')
      .insert({
        token,
        alumno_id,
        curso_id,
        periodo,
        instituto_id: instituto_id || null,
        expires_at: expiresAt,
        usado: false,
      })
      .select('token, expires_at')
      .single()

    if (error) {
      console.error('[boletin-token POST]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ token: data.token, expires_at: data.expires_at })
  } catch (e: any) {
    console.error('[boletin-token POST] catch:', e?.message)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
