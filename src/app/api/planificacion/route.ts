// src/app/api/planificacion/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstitutoId } from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// Helper: verificar que un registro de planificacion pertenece al instituto
async function perteneceAlInstituto(id: string, institutoId: string | null): Promise<boolean> {
  if (!institutoId) return false
  // planificacion_cursos → cursos → instituto_id
  const { data } = await sb()
    .from('planificacion_cursos')
    .select('curso_id, cursos!inner(instituto_id)')
    .eq('id', id)
    .single()
  return (data as any)?.cursos?.instituto_id === institutoId
}

// POST — crear unidad(es)
export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const body = await req.json()

    // Bulk insert (importar desde Excel)
    if (body.bulk && Array.isArray(body.bulk)) {
      const inserts = body.bulk.map((u: any) => ({
        ...u,
        ...(institutoId ? { instituto_id: institutoId } : {}),
      }))
      const { data, error } = await sb().from('planificacion_cursos').insert(inserts).select()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data })
    }

    // Insert individual — verificar que el curso_id pertenece a este instituto
    const { curso_id, titulo, descripcion, estado, orden, fecha_inicio, fecha_cierre } = body
    if (!curso_id || !titulo) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    // Validar que el curso pertenece a este instituto
    if (institutoId) {
      const { data: curso } = await sb()
        .from('cursos').select('instituto_id').eq('id', curso_id).single()
      if (!curso || (curso as any).instituto_id !== institutoId) {
        return NextResponse.json({ error: 'Curso no encontrado en este instituto' }, { status: 403 })
      }
    }

    const { data, error } = await sb()
      .from('planificacion_cursos')
      .insert({
        curso_id, titulo, descripcion: descripcion || null,
        estado: estado || 'pendiente', orden: orden ?? 0,
        fecha_inicio: fecha_inicio || null, fecha_cierre: fecha_cierre || null,
        ...(institutoId ? { instituto_id: institutoId } : {}),
      })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PUT — actualizar unidad (solo si pertenece al instituto)
export async function PUT(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const { id, ...campos } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    // Verificar pertenencia al instituto antes de modificar
    const autorizado = await perteneceAlInstituto(id, institutoId)
    if (!autorizado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const update: any = {}
    const permitidos = ['titulo', 'descripcion', 'estado', 'orden', 'fecha_inicio', 'fecha_cierre']
    permitidos.forEach(k => { if (k in campos) update[k] = campos[k] })

    const { error } = await sb().from('planificacion_cursos').update(update).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — eliminar unidad (solo si pertenece al instituto)
export async function DELETE(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    // Verificar pertenencia al instituto antes de eliminar
    const autorizado = await perteneceAlInstituto(id, institutoId)
    if (!autorizado) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
    }

    const { error } = await sb().from('planificacion_cursos').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
