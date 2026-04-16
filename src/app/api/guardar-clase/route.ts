import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { getInstitutoId } from '@/lib/server-utils'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}


// POST — Guardar clase + asistencia
export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':guardar-clase', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const institutoId = getInstitutoId(req)
    const { curso_id, fecha, tema, observacion_coordinadora, asistencia } = await req.json()

    if (!curso_id || !fecha) {
      return NextResponse.json({ error: 'Faltan campos: curso_id, fecha' }, { status: 400 })
    }

    const supabase = sb()

    // 1. Verificar si ya existe una clase para ese curso/fecha (upsert)
    const { data: claseExistente } = await supabase
      .from('clases')
      .select('id')
      .eq('curso_id', curso_id)
      .eq('fecha', fecha)
      .maybeSingle()

    let claseId: string

    if (claseExistente) {
      // Actualizar clase existente
      const { data, error } = await supabase
        .from('clases')
        .update({
          tema: tema || null,
          observacion_coordinadora: observacion_coordinadora || null,
        })
        .eq('id', claseExistente.id)
        .select()
        .single()
      if (error) {
        console.error('[guardar-clase] update clase:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      claseId = data.id
    } else {
      // Insertar nueva clase
      const { data, error } = await supabase
        .from('clases')
        .insert({
          curso_id,
          fecha,
          tema: tema || null,
          observacion_coordinadora: observacion_coordinadora || null,
          ...(institutoId ? { instituto_id: institutoId } : {}),
        })
        .select()
        .single()
      if (error) {
        console.error('[guardar-clase] insert clase:', error)
        return NextResponse.json({ error: error.message }, { status: 500 })
      }
      claseId = data.id
    }

    // 2. Guardar asistencia (eliminar registros anteriores y reinsertar)
    if (Array.isArray(asistencia) && asistencia.length > 0) {
      await supabase.from('asistencia_clases').delete().eq('clase_id', claseId)

      const rows = asistencia.map((a: { alumno_id: string; estado: string; observacion?: string }) => ({
        clase_id: claseId,
        alumno_id: a.alumno_id,
        estado: a.estado || 'P',
        observacion: a.observacion || null,
      }))

      const { error: asistError } = await supabase.from('asistencia_clases').insert(rows)
      if (asistError) {
        console.error('[guardar-clase] insert asistencia:', asistError)
        return NextResponse.json({ error: asistError.message }, { status: 500 })
      }
    }

    return NextResponse.json({ ok: true, clase_id: claseId })
  } catch (e: any) {
    console.error('[guardar-clase] catch:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE — Eliminar clase y su asistencia
export async function DELETE(req: NextRequest) {
  try {
    const { clase_id } = await req.json()
    if (!clase_id) return NextResponse.json({ error: 'clase_id requerido' }, { status: 400 })

    const supabase = sb()
    await supabase.from('asistencia_clases').delete().eq('clase_id', clase_id)
    const { error } = await supabase.from('clases').delete().eq('id', clase_id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
