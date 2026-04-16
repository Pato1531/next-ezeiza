import { NextRequest, NextResponse } from 'next/server'
import { getInstitutoId } from '@/lib/server-utils'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}


// POST — Crear nueva profesora/colaborador
export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const datos = await req.json()

    if (!datos.nombre || !datos.apellido) {
      return NextResponse.json({ error: 'Nombre y apellido son obligatorios' }, { status: 400 })
    }

    const { data, error } = await sb()
      .from('profesoras')
      .insert({
        ...datos,
        activa: true,
        ...(institutoId ? { instituto_id: institutoId } : {}),
      })
      .select()
      .single()

    if (error) {
      console.error('[crear-profesora POST]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[crear-profesora POST] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — Actualizar datos de una profesora/colaborador
export async function PATCH(req: NextRequest) {
  try {
    const { id, datos } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { data, error } = await sb()
      .from('profesoras')
      .update(datos)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[crear-profesora PATCH]', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[crear-profesora PATCH] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — Desactivar profesora/colaborador
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    const { error } = await sb()
      .from('profesoras')
      .update({ activa: false })
      .eq('id', id)

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
