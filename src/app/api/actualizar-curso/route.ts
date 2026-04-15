import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// PATCH — Actualizar campos de un curso (incluye bibliografia)
export async function PATCH(req: NextRequest) {
  try {
    const { id, datos } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id del curso' }, { status: 400 })
    if (!datos || Object.keys(datos).length === 0) {
      return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('cursos')
      .update({ ...datos, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[actualizar-curso] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[actualizar-curso] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — Crear nuevo curso
export async function POST(req: NextRequest) {
  try {
    const { datos, instituto_id } = await req.json()
    if (!datos?.nombre || !instituto_id) {
      return NextResponse.json({ error: 'Faltan campos: nombre, instituto_id' }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('cursos')
      .insert({ ...datos, instituto_id, activo: true })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
