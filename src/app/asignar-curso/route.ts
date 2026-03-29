import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const { alumno_id, curso_id } = await req.json()
    
    if (!alumno_id || !curso_id) {
      return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    }

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )

    // Quitar curso anterior y asignar nuevo
    await supabase.from('cursos_alumnos').delete().eq('alumno_id', alumno_id)
    const { error } = await supabase.from('cursos_alumnos').insert({
      curso_id,
      alumno_id,
      fecha_ingreso: new Date().toISOString().split('T')[0]
    })

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
