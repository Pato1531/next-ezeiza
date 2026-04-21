import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

function notaBadge(nota: string | number | null): { label: string; bg: string; color: string } {
  if (nota === null || nota === undefined || nota === '') {
    return { label: '—', bg: '#f5f0fa', color: '#9b8eaa' }
  }
  const n = String(nota).trim().toUpperCase()
  const num = Number(nota)
  if (n === 'A' || n === 'A+' || n === 'A-' || (!isNaN(num) && num >= 9))
    return { label: n, bg: '#e6f4ec', color: '#2d7a4f' }
  if (n === 'B' || n === 'B+' || n === 'B-' || (!isNaN(num) && num >= 7 && num < 9))
    return { label: n, bg: '#e0f0f7', color: '#1a6b8a' }
  if (n === 'C' || n === 'C+' || n === 'C-' || (!isNaN(num) && num >= 5 && num < 7))
    return { label: n, bg: '#fef3cd', color: '#b45309' }
  if (n === 'D' || n === 'F' || (!isNaN(num) && num < 5))
    return { label: n, bg: '#fdeaea', color: '#c0392b' }
  return { label: n, bg: '#f4eefb', color: '#652f8d' }
}

export async function GET(
  req: NextRequest,
  { params }: { params: { alumnoId: string } }
) {
  try {
    const { searchParams } = new URL(req.url)
    const cursoId = searchParams.get('curso_id')
    const periodo = searchParams.get('periodo') || new Date().toLocaleDateString('es-AR', { month: 'long', year: 'numeric' })

    if (!cursoId) {
      return new NextResponse('Parámetro curso_id requerido', { status: 400 })
    }

    const sb = getSupabase()

    // 1. Alumno
    const { data: alumno, error: errAl } = await sb
      .from('alumnos')
      .select('nombre, apellido, dni, nivel, instituto_id')
      .eq('id', params.alumnoId)
      .single()

    if (errAl || !alumno) {
      return new NextResponse('Alumno no encontrado', { status: 404 })
    }

    // 2. Instituto
    let institutoNombre    = 'Next English Institute'
    let institutoSub       = 'Instituto de Inglés'
    let colorPrimario      = '#652f8d'
    let firmaDirectorUrl   = ''
    if (alumno.instituto_id) {
      const { data: inst } = await sb
        .from('institutos').select('nombre, color_primario, firma_director_url').eq('id', alumno.instituto_id).single()
      if (inst?.nombre) {
        institutoNombre      = inst.nombre
        institutoSub         = 'Instituto de Inglés'
        if (inst.color_primario)     colorPrimario     = inst.color_primario
        if (inst.firma_director_url) firmaDirectorUrl  = inst.firma_director_url
      }
    }

    // 3. Curso y docente
    const { data: curso, error: errCurso } = await sb
      .from('cursos')
      .select('nombre, nivel, profesoras(nombre, apellido)')
      .eq('id', cursoId)
      .single()

    if (errCurso || !curso) {
      return new NextResponse('Curso no encontrado', { status: 404 })
    }

    const docente = (curso as any).profesoras
    const docenteNombre = docente ? `${docente.nombre} ${docente.apellido}` : 'Docente'

    // Director del instituto
    const { data: director } = await sb
      .from('usuarios').select('nombre')
      .eq('rol', 'director').eq('instituto_id', alumno.instituto_id).single()
    const directorNombre = director?.nombre || 'Director'

    // 4. Exámenes del curso con notas del alumno
    const { data: examenes } = await sb
      .from('examenes')
      .select('id, nombre, fecha, tipo')
      .eq('curso_id', cursoId)
      .order('fecha', { ascending: true })

    const examenesConNota: {
      nombre: string; tipo: string; fecha: string
      notaLabel: string; notaBg: string; notaColor: string; observacion: string
    }[] = []

    if (examenes && examenes.length > 0) {
      for (const ex of examenes) {
        const { data: notaData } = await sb
          .from('notas_examenes')
          .select('nota, observacion')
          .eq('examen_id', ex.id)
          .eq('alumno_id', params.alumnoId)
          .single()

        const badge = notaBadge(notaData?.nota ?? null)
        examenesConNota.push({
          nombre: ex.nombre,
          tipo: ex.tipo || '',
          fecha: ex.fecha
            ? new Date(ex.fecha + 'T12:00:00').toLocaleDateString('es-AR', {
                day: '2-digit', month: '2-digit', year: '2-digit',
              })
            : '—',
          notaLabel:   badge.label,
          notaBg:      badge.bg,
          notaColor:   badge.color,
          observacion: notaData?.observacion ?? '',
        })
      }
    }

    const fechaEmision = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })

    const initials = institutoNombre.split(' ').map((w: string) => w[0]).join('').slice(0, 2).toUpperCase()

    const filas = examenesConNota.length > 0
      ? examenesConNota.map(ex => `
        <tr>
          <td>
            ${ex.nombre}
            ${ex.tipo ? `<span class="tipo-badge">${ex.tipo}</span>` : ''}
          </td>
          <td class="td-fecha">${ex.fecha}</td>
          <td class="td-nota">
            <span class="nota-badge" style="background:${ex.notaBg};color:${ex.notaColor}">
              ${ex.notaLabel}
            </span>
          </td>
        </tr>`).join('')
      : `<tr><td colspan="3" class="td-vacio">Sin evaluaciones registradas para este período.</td></tr>`

    const observacionesDocente = examenesConNota
      .map(e => e.observacion).filter(Boolean).join(' ')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Boletín — ${alumno.nombre} ${alumno.apellido} — ${institutoNombre}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Lora:wght@400;600;700&family=Inter:wght@400;500;600&display=swap');
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      font-family: 'Inter', Arial, sans-serif;
      background: #f0eaf8;
      min-height: 100vh;
      display: flex;
      align-items: flex-start;
      justify-content: center;
      padding: 32px 16px 48px;
    }

    .doc {
      width: 100%;
      max-width: 560px;
      background: #fff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(101,47,141,.18);
    }

    /* ── CABECERA ── */
    .head {
      background: #fff;
      border-bottom: 4px solid ${colorPrimario};
      padding: 28px 36px 22px;
    }
    .head-inner {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .inst-block { display: flex; align-items: center; gap: 14px; }
    .inst-logo {
      width: 50px; height: 50px;
      background: ${colorPrimario};
      border-radius: 10px;
      display: flex; align-items: center; justify-content: center;
      color: #fff;
      font-family: 'Lora', Georgia, serif;
      font-size: 18px; font-weight: 700;
      flex-shrink: 0;
    }
    .inst-nombre {
      font-family: 'Lora', Georgia, serif;
      font-size: 17px; color: #1a1020;
    }
    .inst-sub {
      font-size: 10px; color: #9b8eaa;
      text-transform: uppercase; letter-spacing: .1em; margin-top: 3px;
    }
    .doc-tipo { text-align: right; }
    .doc-titulo {
      font-family: 'Lora', Georgia, serif;
      font-size: 15px; color: ${colorPrimario};
    }
    .doc-periodo { font-size: 12px; color: #9b8eaa; margin-top: 4px; }

    /* ── FRANJA ALUMNO ── */
    .alumno-strip {
      background: #f9f5fd;
      border-bottom: 1px solid #ede8f5;
      padding: 16px 36px;
      display: flex; justify-content: space-between; align-items: center;
    }
    .alumno-nombre {
      font-family: 'Lora', Georgia, serif;
      font-size: 18px; color: #1a1020;
    }
    .alumno-dni { font-size: 12px; color: #9b8eaa; margin-top: 3px; }
    .curso-chip {
      background: #ede0f7; color: ${colorPrimario};
      border-radius: 20px; padding: 5px 14px;
      font-size: 12px; font-weight: 600;
      white-space: nowrap; margin-left: 16px;
    }

    /* ── CUERPO ── */
    .body { padding: 28px 36px; }

    table { width: 100%; border-collapse: collapse; }
    th {
      font-size: 10px; font-weight: 700; color: #9b8eaa;
      text-transform: uppercase; letter-spacing: .1em;
      text-align: left; padding: 0 0 12px;
      border-bottom: 1px solid #ede8f5;
    }
    th:last-child { text-align: center; }
    td {
      padding: 12px 0; border-bottom: 1px solid #f5f0fa;
      font-size: 14px; color: #1a1020; vertical-align: middle;
    }
    tr:last-child td { border-bottom: none; }
    .td-fecha { font-size: 12px; color: #9b8eaa; white-space: nowrap; padding-right: 12px; }
    .td-nota  { text-align: center; }
    .td-vacio { text-align: center; padding: 24px 0; color: #9b8eaa; font-size: 13px; }

    .nota-badge {
      display: inline-block; min-width: 40px; height: 30px;
      border-radius: 6px; text-align: center; line-height: 30px;
      font-weight: 700; font-size: 13px; padding: 0 6px;
    }
    .tipo-badge {
      display: inline-block; background: #f5f0fa; color: #9b8eaa;
      border-radius: 10px; font-size: 10px; padding: 2px 8px;
      margin-left: 8px; font-weight: 600;
      text-transform: uppercase; letter-spacing: .05em;
    }

    /* ── OBSERVACIONES ── */
    .obs-block {
      margin-top: 24px; background: #faf5fd;
      border-left: 3px solid ${colorPrimario};
      border-radius: 0 10px 10px 0; padding: 16px 18px;
    }
    .obs-label {
      font-size: 10px; font-weight: 700; color: ${colorPrimario};
      text-transform: uppercase; letter-spacing: .1em; margin-bottom: 8px;
    }
    .obs-text { font-size: 13px; color: #5a4d6a; line-height: 1.6; }

    /* ── FIRMA ── */
    .firma-wrap { margin-top: 36px; display: flex; justify-content: flex-end; }
    .firma { text-align: center; min-width: 180px; }
    .firma-linea { border-top: 1px solid #1a1020; margin-bottom: 8px; }
    .firma-nombre { font-size: 13px; color: #1a1020; font-weight: 600; }
    .firma-rol    { font-size: 11px; color: #9b8eaa; margin-top: 3px; }

    /* ── FOOTER ── */
    .footer {
      background: ${colorPrimario}; margin-top: 32px;
      padding: 16px 36px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 11px; color: rgba(255,255,255,.65);
    }

    @media print {
      body { background: white; padding: 0; }
      .doc { box-shadow: none; border-radius: 0; max-width: 100%; }
    }
  </style>
</head>
<body>
  <div class="doc">

    <div class="head">
      <div class="head-inner">
        <div class="inst-block">
          <div class="inst-logo">${initials}</div>
          <div>
            <div class="inst-nombre">${institutoNombre}</div>
            <div class="inst-sub">${institutoSub}</div>
          </div>
        </div>
        <div class="doc-tipo">
          <div class="doc-titulo">Boletín de Calificaciones</div>
          <div class="doc-periodo">${periodo}</div>
        </div>
      </div>
    </div>

    <div class="alumno-strip">
      <div>
        <div class="alumno-nombre">${alumno.nombre} ${alumno.apellido}</div>
        ${alumno.dni ? `<div class="alumno-dni">DNI ${alumno.dni}</div>` : ''}
      </div>
      <span class="curso-chip">${(curso as any).nombre || ''}</span>
    </div>

    <div class="body">
      <table>
        <thead>
          <tr>
            <th>Evaluación</th>
            <th>Fecha</th>
            <th>Calificación</th>
          </tr>
        </thead>
        <tbody>
          ${filas}
        </tbody>
      </table>

      <div class="obs-block">
        <div class="obs-label">Observaciones del docente</div>
        <div class="obs-text">
          ${observacionesDocente || 'Sin observaciones registradas para este período.'}
        </div>
      </div>

      <div class="firma-wrap" style="display:flex;justify-content:space-between;margin-top:36px;">
        <div class="firma">
          <div class="firma-linea"></div>
          <div class="firma-nombre">${docenteNombre}</div>
          <div class="firma-rol">Docente a cargo</div>
        </div>
        <div class="firma">
          ${firmaDirectorUrl
            ? `<div style="height:56px;display:flex;align-items:flex-end;justify-content:center;margin-bottom:0">
                <img src="${firmaDirectorUrl}" style="max-height:52px;max-width:160px;object-fit:contain" />
               </div>`
            : '<div class="firma-linea"></div>'
          }
          <div class="firma-nombre">${directorNombre}</div>
          <div class="firma-rol">Director del Instituto</div>
        </div>
      </div>
    </div>

    <div class="footer">
      <span>${institutoNombre}</span>
      <span>Emitido: ${fechaEmision}</span>
    </div>

  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e) {
    console.error('[boletin]', e)
    return new NextResponse('Error interno', { status: 500 })
  }
}
