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
    const pago = await req.json()
    const supabase = sb()

    await supabase.from('pagos_alumnos')
      .delete()
      .eq('alumno_id', pago.alumno_id)
      .eq('mes', pago.mes)
      .eq('anio', pago.anio)

    const { data, error } = await supabase
      .from('pagos_alumnos')
      .insert({ ...pago, ...(institutoId ? { instituto_id: institutoId } : {}) })
      .select().single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
