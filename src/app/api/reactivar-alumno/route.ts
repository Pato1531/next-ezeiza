// RUTA: next-ezeiza-main/src/app/api/reactivar-alumno/route.ts
//
// QUÉ HACE: reactiva a un alumno que había sido dado de baja y decidió
// volver. Reactiva al alumno, lo reinscribe en el curso elegido, marca la
// baja original como "reactivada" (se conserva para el historial — no se
// borra), y registra la deuda pendiente que trae, si corresponde.
//
// Solo director y secretaría pueden ejecutar esta acción (Coordinador no
// maneja montos en ningún otro lugar de la app). El update de bajas_alumnos
// necesita service_role porque esa tabla no tiene policy de UPDATE para
// el cliente — es intencional, ver migración 001_reactivacion_alumnos.sql.

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

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':reactivar-alumno', { limit: 20, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const authError = await verificarAuthRol(req, ['director', 'secretaria'])
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const supabase = sb()

    // Identificar al usuario que ejecuta la acción, para dejarlo guardado
    // en bajas_alumnos.reactivado_por y deudas_pendientes.registrado_por
    const authHeader = req.headers.get('authorization')
    const token = authHeader?.startsWith('Bearer ') ? authHeader.replace('Bearer ', '').trim() : null
    const { data: userData } = token
      ? await supabase.auth.getUser(token)
      : { data: { user: null } }
    const user = userData?.user
    if (!user) {
      return NextResponse.json({ error: 'No se pudo identificar al usuario' }, { status: 401 })
    }

    const { baja_id, alumno_id, curso_id, monto_deuda } = await req.json()
    if (!baja_id || !alumno_id) {
      return NextResponse.json({ error: 'Faltan baja_id y alumno_id' }, { status: 400 })
    }
    if (!curso_id) {
      return NextResponse.json({ error: 'Seleccioná el curso al que vuelve el alumno' }, { status: 400 })
    }
    if (monto_deuda != null && (isNaN(Number(monto_deuda)) || Number(monto_deuda) < 0)) {
      return NextResponse.json({ error: 'El monto de la deuda no es válido' }, { status: 400 })
    }

    // ── Verificar que el alumno y la baja pertenecen a este instituto ──────
    const { data: alumno, error: alumnoErr } = await supabase
      .from('alumnos')
      .select('id, activo, instituto_id')
      .eq('id', alumno_id)
      .eq('instituto_id', institutoId)
      .single()
    if (alumnoErr || !alumno) {
      return NextResponse.json({ error: 'Alumno no encontrado en este instituto' }, { status: 404 })
    }
    if (alumno.activo) {
      return NextResponse.json({ error: 'El alumno ya está activo' }, { status: 409 })
    }

    const { data: baja, error: bajaErr } = await supabase
      .from('bajas_alumnos')
      .select('id, alumno_id, reactivado')
      .eq('id', baja_id)
      .eq('alumno_id', alumno_id)
      .single()
    if (bajaErr || !baja) {
      return NextResponse.json({ error: 'Registro de baja no encontrado' }, { status: 404 })
    }
    if (baja.reactivado) {
      return NextResponse.json({ error: 'Esta baja ya fue reactivada anteriormente' }, { status: 409 })
    }

    // ── 1) Reactivar al alumno ──────────────────────────────────────────────
    const { error: activarErr } = await supabase
      .from('alumnos')
      .update({ activo: true })
      .eq('id', alumno_id)
      .eq('instituto_id', institutoId)
    if (activarErr) {
      console.error('[reactivar-alumno] activar:', activarErr.message)
      return NextResponse.json({ error: 'No se pudo reactivar al alumno: ' + activarErr.message }, { status: 500 })
    }

    // ── 2) Reinscribirlo en el curso elegido ────────────────────────────────
    // Se limpia cualquier inscripción residual antes de insertar la nueva
    // (mismo patrón que usa asignarCurso en la ficha del alumno).
    await supabase.from('cursos_alumnos').delete().eq('alumno_id', alumno_id)
    const { error: cursoErr } = await supabase.from('cursos_alumnos').insert({
      alumno_id,
      curso_id,
      fecha_ingreso: new Date().toISOString().split('T')[0],
    })
    if (cursoErr) {
      // No revertimos la reactivación por esto — el alumno queda activo,
      // pero avisamos para que se asigne el curso manualmente desde la ficha.
      console.error('[reactivar-alumno] inscripción:', cursoErr.message)
    }

    // ── 3) Marcar la baja como reactivada (se conserva para historial) ─────
    const { error: bajaUpdateErr } = await supabase
      .from('bajas_alumnos')
      .update({
        reactivado: true,
        fecha_reactivacion: new Date().toISOString().split('T')[0],
        reactivado_por: user.id,
      })
      .eq('id', baja_id)
    if (bajaUpdateErr) {
      console.error('[reactivar-alumno] marcar baja:', bajaUpdateErr.message)
      return NextResponse.json(
        { error: 'El alumno se reactivó pero no se pudo actualizar el historial de bajas: ' + bajaUpdateErr.message },
        { status: 500 }
      )
    }

    // ── 4) Registrar la deuda pendiente, si cargaron un monto ─────────────
    let deuda = null
    const montoNum = Number(monto_deuda) || 0
    if (montoNum > 0) {
      const { data: deudaData, error: deudaErr } = await supabase
        .from('deudas_pendientes')
        .insert({
          alumno_id,
          baja_id,
          monto: montoNum,
          motivo: 'Reactivación de alumno',
          estado: 'pendiente',
          registrado_por: user.id,
          instituto_id: institutoId,
        })
        .select()
        .single()
      if (deudaErr) {
        // Tampoco revertimos todo por esto — la deuda se puede cargar a mano
        // desde Pagos si hace falta.
        console.error('[reactivar-alumno] deuda:', deudaErr.message)
      } else {
        deuda = deudaData
      }
    }

    return NextResponse.json({ ok: true, deuda, cursoError: cursoErr ? cursoErr.message : null })
  } catch (e: any) {
    console.error('[reactivar-alumno] catch:', e?.message)
    return NextResponse.json({ error: e?.message || 'Error inesperado' }, { status: 500 })
  }
}
