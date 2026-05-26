// src/app/api/agenda-eventos/route.ts
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

function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// GET — Listar eventos de agenda filtrados por instituto
export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido', data: [] }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('agenda_eventos')
      .select('*')
      .eq('instituto_id', institutoId)
      .order('fecha')
      .order('hora_inicio')

    if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

// DELETE — Eliminar evento por id (solo del mismo instituto)
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const body = await req.json()
    const { id } = body
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { error } = await sb()
      .from('agenda_eventos')
      .delete()
      .eq('id', id)
      .eq('instituto_id', institutoId)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
