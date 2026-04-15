import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const { usuario_nombre, accion, modulo, detalle } = body

    if (!accion || !modulo) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const { error } = await supabase
      .from('activity_log')
      .insert([{
        usuario_nombre: usuario_nombre || 'Sistema',
        accion,
        modulo,
        detalle: detalle || null,
      }])

    if (error) throw error
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('[log-activity]', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
