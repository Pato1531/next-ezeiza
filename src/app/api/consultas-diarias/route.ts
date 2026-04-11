import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST → upsert atómico de un campo para un día
// Body: { fecha, mes, anio, campo, valor }
export async function POST(req: NextRequest) {
  try {
    const { fecha, mes, anio, campo, valor } = await req.json()
    if (!fecha || !mes || !campo || valor === undefined) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }

    const supabase = sb()

    // Buscar si ya existe el registro
    const { data: existente } = await supabase
      .from('consultas_diarias')
      .select('*')
      .eq('fecha', fecha)
      .eq('mes', mes)
      .eq('anio', anio)
      .single()

    if (existente) {
      // Update del campo específico
      const { data, error } = await supabase
        .from('consultas_diarias')
        .update({ [campo]: valor })
        .eq('id', existente.id)
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ data })
    } else {
      // Insert con todos los campos en 0 excepto el que se está guardando
      const { data, error } = await supabase
        .from('consultas_diarias')
        .insert({ fecha, mes, anio, ws: 0, instagram: 0, inscriptos: 0, [campo]: valor })
        .select()
        .single()
      if (error) throw error
      return NextResponse.json({ data })
    }
  } catch (e: any) {
    console.error('[consultas-diarias]', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
