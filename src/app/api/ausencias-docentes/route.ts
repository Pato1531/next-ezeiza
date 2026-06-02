// src/app/api/ausencias-docentes/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verificarAuthRol, getInstitutoId } from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// GET — Listar ausencias de una profesora
export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director', 'coordinadora'])
    if (authError) return authError

    const { searchParams } = new URL(req.url)
    const profesoraId = searchParams.get('profesora_id')
    if (!profesoraId) return NextResponse.json({ error: 'profesora_id requerido' }, { status: 400 })

    const { data, error } = await sb()
      .from('ausencias_docentes')
      .select('*')
      .eq('profesora_id', profesoraId)
      .order('fecha', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// POST — Registrar ausencia
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    const body = await req.json()
    const { profesora_id, fecha, tipo, horas_perdidas, nota, creado_por } = body

    if (!profesora_id || !fecha) {
      return NextResponse.json({ error: 'profesora_id y fecha son requeridos' }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('ausencias_docentes')
      .insert({
        profesora_id,
        instituto_id: institutoId,
        fecha,
        tipo: tipo || 'injustificada',
        horas_perdidas: horas_perdidas || 0,
        nota: nota?.trim() || null,
        creado_por: creado_por || null,
      })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — Eliminar ausencia
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { error } = await sb().from('ausencias_docentes').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
