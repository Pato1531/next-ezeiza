import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const datos = await req.json()
    // Convertir strings vacíos a null para campos de tipo time
    const limpio = {
      ...datos,
      hora_inicio: datos.hora_inicio || null,
      hora_fin:    datos.hora_fin    || null,
      descripcion: datos.descripcion || null,
    }
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    const { data, error } = await supabase.from('agenda_eventos').insert(limpio).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
