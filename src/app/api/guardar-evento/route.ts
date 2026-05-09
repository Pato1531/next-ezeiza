import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstitutoId , verificarAuth} from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
// getInstitutoId imported from @/lib/server-utils

export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':guardar-evento', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    const datos = await req.json()
    const limpio = {
      ...datos,
      hora_inicio: datos.hora_inicio || null,
      hora_fin:    datos.hora_fin    || null,
      descripcion: datos.descripcion || null,
      docente_id:  datos.docente_id  || null,
      ...(institutoId ? { instituto_id: institutoId } : {}),
    }
    const { data, error } = await sb().from('agenda_eventos').insert(limpio).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
