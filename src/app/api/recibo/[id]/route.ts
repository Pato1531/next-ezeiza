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

    // Cargar el pago principal — incluye instituto_id del alumno para el nombre de sede
    const { data: p, error } = await sb
      .from('pagos_alumnos')
      .select('*, alumnos(nombre, apellido, dni, nivel, cuota_mensual, padre_nombre, es_menor, instituto_id)')
      .eq('id', params.id)
      .single()

    if (error || !p) {
      return new NextResponse('Recibo no encontrado', { status: 404 })
    }

    // Cargar TODOS los pagos del alumno en el mismo mes/año (cuota + matrícula)
    const { data: todosPagos } = await sb
      .from('pagos_alumnos')
      .select('id, monto, tipo, metodo, fecha_pago')
      .eq('alumno_id', p.alumno_id)
      .eq('mes', p.mes)
      .eq('anio', p.anio)
      .order('tipo', { ascending: true })

    const al = p.alumnos

    // Nombre dinámico de sede — leer desde la tabla institutos
    let institutoNombre = 'Next English Institute'
    let institutoCiudad = ''
    let colorPrimario   = '#652f8d'

    if (al?.instituto_id) {
      const { data: inst } = await sb
        .from('institutos')
        .select('nombre, color_primario')
        .eq('id', al.instituto_id)
        .single()
      if (inst?.nombre)         institutoNombre = inst.nombre
      if (inst?.color_primario) colorPrimario   = inst.color_primario
      // institutoCiudad queda como default — columna ciudad no existe en la tabla
    }

    // Logo: primera palabra en negrita, resto con opacidad (ej: "Next Prueba" → <b>Next</b> Prueba)
    const partes   = institutoNombre.split(' ')
    const logoHtml = partes.length >= 2
      ? `<strong>${partes[0]}</strong> <span>${partes.slice(1).join(' ')}</span>`
      : `<strong>${institutoNombre}</strong>`

    const num   = params.id.slice(0, 6).toUpperCase()
    const fecha = p.fecha_pago
      ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })

    // Construir líneas de detalle de pago
    const lineasPago = (todosPagos || [p]).map((pg: any) => {
      const label = pg.tipo === 'matricula' ? 'Matrícula' : `Cuota ${p.mes} ${p.anio}`
      return `
        <div class="linea-pago">
          <span class="linea-label">${label}</span>
          <span class="linea-monto">$${(pg.monto || 0).toLocaleString('es-AR')}</span>
        </div>`
    }).join('')

    const totalMonto   = (todosPagos || [p]).reduce((acc: number, pg: any) => acc + (pg.monto || 0), 0)
    const cuotaMensual = al?.cuota_mensual || 0
    const ok   = totalMonto >= cuotaMensual
    const parc = totalMonto > 0 && totalMonto < cuotaMensual
    const estadoLabel = ok ? 'Completo' : parc ? 'Parcial' : 'Pendiente'
    const estadoColor = ok ? '#2d7a4f' : parc ? '#b45309' : '#c0392b'
    const estadoBg    = ok ? '#e6f4ec' : parc ? '#fef3cd' : '#fdeaea'
    const dniRow      = al?.dni
      ? `<div class="fila"><div class="fila-lab">DNI</div><div class="fila-val">${al.dni}</div></div>`
      : ''
    const tieneMatricula = (todosPagos || []).some((pg: any) => pg.tipo === 'matricula')

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta property="og:title" content="Recibo ${institutoNombre} — $${totalMonto.toLocaleString('es-AR')}" />
  <meta property="og:description" content="${al?.nombre} ${al?.apellido} · ${p.mes} ${p.anio} · ${p.metodo || 'Efectivo'}" />
  <meta property="og:site_name" content="${institutoNombre}" />
  <title>Recibo ${al?.nombre} ${al?.apellido} — ${institutoNombre}</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f5f0fa; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; }
    .wrap { width: 100%; max-width: 420px; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 32px rgba(101,47,141,.15); }
    .hdr { background: ${colorPrimario}; padding: 24px; color: white; }
    .logo { font-size: 20px; font-weight: 900; }
    .logo span { opacity: .65; font-weight: 400; }
    .rec-num { font-size: 12px; opacity: .65; margin-top: 4px; }
    .monto-sec { background: #f2e8f9; padding: 20px 24px; border-bottom: 2px dashed #d4a8e8; }
    .monto-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 8px; }
    .monto { font-size: 44px; font-weight: 900; color: ${colorPrimario}; letter-spacing: -2px; line-height: 1; }
    .monto-mes { font-size: 13px; color: #9b8eaa; margin-top: 6px; }
    .detalle-pagos { padding: 12px 24px 0; }
    .linea-pago { display: flex; justify-content: space-between; align-items: center; padding: 7px 0; border-bottom: 1px dashed #e8dff2; }
    .linea-pago:last-child { border-bottom: none; }
    .linea-label { font-size: 13px; color: #5a4d6a; }
    .linea-monto { font-size: 14px; font-weight: 700; color: ${colorPrimario}; }
    .badge-matricula { font-size: 10px; background: #e0f0f7; color: #1a6b8a; padding: 2px 8px; border-radius: 10px; font-weight: 700; margin-left: 6px; }
    .body { padding: 16px 20px 4px; }
    .fila { display: flex; justify-content: space-between; align-items: center; padding: 11px 0; border-bottom: 1px solid #f0edf5; }
    .fila:last-child { border-bottom: none; }
    .fila-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .fila-val { font-size: 14px; color: #1a1020; font-weight: 600; text-align: right; max-width: 60%; }
    .badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .print-btn { display: block; width: calc(100% - 40px); margin: 16px 20px; padding: 14px; background: ${colorPrimario}; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Arial; }
    .footer { background: #faf7fd; padding: 16px 20px; text-align: center; font-size: 12px; color: #9b8eaa; border-top: 1px solid #f0edf5; }
    @media print { body { background: white; padding: 0; } .wrap { box-shadow: none; border-radius: 0; } .print-btn { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div class="logo">${logoHtml}</div>
      <div class="rec-num">Comprobante #${num} &middot; ${fecha}</div>
    </div>
    <div class="monto-sec">
      <div class="monto-lab">Total abonado${tieneMatricula ? ' <span class="badge-matricula">Incluye matrícula</span>' : ''}</div>
      <div class="monto">$${totalMonto.toLocaleString('es-AR')}</div>
      <div class="monto-mes">${p.mes} ${p.anio} &middot; ${p.metodo || 'Efectivo'}</div>
    </div>
    ${(todosPagos && todosPagos.length > 1) ? `<div class="detalle-pagos">${lineasPago}</div>` : ''}
    <div class="body">
      <div class="fila"><div class="fila-lab">Alumno</div><div class="fila-val">${al?.nombre} ${al?.apellido}</div></div>
      ${al?.es_menor ? `<div class="fila"><div class="fila-lab">Responsable</div><div class="fila-val">${al?.padre_nombre || ''}</div></div>` : ''}
      ${dniRow}
      <div class="fila"><div class="fila-lab">M&eacute;todo</div><div class="fila-val">${p.metodo || 'Efectivo'}</div></div>
      <div class="fila"><div class="fila-lab">Fecha</div><div class="fila-val">${fecha}</div></div>
      <div class="fila">
        <div class="fila-lab">Estado</div>
        <div class="fila-val"><span class="badge" style="background:${estadoBg};color:${estadoColor}">&#10003; ${estadoLabel}</span></div>
      </div>
    </div>
    <button class="print-btn" onclick="window.print()">Guardar / Imprimir</button>
    <div class="footer">${institutoNombre}${institutoCiudad ? ' &middot; ' + institutoCiudad : ''}</div>
  </div>
</body>
</html>`

    return new NextResponse(html, {
      headers: { 'Content-Type': 'text/html; charset=utf-8' },
    })
  } catch (e) {
    console.error('[recibo]', e)
    return new NextResponse('Error interno', { status: 500 })
  }
}
