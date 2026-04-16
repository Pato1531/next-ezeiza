import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

export async function POST(req: NextRequest) {
  try {
    const { id, datos } = await req.json()
    if (!id) return NextResponse.json({ error: 'Falta id' }, { status: 400 })
    const { error } = await sb().from('alumnos').update(datos).eq('id', id)
    if (error) { console.error('[actualizar-alumno]', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
