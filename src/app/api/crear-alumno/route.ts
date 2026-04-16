import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
function getInstitutoId(req: NextRequest): string | null {
  const val = req.headers.get('x-instituto-id')
  return val && val.trim().length > 0 ? val.trim() : null
}

export async function POST(req: NextRequest) {
  try {
    const institutoId = getInstitutoId(req)
    const datos = await req.json()
    const { data, error } = await sb()
      .from('alumnos')
      .insert({ ...datos, activo: true, ...(institutoId ? { instituto_id: institutoId } : {}) })
      .select().single()
    if (error) { console.error('[crear-alumno]', error); return NextResponse.json({ error: error.message }, { status: 500 }) }
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
