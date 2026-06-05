// src/app/api/alertas-test/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstitutoId, verificarAuth } from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST — sincronizar alertas de un curso
// Recibe la lista completa de unidades dictadas; el servidor crea las alertas faltantes
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'Sin instituto' }, { status: 400 })

    const { curso_id, profesora_id, curso_nombre, profesora_nombre, unidades_dictadas } = await req.json()

    if (!curso_id || !profesora_id) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const dictadas: string[] = unidades_dictadas || []

    // Alertas ya existentes para este curso (pendientes o tomadas)
    const { data: alertasExistentes } = await sb()
      .from('alertas_test_unidades')
      .select('id')
      .eq('curso_id', curso_id)

    const cubiertasCount = (alertasExistentes || []).length * 2
    const nuevasDictadas = dictadas.slice(cubiertasCount)

    const creadas: any[] = []
    for (let i = 0; i + 1 < nuevasDictadas.length; i += 2) {
      const par = nuevasDictadas.slice(i, i + 2)
      const { data } = await sb()
        .from('alertas_test_unidades')
        .insert({
          instituto_id:     institutoId,
          curso_id,
          profesora_id,
          curso_nombre:     curso_nombre || '',
          profesora_nombre: profesora_nombre || '',
          unidades:         par,
          estado:           'pendiente',
        })
        .select()
        .single()
      if (data) creadas.push(data)
    }

    return NextResponse.json({ creadas, ya_cubiertas: cubiertasCount })
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

// GET — obtener alertas pendientes
// Header x-profesora-id filtra solo las de esa profesora (para docentes)
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

    if (profesoraId) query = query.eq('profesora_id', profesoraId)

    const { data, error } = await query.order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — eliminar alertas pendientes de un curso cuando se destilda una unidad
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'Sin instituto' }, { status: 400 })

    const { curso_id, unidades_dictadas } = await req.json()
    if (!curso_id) return NextResponse.json({ error: 'Falta curso_id' }, { status: 400 })

    const dictadas: string[] = unidades_dictadas || []

    const { data: alertas } = await sb()
      .from('alertas_test_unidades')
      .select('id, unidades')
      .eq('curso_id', curso_id)
      .eq('estado', 'pendiente')

    if (!alertas?.length) return NextResponse.json({ eliminadas: 0 })

    const aEliminar = alertas
      .filter((a: any) => (a.unidades as string[]).some(u => !dictadas.includes(u)))
      .map((a: any) => a.id)

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
