import { createClient } from '@supabase/supabase-js'
import { NextResponse } from 'next/server'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(request: Request) {
  try {
    const body = await request.json()
    const {
      user_id = null,
      user_name,
      user_role,
      action,
      module,
      description,
      before = null,
      after = null
    } = body

    if (!user_name || !user_role || !action || !module || !description) {
      return NextResponse.json({ error: 'Faltan campos requeridos' }, { status: 400 })
    }

    const { error } = await supabase
      .from('activity_log')
      .insert([{ user_id, user_name, user_role, action, module, description, before, after }])

    if (error) throw error

    return NextResponse.json({ ok: true })
  } catch (error: any) {
    console.error('Error al guardar log:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}
