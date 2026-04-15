import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function GET(
  req: NextRequest,
  { params }: { params: { alumnoId: string } }
) {
  try {
    const { searchParams } = new URL(req.url)
    const cursoId = searchParams.get('curso_id')

    if (!cursoId) {
      return new NextResponse('Parámetro curso_id requerido', { status: 400 })
    }

    const sb = getSupabase()

    // 1. Alumno
    const { data: alumno, error: errAl } = await sb
      .from('alumnos')
      .select('nombre, apellido, dni, nivel, instituto_id, fecha_alta')
      .eq('id', params.alumnoId)
      .single()

    if (errAl || !alumno) {
      return new NextResponse('Alumno no encontrado', { status: 404 })
    }

    // 2. Instituto
    let institutoNombre = 'Next Ezeiza English Institute'
    let institutoSub    = 'Ezeiza · Buenos Aires · Argentina'
    let colorPrimario   = '#652f8d'
    if (alumno.instituto_id) {
      const { data: inst } = await sb
        .from('institutos').select('nombre, color_primario').eq('id', alumno.instituto_id).single()
      if (inst?.nombre) {
        institutoNombre = inst.nombre
        institutoSub    = 'Buenos Aires · Argentina'
        if (inst.color_primario) colorPrimario = inst.color_primario
      }
    }

    // 3. Curso y docente
    const { data: curso, error: errCurso } = await sb
      .from('cursos')
      .select('nombre, nivel, dias, hora_inicio, hora_fin, profesoras(nombre, apellido)')
      .eq('id', cursoId)
      .single()

    if (errCurso || !curso) {
      return new NextResponse('Curso no encontrado', { status: 404 })
    }

    // 4. Director del instituto
    const { data: director } = await sb
      .from('usuarios')
      .select('nombre')
      .eq('rol', 'director')
      .eq('instituto_id', alumno.instituto_id)
      .single()

    const docente        = (curso as any).profesoras
    const docenteNombre  = docente ? `${docente.nombre} ${docente.apellido}` : 'Docente'
    const directorNombre = director?.nombre || 'Director'

    // 5. Carga horaria desde clases registradas
    const { data: clases } = await sb
      .from('clases').select('id').eq('curso_id', cursoId)

    const totalClases = clases?.length ?? 0
    let hsPorClase = 1.5
    if (curso.hora_inicio && curso.hora_fin) {
      const [h1, m1] = (curso.hora_inicio as string).split(':').map(Number)
      const [h2, m2] = (curso.hora_fin as string).split(':').map(Number)
      const diff = (h2 * 60 + m2) - (h1 * 60 + m1)
      if (diff > 0) hsPorClase = Math.round(diff / 60 * 10) / 10
    }
    const cargaHoraria = totalClases > 0
      ? `${Math.round(totalClases * hsPorClase)} hs`
      : '—'

    // 6. Número de certificado reproducible
    const certNum = `CE-${new Date().getFullYear()}-${(params.alumnoId + cursoId).replace(/-/g, '').slice(0, 6).toUpperCase()}`

    const fechaEmision = new Date().toLocaleDateString('es-AR', {
      day: 'numeric', month: 'long', year: 'numeric',
    })
    const anioActual = new Date().getFullYear()

    const diasStr = Array.isArray(curso.dias)
      ? (curso.dias as string[]).join(', ')
      : ((curso.dias as string) || '')

    const horarioStr = curso.hora_inicio && curso.hora_fin
      ? `de ${curso.hora_inicio} a ${curso.hora_fin}`
      : ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Certificado — ${alumno.nombre} ${alumno.apellido} — ${institutoNombre}</title>
  <style>
    @import url('https://fonts.googleapis.com/css2?family=Lora:ital,wght@0,400;0,600;0,700;1,400;1,600&family=Inter:wght@400;500;600&display=swap');
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

    .page {
      width: 100%;
      max-width: 620px;
      background: #fff;
      border: 5px solid ${colorPrimario};
      border-radius: 4px;
      box-shadow: 0 12px 48px rgba(101,47,141,.2);
    }

    /* Marco interior decorativo */
    .page-inner {
      border: 1px solid rgba(101,47,141,.25);
      margin: 10px;
      border-radius: 2px;
      overflow: hidden;
    }

    /* ── CABECERA ── */
    .head {
      background: ${colorPrimario};
      color: #fff;
      padding: 32px 48px 28px;
      text-align: center;
    }
    .head-escudo {
      width: 56px; height: 56px;
      background: rgba(255,255,255,.15);
      border: 2px solid rgba(255,255,255,.4);
      border-radius: 50%;
      display: flex; align-items: center; justify-content: center;
      margin: 0 auto 14px;
      font-size: 26px;
    }
    .inst-nombre {
      font-family: 'Lora', Georgia, serif;
      font-size: 22px; font-weight: 700; letter-spacing: .02em;
    }
    .inst-sub {
      font-size: 11px; opacity: .65;
      text-transform: uppercase; letter-spacing: .15em; margin-top: 5px;
    }

    /* ── CUERPO ── */
    .body { padding: 40px 56px 32px; text-align: center; }

    .cert-titulo {
      font-size: 11px; font-weight: 600; color: #9b8eaa;
      text-transform: uppercase; letter-spacing: .18em; margin-bottom: 20px;
    }
    .cert-certifica {
      font-family: 'Lora', Georgia, serif;
      font-style: italic; font-size: 16px; color: #5a4d6a; margin-bottom: 14px;
    }
    .cert-nombre-wrap {
      display: inline-block;
      padding-bottom: 12px;
      border-bottom: 2px solid ${colorPrimario};
      margin-bottom: 10px;
    }
    .cert-nombre {
      font-family: 'Lora', Georgia, serif;
      font-size: 34px; font-weight: 700; color: #1a1020; letter-spacing: -.5px;
    }
    .cert-dni { font-size: 13px; color: #9b8eaa; margin-bottom: 28px; }

    .cert-texto {
      font-family: 'Lora', Georgia, serif;
      font-size: 15px; color: #5a4d6a; line-height: 1.85;
      max-width: 440px; margin: 0 auto 30px;
    }
    .cert-texto strong { color: #1a1020; font-weight: 600; }
    .cert-texto em     { color: ${colorPrimario}; font-style: italic; }

    /* Datos clave */
    .cert-datos {
      display: flex; justify-content: center;
      border: 1px solid #ede8f5; border-radius: 12px;
      overflow: hidden; margin: 0 0 36px;
    }
    .cert-dato {
      flex: 1; padding: 16px 12px; text-align: center;
      border-right: 1px solid #ede8f5;
    }
    .cert-dato:last-child { border-right: none; }
    .cert-dato-val {
      font-family: 'Lora', Georgia, serif;
      font-size: 18px; font-weight: 700; color: ${colorPrimario};
    }
    .cert-dato-label {
      font-size: 10px; color: #9b8eaa;
      text-transform: uppercase; letter-spacing: .1em; margin-top: 4px;
    }

    /* ── FIRMAS ── */
    .firmas {
      display: flex; justify-content: space-around;
      margin: 8px 0 4px; padding-top: 8px;
    }
    .firma { text-align: center; min-width: 160px; }
    .firma-linea { width: 160px; border-top: 1px solid #1a1020; margin: 0 auto 8px; }
    .firma-nombre { font-size: 13px; color: #1a1020; font-weight: 600; }
    .firma-rol    { font-size: 11px; color: #9b8eaa; margin-top: 3px; }

    /* ── FOOTER ── */
    .footer {
      background: #f9f5fd; border-top: 1px solid #ede8f5;
      padding: 14px 36px;
      display: flex; justify-content: space-between; align-items: center;
      font-size: 10px; color: #9b8eaa;
      font-family: 'Courier New', monospace;
    }

    /* ── BOTÓN ── */
    .btn-print {
      display: block;
      width: calc(100% - 32px);
      margin: 16px auto 20px;
      background: ${colorPrimario};
      color: #fff; border: none; border-radius: 10px;
      padding: 13px; font-size: 15px; font-weight: 600;
      cursor: pointer; font-family: 'Inter', Arial, sans-serif;
    }
    .btn-print:hover { opacity: .9; }

    @media print {
      body { background: white; padding: 0; }
      .page { box-shadow: none; max-width: 100%; }
      .btn-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="page">
    <div class="page-inner">

      <div class="head">
        <div class="head-escudo">🎓</div>
        <div class="inst-nombre">${institutoNombre}</div>
        <div class="inst-sub">${institutoSub}</div>
      </div>

      <div class="body">
        <div class="cert-titulo">Certificado de Cursada</div>
        <div class="cert-certifica">Se certifica que</div>
        <div class="cert-nombre-wrap">
          <div class="cert-nombre">${alumno.nombre} ${alumno.apellido}</div>
        </div>
        ${alumno.dni
          ? `<div class="cert-dni">DNI ${alumno.dni}</div>`
          : '<div style="margin-bottom:28px"></div>'}

        <div class="cert-texto">
          ha completado satisfactoriamente el nivel
          <em>${(curso as any).nivel || (curso as any).nombre || 'English'}</em>,
          cursando <strong>${(curso as any).nombre}</strong>
          ${diasStr ? `los días <strong>${diasStr}</strong>` : ''}
          ${horarioStr ? `<strong>${horarioStr}</strong>` : ''},
          cumpliendo con los requisitos académicos establecidos por el instituto.
        </div>

        <div class="cert-datos">
          <div class="cert-dato">
            <div class="cert-dato-val">${(curso as any).nivel || 'N/A'}</div>
            <div class="cert-dato-label">Nivel</div>
          </div>
          <div class="cert-dato">
            <div class="cert-dato-val">${anioActual}</div>
            <div class="cert-dato-label">Año</div>
          </div>
          <div class="cert-dato">
            <div class="cert-dato-val">${cargaHoraria}</div>
            <div class="cert-dato-label">Carga horaria</div>
          </div>
        </div>

        <div class="firmas">
          <div class="firma">
            <div class="firma-linea"></div>
            <div class="firma-nombre">${docenteNombre}</div>
            <div class="firma-rol">Docente a cargo</div>
          </div>
          <div class="firma">
            <div class="firma-linea"></div>
            <div class="firma-nombre">${directorNombre}</div>
            <div class="firma-rol">Director del Instituto</div>
          </div>
        </div>
      </div>

      <div class="footer">
        <span>Cert. N° ${certNum}</span>
        <span>Emitido el ${fechaEmision}</span>
      </div>

    </div><!-- /page-inner -->

    <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>

  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e) {
    console.error('[certificado]', e)
    return new NextResponse('Error interno', { status: 500 })
  }
}
