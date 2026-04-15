import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

export async function GET(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const { searchParams } = new URL(req.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    let q = sb().from('activity_log').select('*').order('created_at', { ascending: false }).limit(500)
    if (institutoId) q = q.eq('instituto_id', institutoId)
    if (desde) q = q.gte('created_at', desde + 'T00:00:00')
    if (hasta) q = q.lte('created_at', hasta + 'T23:59:59')

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const { usuario_nombre, accion, modulo, detalle } = await req.json()
    if (!accion || !modulo) return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    const { error } = await sb().from('activity_log').insert([{
      usuario_nombre: usuario_nombre || 'Sistema',
      accion, modulo,
      detalle: detalle || null,
      ...(institutoId ? { instituto_id: institutoId } : {}),
    }])
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
