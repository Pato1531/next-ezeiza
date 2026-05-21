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

// POST — Crear nuevo comunicado
export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const body = await req.json()
    const { titulo, contenido, rol_destino, destinatarios_ids, creado_por } = body

    if (!titulo || !contenido) {
      return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 })
    }

    const insert: Record<string, any> = {
      titulo:      titulo.trim(),
      contenido:   contenido.trim(),
      dirigido_a:   rol_destino || 'todos',
      creado_por:  creado_por || 'Sistema',
    }

    // Agregar instituto_id si está disponible
    if (institutoId) insert.instituto_id = institutoId

    // Agregar destinatarios_ids solo si es modo individual y la columna ya existe
    // (se ignora silenciosamente si la migración aún no corrió)
    if (rol_destino === 'individual' && Array.isArray(destinatarios_ids) && destinatarios_ids.length > 0) {
      insert.destinatarios_ids = destinatarios_ids
    }

    const { data, error } = await sb().from('comunicados').insert(insert).select().single()

    if (error) {
      // Si el error es por columna faltante (migración pendiente), reintentar sin las columnas nuevas
      if (error.message?.includes('destinatarios_ids') || error.message?.includes('schema cache')) {
        delete insert.destinatarios_ids
        const { data: data2, error: error2 } = await sb().from('comunicados').insert(insert).select().single()
        if (error2) return NextResponse.json({ error: error2.message }, { status: 500 })
        return NextResponse.json({ data: data2, warning: 'destinatarios_ids no disponible, ejecutar migración SQL' })
      }
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET — Listar comunicados del instituto
export async function GET(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)

    let q = sb().from('comunicados').select('*').order('created_at', { ascending: false })
    if (institutoId) q = (q as any).eq('instituto_id', institutoId)

    const { data, error } = await q
    if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}
