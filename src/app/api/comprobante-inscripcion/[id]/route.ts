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
  { params }: { params: { id: string } }
) {
  try {
    const sb = getSupabase()

    // ── Alumno + instituto en un solo JOIN ────────────────────────────────
    const { data: al, error } = await sb
      .from('alumnos')
      .select(`
        nombre, apellido, dni, nivel, fecha_nacimiento, fecha_alta,
        telefono, email, cuota_mensual, matricula, es_menor,
        padre_nombre, padre_apellido, padre_dni, padre_telefono, padre_email,
        instituto_id,
        institutos ( nombre, ciudad, color_primario, firma_director_url )
      `)
      .eq('id', params.id)
      .single()

    if (error || !al) {
      return new NextResponse('Alumno no encontrado', { status: 404 })
    }

    const inst = (al as any).institutos as any

    // ── Datos del instituto — dinámico para cualquier sede ───────────────
    const institutoNombre    = inst?.nombre || 'EduGest'
    const ciudad             = inst?.ciudad || 'Buenos Aires'
    const colorPrimario      = inst?.color_primario || '#652f8d'
    const institutoSubtitulo = inst?.nombre
      ? `${inst.nombre} English Institute · ${ciudad}`
      : 'Instituto de Inglés · Buenos Aires'

    // Partes visuales: primera palabra en bold, resto normal (ej: "Next Prueba")
    const partesNombre  = institutoNombre.split(' ')
    const nombrePrimera = partesNombre[0]
    const nombreResto   = partesNombre.slice(1).join(' ')

    // ── Firma del director, embebida en base64 (un blob HTML no puede cargar imágenes externas) ──
    let firmaBase64 = ''
    if (inst?.firma_director_url) {
      try {
        const urlLimpia = (inst.firma_director_url as string).split('?')[0]
        const imgRes = await fetch(urlLimpia)
        if (imgRes.ok) {
          const contentType = imgRes.headers.get('content-type') || 'image/png'
          const arrayBuffer = await imgRes.arrayBuffer()
          const base64 = Buffer.from(arrayBuffer).toString('base64')
          firmaBase64 = `data:${contentType};base64,${base64}`
        }
      } catch {
        firmaBase64 = ''
      }
    }

    let directorNombre = ''
    if (al.instituto_id) {
      const { data: director } = await sb
        .from('usuarios')
        .select('nombre')
        .eq('rol', 'director')
        .eq('instituto_id', al.instituto_id)
        .single()
      directorNombre = director?.nombre || ''
    }

    const num = params.id.slice(0, 6).toUpperCase()

    const fmtFecha = (f: string | null) =>
      f
        ? new Date(f + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
        : new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

    const fechaInscripcion = fmtFecha(al.fecha_alta as string)
    const fechaEmision = new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

    const dniRow = al.dni
      ? `<div class="fila"><div class="fila-lab">DNI</div><div class="fila-val">${al.dni}</div></div>`
      : ''

    const fechaNacRow = al.fecha_nacimiento
      ? `<div class="fila"><div class="fila-lab">Fecha de nacimiento</div><div class="fila-val">${fmtFecha(al.fecha_nacimiento as string)}</div></div>`
      : ''

    const responsableRows = al.es_menor
      ? `
      <div class="fila"><div class="fila-lab">Responsable</div><div class="fila-val">${al.padre_nombre || ''} ${al.padre_apellido || ''}</div></div>
      ${al.padre_dni ? `<div class="fila"><div class="fila-lab">DNI responsable</div><div class="fila-val">${al.padre_dni}</div></div>` : ''}
      ${al.padre_telefono ? `<div class="fila"><div class="fila-lab">Teléfono</div><div class="fila-val">${al.padre_telefono}</div></div>` : ''}
      ${al.padre_email ? `<div class="fila"><div class="fila-lab">Email</div><div class="fila-val">${al.padre_email}</div></div>` : ''}
      `
      : `
      ${al.telefono ? `<div class="fila"><div class="fila-lab">Teléfono</div><div class="fila-val">${al.telefono}</div></div>` : ''}
      ${al.email ? `<div class="fila"><div class="fila-lab">Email</div><div class="fila-val">${al.email}</div></div>` : ''}
      `

    const matricula = al.matricula || 0
    const cuota     = al.cuota_mensual || 0

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta property="og:title" content="Comprobante de inscripción — ${institutoNombre}" />
  <meta property="og:description" content="${al.nombre} ${al.apellido} · Nivel ${al.nivel || ''}" />
  <meta property="og:site_name" content="${institutoSubtitulo}" />
  <title>Comprobante de inscripción — ${al.nombre} ${al.apellido} — ${institutoNombre}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f5f0fa; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; }
    .wrap { width: 100%; max-width: 420px; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 32px rgba(101,47,141,.15); }
    .hdr { background: ${colorPrimario}; padding: 24px; color: white; }
    .logo { font-size: 20px; font-weight: 900; }
    .logo span { opacity: .65; font-weight: 400; }
    .rec-num { font-size: 12px; opacity: .65; margin-top: 4px; }
    .estado-sec { background: #f2e8f9; padding: 22px 24px; border-bottom: 2px dashed #d4a8e8; text-align: center; }
    .estado-check { font-size: 34px; margin-bottom: 6px; }
    .estado-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 4px; }
    .estado-txt { font-size: 20px; font-weight: 900; color: ${colorPrimario}; letter-spacing: -.5px; line-height: 1.2; }
    .estado-sub { font-size: 13px; color: #9b8eaa; margin-top: 6px; }
    .montos { display: flex; gap: 10px; padding: 14px 24px 0; }
    .monto-chip { flex: 1; background: #faf7fd; border: 1.5px solid #f0e5f8; border-radius: 12px; padding: 10px; text-align: center; }
    .monto-chip-lab { font-size: 10px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; margin-bottom: 4px; }
    .monto-chip-val { font-size: 16px; font-weight: 800; color: #1a1020; }
    .body { padding: 16px 20px 4px; }
    .seccion-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin: 10px 0 2px; }
    .fila { display: flex; justify-content: space-between; align-items: center; padding: 11px 0; border-bottom: 1px solid #f0edf5; gap: 10px; }
    .fila:last-child { border-bottom: none; }
    .fila-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; white-space: nowrap; }
    .fila-val { font-size: 14px; color: #1a1020; font-weight: 600; text-align: right; max-width: 62%; }
    .firma-sec { padding: 20px 24px 4px; text-align: center; }
    .firma-img { height: 46px; max-width: 150px; object-fit: contain; margin: 0 auto 6px; display: block; }
    .firma-linea { width: 160px; border-top: 1.5px solid #d8cce4; margin: 24px auto 6px; }
    .firma-nombre { font-size: 12px; font-weight: 700; color: #1a1020; }
    .firma-rol { font-size: 10.5px; color: #9b8eaa; }
    .print-btn { display: block; width: calc(100% - 40px); margin: 18px 20px 16px; padding: 14px; background: ${colorPrimario}; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Arial; }
    .footer { background: #faf7fd; padding: 16px 20px; text-align: center; font-size: 12px; color: #9b8eaa; border-top: 1px solid #f0edf5; }
    @media print { body { background: white; padding: 0; } .wrap { box-shadow: none; border-radius: 0; } .print-btn { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div class="logo">${nombrePrimera}${nombreResto ? ` <span>${nombreResto}</span>` : ''}</div>
      <div class="rec-num">Comprobante #${num} &middot; ${fechaEmision}</div>
    </div>

    <div class="estado-sec">
      <div class="estado-check">✅</div>
      <div class="estado-lab">Inscripción confirmada</div>
      <div class="estado-txt">${al.nombre} ${al.apellido}</div>
      <div class="estado-sub">Nivel ${al.nivel || '—'} &middot; Inscripto el ${fechaInscripcion}</div>
    </div>

    ${(matricula > 0 || cuota > 0) ? `
    <div class="montos">
      ${matricula > 0 ? `<div class="monto-chip"><div class="monto-chip-lab">Matrícula</div><div class="monto-chip-val">$${matricula.toLocaleString('es-AR')}</div></div>` : ''}
      ${cuota > 0 ? `<div class="monto-chip"><div class="monto-chip-lab">Cuota mensual</div><div class="monto-chip-val">$${cuota.toLocaleString('es-AR')}</div></div>` : ''}
    </div>` : ''}

    <div class="body">
      <div class="seccion-lab">Datos del alumno</div>
      ${dniRow}
      ${fechaNacRow}
      <div class="fila"><div class="fila-lab">Nivel</div><div class="fila-val">${al.nivel || '—'}</div></div>
      <div class="fila"><div class="fila-lab">Fecha de inscripción</div><div class="fila-val">${fechaInscripcion}</div></div>
      ${responsableRows ? `<div class="seccion-lab">${al.es_menor ? 'Datos del responsable' : 'Contacto'}</div>${responsableRows}` : ''}
    </div>

    <div class="firma-sec">
      ${firmaBase64
        ? `<img class="firma-img" src="${firmaBase64}" />`
        : '<div class="firma-linea"></div>'
      }
      ${directorNombre ? `<div class="firma-nombre">${directorNombre}</div><div class="firma-rol">Director del Instituto</div>` : ''}
    </div>

    <button class="print-btn" onclick="window.print()">Guardar / Imprimir PDF</button>
    <div class="footer">${institutoSubtitulo}</div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e) {
    console.error('[comprobante-inscripcion]', e)
    return new NextResponse('Error interno', { status: 500 })
  }
}
