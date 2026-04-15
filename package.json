import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// Campos que cada rol puede actualizar
const CAMPOS_PERMITIDOS_PROFESORA = [
  'fecha_nacimiento',
]
const CAMPOS_TODOS = [
  'nombre', 'apellido', 'dni', 'edad', 'telefono', 'email',
  'nivel', 'cuota_mensual', 'matricula', 'es_menor',
  'padre_nombre', 'padre_telefono', 'padre_dni',
  'color', 'activo', 'fecha_alta', 'fecha_nacimiento',
]

export async function PATCH(req: NextRequest) {
  try {
    const { id, datos, rol_solicitante } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id del alumno' }, { status: 400 })
    if (!datos || Object.keys(datos).length === 0) {
      return NextResponse.json({ error: 'No hay datos para actualizar' }, { status: 400 })
    }

    // Filtrar campos según el rol
    let camposPermitidos = CAMPOS_TODOS
    if (rol_solicitante === 'profesora') {
      camposPermitidos = CAMPOS_PERMITIDOS_PROFESORA
    }

    const datosFiltrados: Record<string, any> = {}
    for (const [k, v] of Object.entries(datos)) {
      if (camposPermitidos.includes(k)) {
        datosFiltrados[k] = v
      }
    }

    if (Object.keys(datosFiltrados).length === 0) {
      return NextResponse.json({ error: 'Sin campos permitidos para actualizar con este rol' }, { status: 403 })
    }

    const { data, error } = await sb()
      .from('alumnos')
      .update(datosFiltrados)
      .eq('id', id)
      .select()
      .single()

    if (error) {
      console.error('[actualizar-alumno] Supabase error:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ ok: true, data })
  } catch (e: any) {
    console.error('[actualizar-alumno] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// Mantener compatibilidad con POST existente
export async function POST(req: NextRequest) {
  try {
    const { id, datos } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { error } = await sb().from('alumnos').update(datos).eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
