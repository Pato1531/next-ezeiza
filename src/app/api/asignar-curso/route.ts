import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

// POST — asignar curso a alumno (reemplaza el anterior)
export async function POST(req: NextRequest) {
  try {
    const { alumno_id, curso_id } = await req.json()
    if (!alumno_id || !curso_id) return NextResponse.json({ error: 'Faltan datos' }, { status: 400 })
    await sb().from('cursos_alumnos').delete().eq('alumno_id', alumno_id)
    const { error } = await sb().from('cursos_alumnos').insert({
      curso_id, alumno_id, fecha_ingreso: new Date().toISOString().split('T')[0]
    })
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — quitar alumno de curso
export async function DELETE(req: NextRequest) {
  try {
    const { alumno_id, curso_id } = await req.json()
    if (!alumno_id) return NextResponse.json({ error: 'Falta alumno_id' }, { status: 400 })
    let q = sb().from('cursos_alumnos').delete().eq('alumno_id', alumno_id)
    if (curso_id) q = (q as any).eq('curso_id', curso_id)
    const { error } = await q
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
