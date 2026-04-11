import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const { fecha, mes, anio, campo, valor } = await req.json()
    if (!fecha || !mes || !campo || valor === undefined) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }

    const supabase = sb()
    let q = supabase.from('consultas_diarias').select('*').eq('fecha', fecha).eq('mes', mes).eq('anio', anio)
    if (institutoId) q = q.eq('instituto_id', institutoId)

    const { data: existente } = await q.single()

    if (existente) {
      const { data, error } = await supabase
        .from('consultas_diarias').update({ [campo]: valor }).eq('id', existente.id).select().single()
      if (error) throw error
      return NextResponse.json({ data })
    } else {
      const { data, error } = await supabase
        .from('consultas_diarias')
        .insert({ fecha, mes, anio, ws: 0, instagram: 0, inscriptos: 0, [campo]: valor, ...(institutoId ? { instituto_id: institutoId } : {}) })
        .select().single()
      if (error) throw error
      return NextResponse.json({ data })
    }
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
