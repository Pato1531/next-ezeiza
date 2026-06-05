// src/app/api/alertas-test/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstitutoId, verificarAuth } from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST — sincronizar alertas de un curso
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

// GET — obtener alertas pendientes del instituto
export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'Sin instituto' }, { status: 400 })

    const { data, error } = await sb()
      .from('alertas_test_unidades')
      .select('*')
      .eq('instituto_id', institutoId)
      .eq('estado', 'pendiente')
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
