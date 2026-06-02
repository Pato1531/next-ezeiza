// src/app/api/informe-docente/[profesoraId]/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verificarAuthRol } from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}

function color(val: number, umbrales: [number, number]): string {
  if (val >= umbrales[1]) return '#2d7a4f'
  if (val >= umbrales[0]) return '#b45309'
  return '#c0392b'
}
function semaforo(val: number, umbrales: [number, number]): string {
  if (val >= umbrales[1]) return '🟢'
  if (val >= umbrales[0]) return '🟡'
  return '🔴'
}
function fmtF(f: string) {
  return f ? new Date(f + 'T12:00:00').toLocaleDateString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit' }) : '—'
}

export async function GET(req: NextRequest, { params }: { params: { profesoraId: string } }) {
  const authError = await verificarAuthRol(req, ['director', 'coordinadora'])
  if (authError) return authError

  const { searchParams } = new URL(req.url)
  const mes   = searchParams.get('mes')   || ''
  const anio  = searchParams.get('anio')  || String(new Date().getFullYear())
  const observacion = searchParams.get('observacion') || ''

  if (!mes) return new NextResponse('Parámetro mes requerido', { status: 400 })

  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesIdx = MESES.indexOf(mes)
  if (mesIdx < 0) return new NextResponse('Mes inválido', { status: 400 })

  const anioN = parseInt(anio)
  const mesNum = String(mesIdx + 1).padStart(2, '0')
  const desde  = `${anioN}-${mesNum}-01`
  const hasta  = `${anioN}-${mesNum}-${String(new Date(anioN, mesIdx + 1, 0).getDate()).padStart(2, '0')}`

  // Mes anterior
  const mesAntIdx = mesIdx > 0 ? mesIdx - 1 : 11
  const anioAnt   = mesIdx > 0 ? anioN : anioN - 1
  const mesAntNum = String(mesAntIdx + 1).padStart(2, '0')
  const desdeAnt  = `${anioAnt}-${mesAntNum}-01`
  const hastaAnt  = `${anioAnt}-${mesAntNum}-${String(new Date(anioAnt, mesAntIdx + 1, 0).getDate()).padStart(2, '0')}`

  const db = sb()

  // 1. Profesora
  const { data: prof } = await db.from('profesoras').select('nombre, apellido, email, telefono, instituto_id').eq('id', params.profesoraId).single()
  if (!prof) return new NextResponse('Docente no encontrada', { status: 404 })

  // 2. Instituto
  const { data: inst } = await db.from('institutos').select('nombre, color_primario').eq('id', prof.instituto_id).single()
  const colorPrimario = inst?.color_primario || '#652f8d'
  const institutoNombre = inst?.nombre || 'Instituto'

  // 3. Cursos activos de la profesora
  const { data: cursos } = await db.from('cursos').select('id, nombre, dias, hora_inicio, hora_fin').eq('profesora_id', params.profesoraId).eq('activo', true)
  const cursoIds = (cursos || []).map((c: any) => c.id)

  // 4. Clases del mes
  const { data: clases } = cursoIds.length ? await db.from('clases').select('id, fecha, tema, curso_id').in('curso_id', cursoIds).gte('fecha', desde).lte('fecha', hasta) : { data: [] }
  const claseIds = (clases || []).map((c: any) => c.id)
  const clasesSinTema = (clases || []).filter((c: any) => !c.tema || c.tema.trim() === '').length

  // Horas dictadas
  let horasTotales = 0
  for (const cl of (clases || [])) {
    const curso = (cursos || []).find((c: any) => c.id === cl.curso_id)
    if (curso?.hora_inicio && curso?.hora_fin) {
      const [h1, m1] = curso.hora_inicio.split(':').map(Number)
      const [h2, m2] = curso.hora_fin.split(':').map(Number)
      const mins = (h2 * 60 + m2) - (h1 * 60 + m1)
      if (mins > 0) horasTotales += mins / 60
    }
  }
  horasTotales = Math.round(horasTotales * 10) / 10

  // 5. Asistencia del mes — agrupada por curso
  const { data: asistData } = claseIds.length ? await db.from('asistencia_clases')
    .select('alumno_id, estado, clase_id, alumnos(nombre, apellido)')
    .in('clase_id', claseIds) : { data: [] }

  // Mapa clase → curso
  const claseCursoMap = Object.fromEntries((clases || []).map((c: any) => [c.id, c.curso_id]))

  // Asistencia por curso (solo registros con estado presente/ausente)
  const asistPorCurso: Record<string, { presentes: number; total: number; cursoNombre: string }> = {}
  ;(cursos || []).forEach((c: any) => {
    asistPorCurso[c.id] = { presentes: 0, total: 0, cursoNombre: c.nombre }
  })
  ;(asistData || []).filter((r: any) => r.estado === 'presente' || r.estado === 'ausente').forEach((r: any) => {
    const cid = claseCursoMap[r.clase_id]
    if (cid && asistPorCurso[cid]) {
      asistPorCurso[cid].total++
      if (r.estado === 'presente') asistPorCurso[cid].presentes++
    }
  })
  const asistCursosList = Object.values(asistPorCurso).filter((c: any) => c.total > 0).map((c: any) => ({
    cursoNombre: c.cursoNombre,
    pct: Math.round((c.presentes / c.total) * 100),
  }))
  // Promedio global para el KPI
  const totalReg = Object.values(asistPorCurso).reduce((s: number, c: any) => s + c.total, 0)
  const totalPres = Object.values(asistPorCurso).reduce((s: number, c: any) => s + c.presentes, 0)
  const pctAsistencia = totalReg > 0 ? Math.round((totalPres / totalReg) * 100) : null

  // Ausencias reiteradas (2+ en el mes, global)
  const ausenciasPorAlumno: Record<string, { nombre: string; consecutivas: number }> = {}
  ;(asistData || []).filter((r: any) => r.estado === 'ausente').forEach((r: any) => {
    const k = r.alumno_id
    if (!ausenciasPorAlumno[k]) ausenciasPorAlumno[k] = { nombre: `${r.alumnos?.nombre || ''} ${r.alumnos?.apellido || ''}`, consecutivas: 0 }
    ausenciasPorAlumno[k].consecutivas++
  })
  const alumnosConAusencias = Object.values(ausenciasPorAlumno).filter((a: any) => a.consecutivas >= 2).sort((a: any, b: any) => b.consecutivas - a.consecutivas)

  // Ausencias reiteradas (2+ faltas consecutivas por alumno)
  const ausenciasPorAlumno: Record<string, { nombre: string; consecutivas: number; clases: string[] }> = {}
  const clasesFechas = Object.fromEntries((clases || []).map((c: any) => [c.id, c.fecha]))
  ;(asistData || []).filter((r: any) => r.estado === 'ausente').forEach((r: any) => {
    const k = r.alumno_id
    if (!ausenciasPorAlumno[k]) ausenciasPorAlumno[k] = { nombre: `${r.alumnos?.nombre || ''} ${r.alumnos?.apellido || ''}`, consecutivas: 0, clases: [] }
    ausenciasPorAlumno[k].clases.push(clasesFechas[r.clase_id] || '')
    ausenciasPorAlumno[k].consecutivas++
  })
  const alumnosConAusencias = Object.values(ausenciasPorAlumno).filter(a => a.consecutivas >= 2).sort((a, b) => b.consecutivas - a.consecutivas)

  // 6. Exámenes del mes + notas
  const { data: examenes } = cursoIds.length ? await db.from('examenes').select('id, nombre, fecha, tipo, curso_id').in('curso_id', cursoIds).gte('fecha', desde).lte('fecha', hasta).order('fecha') : { data: [] }
  const examenIds = (examenes || []).map((e: any) => e.id)
  const { data: notas } = examenIds.length ? await db.from('notas_examenes').select('examen_id, nota, alumno_id, alumnos(nombre, apellido)').in('examen_id', examenIds) : { data: [] }

  const examenesConStats = (examenes || []).map((ex: any) => {
    const notasEx = (notas || []).filter((n: any) => n.examen_id === ex.id && n.nota !== null && n.nota !== '')
    const nums    = notasEx.map((n: any) => Number(n.nota)).filter((n: number) => !isNaN(n))
    const promedio = nums.length > 0 ? Math.round(nums.reduce((s: number, n: number) => s + n, 0) / nums.length) : null
    const bajos   = notasEx.filter((n: any) => !isNaN(Number(n.nota)) && Number(n.nota) < 60).map((n: any) => ({ nombre: `${n.alumnos?.nombre || ''} ${n.alumnos?.apellido || ''}`, nota: n.nota }))
    return { ...ex, promedio, bajos, totalNotas: notasEx.length }
  })

  // 7. Planificación — por curso con estados correctos del sistema
  const mesTranscurrido = (mesIdx + 1) / 12
  const ritmoEsperado   = Math.round(mesTranscurrido * 100)
  const { data: unidades } = cursoIds.length ? await db.from('planificacion_cursos').select('id, estado, curso_id, titulo').in('curso_id', cursoIds) : { data: [] }

  // Por curso — dictada = completada, en_curso = al día, pendiente = sin empezar
  const planifPorCurso = (cursos || []).map((c: any) => {
    const uds     = (unidades || []).filter((u: any) => u.curso_id === c.id)
    const dictadas = uds.filter((u: any) => u.estado === 'dictada').length
    const enCurso  = uds.filter((u: any) => u.estado === 'en_curso').length
    const total    = uds.length
    const pct      = total > 0 ? Math.round((dictadas / total) * 100) : null
    // Semáforo individual por curso
    const brecha   = pct !== null ? pct - ritmoEsperado : null
    const sem      = brecha === null ? '⚫' : brecha >= 0 ? '🟢' : brecha >= -10 ? '🟡' : '🔴'
    const texto    = brecha === null ? 'Sin datos'
      : brecha >= 0 ? `Adelantado ${brecha}% vs ritmo esperado`
      : brecha >= -10 ? `${Math.abs(brecha)}% por debajo — riesgo leve`
      : `${Math.abs(brecha)}% por debajo — requiere atención`
    return { cursoNombre: c.nombre, dictadas, enCurso, total, pct, sem, texto }
  }).filter((c: any) => c.total > 0)

  // Totales globales (para referencia interna)
  const totalUnidades    = (unidades || []).length
  const unidadesDictadas = (unidades || []).filter((u: any) => u.estado === 'dictada').length
  const pctAvance        = totalUnidades > 0 ? Math.round((unidadesDictadas / totalUnidades) * 100) : null

  // Semáforo global resumido
  const brecha    = pctAvance !== null ? pctAvance - ritmoEsperado : null
  const semaforoRitmo = brecha === null ? '⚫' : brecha >= 0 ? '🟢' : brecha >= -10 ? '🟡' : '🔴'
  const textoRitmo    = brecha === null ? 'Sin datos de planificación'
    : brecha >= 0 ? `Adelantado ${brecha}% respecto al ritmo esperado`
    : brecha >= -10 ? `${Math.abs(brecha)}% por debajo del ritmo — en riesgo leve`
    : `${Math.abs(brecha)}% por debajo del ritmo — requiere atención`

  // 8. Alumnos en cursos de esta profesora
  const { data: cursosAlActual } = cursoIds.length ? await db.from('cursos_alumnos').select('alumno_id').in('curso_id', cursoIds) : { data: [] }
  const cantActual = (cursosAlActual || []).length
  const alumnoIdsProf = new Set((cursosAlActual || []).map((r: any) => r.alumno_id))

  // 9. Bajas del mes — solo alumnos que estaban en cursos de esta profesora
  const { data: todasBajas } = await db.from('bajas_alumnos')
    .select('alumno_id, alumno_nombre, alumno_apellido, motivo, fecha_baja')
    .gte('fecha_baja', desde).lte('fecha_baja', hasta)
  const bajasDeProfesora = (todasBajas || []).filter((b: any) => alumnoIdsProf.has(b.alumno_id))
  const cantBajas = bajasDeProfesora.length

  // Fecha de emisión
  const fechaEmision = new Date().toLocaleDateString('es-AR', { day: '2-digit', month: 'long', year: 'numeric' })
  const initials = institutoNombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

  // ── HTML ────────────────────────────────────────────────────────────────────
  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Informe Docente — ${prof.nombre} ${prof.apellido} — ${mes} ${anio}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: 'Inter', Arial, sans-serif; background: #f0eaf8; min-height: 100vh; padding: 28px 16px 48px; }
    .doc { max-width: 620px; margin: 0 auto; background: #fff; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 40px rgba(101,47,141,.15); }

    /* Header */
    .head { background: ${colorPrimario}; padding: 28px 32px 24px; color: #fff; display: flex; justify-content: space-between; align-items: flex-start; }
    .logo { width: 44px; height: 44px; background: rgba(255,255,255,.2); border-radius: 10px; display: flex; align-items: center; justify-content: center; font-size: 16px; font-weight: 700; flex-shrink: 0; }
    .inst-nombre { font-size: 18px; font-weight: 700; margin-bottom: 2px; }
    .inst-sub { font-size: 11px; opacity: .7; text-transform: uppercase; letter-spacing: .1em; }
    .informe-label { text-align: right; }
    .informe-title { font-size: 14px; font-weight: 600; opacity: .9; }
    .informe-periodo { font-size: 20px; font-weight: 800; margin-top: 2px; }

    /* Franja docente */
    .docente-strip { background: #f9f5fd; border-bottom: 1px solid #ede8f5; padding: 16px 32px; display: flex; align-items: center; gap: 14px; }
    .docente-avatar { width: 44px; height: 44px; background: ${colorPrimario}; border-radius: 50%; display: flex; align-items: center; justify-content: center; color: #fff; font-size: 16px; font-weight: 700; flex-shrink: 0; }
    .docente-nombre { font-size: 18px; font-weight: 700; color: #1a1020; }
    .docente-sub { font-size: 12px; color: #9b8eaa; margin-top: 2px; }

    /* Body */
    .body { padding: 24px 32px; }

    /* KPIs */
    .kpis { display: grid; grid-template-columns: repeat(4, 1fr); gap: 8px; margin-bottom: 24px; }
    .kpi { background: #f9f5fd; border-radius: 12px; padding: 12px 10px; text-align: center; }
    .kpi-val { font-size: 20px; font-weight: 800; line-height: 1; }
    .kpi-label { font-size: 10px; color: #9b8eaa; margin-top: 4px; text-transform: uppercase; letter-spacing: .04em; }

    /* Secciones */
    .section { margin-bottom: 20px; }
    .section-title { font-size: 11px; font-weight: 700; color: #9b8eaa; text-transform: uppercase; letter-spacing: .08em; margin-bottom: 10px; padding-bottom: 6px; border-bottom: 1px solid #f0edf5; }
    .row { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px solid #f9f5fd; font-size: 13px; color: #1a1020; }
    .row:last-child { border-bottom: none; }
    .row-label { color: #5a4d6a; }
    .row-val { font-weight: 600; }

    /* Alertas */
    .alert { border-radius: 10px; padding: 10px 14px; margin-bottom: 8px; font-size: 12px; line-height: 1.6; }
    .alert-red { background: #fdeaea; border-left: 3px solid #c0392b; }
    .alert-amber { background: #fef3cd; border-left: 3px solid #b45309; }
    .alert-green { background: #e6f4ec; border-left: 3px solid #2d7a4f; }
    .alert-name { font-weight: 600; margin-bottom: 2px; }

    /* Semáforo */
    .semaforo-row { display: flex; align-items: center; gap: 12px; background: #f9f5fd; border-radius: 10px; padding: 12px 16px; }
    .semaforo-icon { font-size: 28px; line-height: 1; }
    .semaforo-text { font-size: 13px; color: #5a4d6a; }
    .semaforo-label { font-size: 11px; color: #9b8eaa; margin-top: 2px; }

    /* Observación */
    .obs-block { background: #f9f5fd; border-left: 3px solid ${colorPrimario}; border-radius: 0 10px 10px 0; padding: 14px 16px; margin-bottom: 24px; }
    .obs-label { font-size: 10px; font-weight: 700; color: ${colorPrimario}; text-transform: uppercase; letter-spacing: .1em; margin-bottom: 6px; }
    .obs-text { font-size: 13px; color: #5a4d6a; line-height: 1.6; }

    /* Exámenes */
    .examen-block { border: 1px solid #f0edf5; border-radius: 10px; padding: 12px 14px; margin-bottom: 8px; }
    .examen-nombre { font-size: 13px; font-weight: 600; color: #1a1020; margin-bottom: 6px; display: flex; justify-content: space-between; align-items: center; }
    .nota-badge { padding: 2px 8px; border-radius: 6px; font-size: 12px; font-weight: 700; }
    .bajo-list { font-size: 11px; color: #c0392b; margin-top: 4px; }

    /* Footer */
    .footer { background: ${colorPrimario}; padding: 14px 32px; display: flex; justify-content: space-between; align-items: center; font-size: 11px; color: rgba(255,255,255,.65); margin-top: 8px; }

    @media print {
      body { background: white; padding: 0; }
      .doc { box-shadow: none; border-radius: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
<div class="doc">

  <div class="head">
    <div style="display:flex;align-items:center;gap:12px">
      <div class="logo">${initials}</div>
      <div>
        <div class="inst-nombre">${institutoNombre}</div>
        <div class="inst-sub">Informe Docente Mensual</div>
      </div>
    </div>
    <div class="informe-label">
      <div class="informe-title">Período</div>
      <div class="informe-periodo">${mes} ${anio}</div>
    </div>
  </div>

  <div class="docente-strip">
    <div class="docente-avatar">${prof.nombre[0]}${prof.apellido[0]}</div>
    <div>
      <div class="docente-nombre">${prof.nombre} ${prof.apellido}</div>
      <div class="docente-sub">${(cursos || []).length} curso${(cursos||[]).length !== 1 ? 's' : ''} activo${(cursos||[]).length !== 1 ? 's' : ''} · ${horasTotales}hs dictadas en ${mes}</div>
    </div>
  </div>

  <div class="body">

    <!-- KPIs -->
    <div class="kpis">
      <div class="kpi">
        <div class="kpi-val" style="color:${pctAsistencia !== null ? color(pctAsistencia, [70, 85]) : '#9b8eaa'}">${pctAsistencia !== null ? pctAsistencia + '%' : '—'}</div>
        <div class="kpi-label">Asistencia prom.</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:${colorPrimario}">${(clases||[]).length}</div>
        <div class="kpi-label">Clases</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:${colorPrimario}">${(examenes||[]).length}</div>
        <div class="kpi-label">Exámenes</div>
      </div>
      <div class="kpi">
        <div class="kpi-val" style="color:${colorPrimario}">${horasTotales}hs</div>
        <div class="kpi-label">Horas dictadas</div>
      </div>
    </div>

    <!-- Observación del director -->
    ${observacion ? `
    <div class="obs-block">
      <div class="obs-label">Observación del director</div>
      <div class="obs-text">${observacion}</div>
    </div>` : ''}

    <!-- Asistencia -->
    <div class="section">
      <div class="section-title">Asistencia de alumnos</div>
      ${asistCursosList.length === 0
        ? '<div style="font-size:13px;color:#9b8eaa;font-style:italic">Sin registros de asistencia en el mes</div>'
        : asistCursosList.map((c: any) => `
      <div class="row">
        <span class="row-label">${c.cursoNombre}</span>
        <span class="row-val" style="color:${color(c.pct, [70, 85])}">${c.pct}%</span>
      </div>`).join('')}
      <div class="row">
        <span class="row-label">Alumnos con 2+ ausencias en el mes</span>
        <span class="row-val" style="color:${alumnosConAusencias.length > 0 ? '#c0392b' : '#2d7a4f'}">${alumnosConAusencias.length}</span>
      </div>
      ${alumnosConAusencias.map((a: any) => `
      <div class="alert alert-amber">
        <div class="alert-name">${a.nombre.trim()}</div>
        ${a.consecutivas} ausencia${a.consecutivas !== 1 ? 's' : ''} en el mes
      </div>`).join('')}
    </div>

    <!-- Exámenes -->
    <div class="section">
      <div class="section-title">Exámenes y calificaciones</div>
      ${examenesConStats.length === 0 ? `<div style="font-size:13px;color:#9b8eaa;font-style:italic">Sin exámenes registrados en ${mes}</div>` :
        examenesConStats.map((ex: any) => `
        <div class="examen-block">
          <div class="examen-nombre">
            <span>${ex.nombre}${ex.tipo ? ` <span style="font-size:10px;background:#f5f0fa;color:#9b8eaa;padding:1px 6px;border-radius:6px">${ex.tipo}</span>` : ''}</span>
            <span style="font-size:11px;color:#9b8eaa">${fmtF(ex.fecha)} · ${ex.totalNotas} notas</span>
          </div>
          ${ex.promedio !== null ? `
          <div style="display:flex;align-items:center;gap:8px;margin-bottom:${ex.bajos.length > 0 ? '8px' : '0'}">
            <span style="font-size:12px;color:#5a4d6a">Promedio:</span>
            <span class="nota-badge" style="background:${ex.promedio >= 70 ? '#e6f4ec' : ex.promedio >= 60 ? '#fef3cd' : '#fdeaea'};color:${ex.promedio >= 70 ? '#2d7a4f' : ex.promedio >= 60 ? '#b45309' : '#c0392b'}">${ex.promedio}/100</span>
          </div>` : ''}
          ${ex.bajos.length > 0 ? `
          <div class="bajo-list">
            ⚠️ Requieren atención (nota &lt;60): ${ex.bajos.map((b: any) => `${b.nombre.trim()} (${b.nota})`).join(' · ')}
          </div>` : ''}
        </div>`).join('')}
    </div>

    <!-- Planificación -->
    <div class="section">
      <div class="section-title">Planificación y ritmo anual</div>
      <div class="row">
        <span class="row-label">Ritmo esperado a esta altura del año</span>
        <span class="row-val">${ritmoEsperado}%</span>
      </div>
      ${planifPorCurso.length === 0
        ? '<div style="font-size:13px;color:#9b8eaa;font-style:italic;margin-top:8px">Sin planificación cargada</div>'
        : planifPorCurso.map((c: any) => `
        <div style="border:1px solid #f0edf5;border-radius:10px;padding:12px 14px;margin-top:8px">
          <div style="font-size:13px;font-weight:600;color:#1a1020;margin-bottom:8px;display:flex;justify-content:space-between">
            <span>${c.cursoNombre}</span>
            <span style="color:${c.pct !== null ? color(c.pct, [Math.max(0, ritmoEsperado - 10), ritmoEsperado]) : '#9b8eaa'}">${c.dictadas}/${c.total} · ${c.pct !== null ? c.pct + '%' : '—'}</span>
          </div>
          <div class="semaforo-row" style="padding:8px 12px">
            <div class="semaforo-icon" style="font-size:20px">${c.sem}</div>
            <div class="semaforo-text" style="font-size:12px">${c.texto}</div>
          </div>
        </div>`).join('')}
    </div>

    <!-- Administrativo -->
    <div class="section">
      <div class="section-title">Gestión administrativa</div>
      <div class="row">
        <span class="row-label">Total de horas dictadas en ${mes}</span>
        <span class="row-val" style="color:${colorPrimario}">${horasTotales}hs</span>
      </div>
      <div class="row">
        <span class="row-label">Clases sin tema registrado</span>
        <span class="row-val" style="color:${clasesSinTema > 0 ? '#b45309' : '#2d7a4f'}">${clasesSinTema === 0 ? '✓ Todas registradas' : clasesSinTema + ' sin tema'}</span>
      </div>
      <div class="row">
        <span class="row-label">Alumnos actuales en sus cursos</span>
        <span class="row-val">${cantActual}</span>
      </div>
      <div class="row">
        <span class="row-label">Bajas registradas en ${mes}</span>
        <span class="row-val" style="color:${cantBajas > 0 ? '#b45309' : '#2d7a4f'}">${cantBajas === 0 ? '✓ Sin bajas' : cantBajas + ' baja' + (cantBajas !== 1 ? 's' : '')}</span>
      </div>
    </div>

  </div><!-- /body -->

  <div class="footer">
    <span>${institutoNombre} · Informe Docente Mensual</span>
    <span>Emitido: ${fechaEmision}</span>
  </div>

</div>
<script>window.onload = function() { window.print() }<\/script>
</body>
</html>`

  return new NextResponse(html, { headers: { 'Content-Type': 'text/html; charset=utf-8' } })
}
