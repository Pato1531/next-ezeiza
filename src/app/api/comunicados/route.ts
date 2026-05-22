// src/app/api/comunicados/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

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

// GET — Listar comunicados activos filtrados por instituto
export async function GET(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido', data: [] }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('comunicados')
      .select('*')
      .eq('activo', true)
      .eq('instituto_id', institutoId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

// POST — Crear nuevo comunicado
export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const body = await req.json()
    const { titulo, contenido, rol_destino, destinatarios_ids, creado_por, autor_id } = body

    if (!titulo || !contenido) {
      return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 })
    }

    const insert: Record<string, any> = {
      titulo:       titulo.trim(),
      contenido:    contenido.trim(),
      rol_destino:  rol_destino || 'todos',
      autor_nombre: creado_por || 'Sistema',
      activo:       true,
      instituto_id: institutoId,
    }

    if (autor_id) insert.autor_id = autor_id

    if (rol_destino === 'individual' && Array.isArray(destinatarios_ids) && destinatarios_ids.length > 0) {
      insert.destinatarios_ids = destinatarios_ids
    }

    const { data, error } = await sb().from('comunicados').insert(insert).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — Archivar comunicado (activo: false)
// Usado por el hook eliminar() en useComunicados
export async function PATCH(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const body = await req.json()
    const { id, activo } = body

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Doble filtro: id + instituto_id — nunca puede archivar comunicados de otra sede
    const { data, error } = await sb()
      .from('comunicados')
      .update({ activo: activo ?? false })
      .eq('id', id)
      .eq('instituto_id', institutoId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
