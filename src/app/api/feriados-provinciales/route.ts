import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { getInstitutoId, verificarAuthRol } from '@/lib/server-utils'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// Feriados provinciales: son eventos de agenda de tipo "feriado" marcados con
// descripcion "Feriado provincial". Liquidaciones los descuenta igual que a los nacionales.
const MARCA = 'Feriado provincial'
const FECHA = /^\d{4}-\d{2}-\d{2}$/

// GET /api/feriados-provinciales?anio=2026
export async function GET(req: NextRequest) {
  const authError = await verificarAuthRol(req, ['director'])
  if (authError) return authError
  const institutoId = getInstitutoId(req)
  if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
  const anio = req.nextUrl.searchParams.get('anio') || String(new Date().getFullYear())
  const { data, error } = await sb().from('agenda_eventos')
    .select('id, titulo, fecha')
    .eq('instituto_id', institutoId).eq('tipo', 'feriado').eq('descripcion', MARCA)
    .gte('fecha', `${anio}-01-01`).lte('fecha', `${anio}-12-31`)
    .order('fecha', { ascending: true })
  if (error) return NextResponse.json({ error: 'No se pudieron leer los feriados' }, { status: 500 })
  return NextResponse.json({ data: data || [] })
}

// POST /api/feriados-provinciales · body: { fecha, titulo }
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':feriados', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)
    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { fecha, titulo } = await req.json()
    const nombre = typeof titulo === 'string' ? titulo.trim() : ''
    if (!FECHA.test(fecha || '')) return NextResponse.json({ error: 'La fecha no es válida' }, { status: 400 })
    if (!nombre || nombre.length > 80) return NextResponse.json({ error: 'Escribí el nombre del feriado' }, { status: 400 })

    const { data, error } = await sb().from('agenda_eventos').insert({
      titulo: nombre,
      tipo: 'feriado',
      fecha,
      convocados: 'todos',
      descripcion: MARCA,
      instituto_id: institutoId,
    }).select('id, titulo, fecha').single()
    if (error) return NextResponse.json({ error: 'No se pudo guardar el feriado' }, { status: 500 })
    return NextResponse.json({ ok: true, data })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}

// DELETE /api/feriados-provinciales?id=... (solo feriados provinciales de este instituto)
export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError
    const institutoId = getInstitutoId(req)
    if (!institutoId) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    const id = req.nextUrl.searchParams.get('id')
    if (!id) return NextResponse.json({ error: 'Falta el id' }, { status: 400 })
    const { error } = await sb().from('agenda_eventos').delete()
      .eq('id', id).eq('instituto_id', institutoId).eq('descripcion', MARCA)
    if (error) return NextResponse.json({ error: 'No se pudo eliminar' }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (error: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
