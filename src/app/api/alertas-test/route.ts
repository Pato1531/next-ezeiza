// src/app/api/alertas-test/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstitutoId, verificarAuth } from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST — crear alerta de test de unidades
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'Sin instituto' }, { status: 400 })

    const { curso_id, profesora_id, curso_nombre, profesora_nombre, unidades } = await req.json()

    if (!curso_id || !profesora_id || !unidades?.length) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    // Evitar duplicar alerta si ya existe una pendiente con las mismas unidades
    const { data: existente } = await sb()
      .from('alertas_test_unidades')
      .select('id')
      .eq('curso_id', curso_id)
      .eq('estado', 'pendiente')
      .contains('unidades', unidades)
      .limit(1)

    if (existente && existente.length > 0) {
      return NextResponse.json({ data: existente[0], duplicado: true })
    }

    const { data, error } = await sb()
      .from('alertas_test_unidades')
      .insert({
        instituto_id:     institutoId,
        curso_id,
        profesora_id,
        curso_nombre:     curso_nombre || '',
        profesora_nombre: profesora_nombre || '',
        unidades,
        estado:           'pendiente',
      })
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — marcar alerta como tomada
export async function PATCH(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })

    const { data, error } = await sb()
      .from('alertas_test_unidades')
      .update({ estado: 'tomado', tomado_en: new Date().toISOString() })
      .eq('id', id)
      .eq('instituto_id', institutoId!)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// GET — obtener alertas pendientes del instituto
// Si el header x-profesora-id está presente, filtrar solo las de esa profesora
export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'Sin instituto' }, { status: 400 })

    const profesoraId = req.headers.get('x-profesora-id')

    let query = sb()
      .from('alertas_test_unidades')
      .select('*')
      .eq('instituto_id', institutoId)
      .eq('estado', 'pendiente')

    if (profesoraId) {
      query = query.eq('profesora_id', profesoraId)
    }

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — eliminar alertas pendientes de un curso cuando se destilda una unidad
// El cliente manda curso_id y la lista actualizada de dictadas
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'Sin instituto' }, { status: 400 })

    const { curso_id, unidades_dictadas } = await req.json()
    if (!curso_id) return NextResponse.json({ error: 'Falta curso_id' }, { status: 400 })

    const dictadas: string[] = unidades_dictadas || []

    // Traer todas las alertas pendientes del curso
    const { data: alertas } = await sb()
      .from('alertas_test_unidades')
      .select('id, unidades')
      .eq('curso_id', curso_id)
      .eq('estado', 'pendiente')

    if (!alertas?.length) return NextResponse.json({ eliminadas: 0 })

    // Eliminar alertas que contengan unidades que ya no están dictadas
    const aEliminar = alertas.filter((a: any) =>
      (a.unidades as string[]).some(u => !dictadas.includes(u))
    ).map((a: any) => a.id)

    if (!aEliminar.length) return NextResponse.json({ eliminadas: 0 })

    await sb()
      .from('alertas_test_unidades')
      .delete()
      .in('id', aEliminar)
      .eq('instituto_id', institutoId)

    return NextResponse.json({ eliminadas: aEliminar.length })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
