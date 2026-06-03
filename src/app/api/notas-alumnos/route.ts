// src/app/api/notas-alumnos/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verificarAuth, getInstitutoId } from '@/lib/server-utils'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const { searchParams } = new URL(req.url)
    const alumnoIds = searchParams.get('alumno_ids')?.split(',').filter(Boolean) || []

    if (!alumnoIds.length) {
      return NextResponse.json({ data: [] })
    }

    const { data, error } = await sb()
      .from('notas_alumnos')
      .select('alumno_id, texto, autor, created_at')
      .in('alumno_id', alumnoIds)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
