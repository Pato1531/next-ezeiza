import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET → leer logs con filtros
export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url)
    const desde = searchParams.get('desde')
    const hasta = searchParams.get('hasta')

    const supabase = sb()
    let q = supabase
      .from('activity_log')
      .select('*')
      .order('created_at', { ascending: false })
      .limit(500)

    if (desde) q = q.gte('created_at', desde + 'T00:00:00')
    if (hasta) q = q.lte('created_at', hasta + 'T23:59:59')

    const { data, error } = await q
    if (error) throw error
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

// POST → insertar log
export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { usuario_nombre, accion, modulo, detalle } = body
    if (!accion || !modulo) {
      return NextResponse.json({ error: 'Faltan campos' }, { status: 400 })
    }
    const supabase = sb()
    const { error } = await supabase.from('activity_log').insert([{
      usuario_nombre: usuario_nombre || 'Sistema',
      accion,
      modulo,
      detalle: detalle || null,
    }])
    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
