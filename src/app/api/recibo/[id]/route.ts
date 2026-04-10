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
    const { data: p, error } = await sb
      .from('pagos_alumnos')
      .select('*, alumnos(nombre, apellido, dni, nivel, cuota_mensual)')
      .eq('id', params.id)
      .single()

    if (error || !p) {
      return new NextResponse('Recibo no encontrado', { status: 404 })
    }

    const al = p.alumnos
    const monto = (p.monto || 0).toLocaleString('es-AR')
    const fecha = p.fecha_pago
      ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
      : new Date().toLocaleDateString('es-AR', { day: 'numeric', month: 'long', year: 'numeric' })
    const num = params.id.slice(0, 6).toUpperCase()
    const ok = p.monto >= (al?.cuota_mensual || 0)
    const parc = p.monto > 0 && p.monto < (al?.cuota_mensual || 0)
    const estadoLabel = ok ? 'Completo' : parc ? 'Parcial' : 'Pendiente'
    const estadoColor = ok ? '#2d7a4f' : parc ? '#b45309' : '#c0392b'
    const estadoBg = ok ? '#e6f4ec' : parc ? '#fef3cd' : '#fdeaea'
    const dniRow = al?.dni ? `<div class="fila"><div class="fila-lab">DNI</div><div class="fila-val">${al.dni}</div></div>` : ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta property="og:title" content="Recibo Next Ezeiza — $${monto}" />
  <meta property="og:description" content="${al?.nombre} ${al?.apellido} &middot; ${p.mes} ${p.anio} &middot; ${p.metodo || 'Efectivo'}" />
  <meta property="og:site_name" content="Next Ezeiza English Institute" />
  <title>Recibo ${al?.nombre} ${al?.apellido} &mdash; Next Ezeiza</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: Arial, Helvetica, sans-serif; background: #f5f0fa; min-height: 100vh; display: flex; align-items: flex-start; justify-content: center; padding: 24px 16px; }
    .wrap { width: 100%; max-width: 420px; background: white; border-radius: 20px; overflow: hidden; box-shadow: 0 8px 32px rgba(101,47,141,.15); }
    .hdr { background: #652f8d; padding: 24px; color: white; }
    .logo { font-size: 20px; font-weight: 900; }
    .logo span { opacity: .65; font-weight: 400; }
    .rec-num { font-size: 12px; opacity: .65; margin-top: 4px; }
    .monto-sec { background: #f2e8f9; padding: 24px; text-align: center; border-bottom: 2px dashed #d4a8e8; }
    .monto-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .07em; margin-bottom: 8px; }
    .monto { font-size: 48px; font-weight: 900; color: #652f8d; letter-spacing: -2px; line-height: 1; }
    .monto-mes { font-size: 14px; color: #9b8eaa; margin-top: 6px; }
    .body { padding: 20px; }
    .fila { display: flex; justify-content: space-between; align-items: center; padding: 11px 0; border-bottom: 1px solid #f0edf5; }
    .fila:last-child { border-bottom: none; }
    .fila-lab { font-size: 11px; color: #9b8eaa; font-weight: 700; text-transform: uppercase; letter-spacing: .05em; }
    .fila-val { font-size: 14px; color: #1a1020; font-weight: 600; text-align: right; max-width: 60%; }
    .badge { padding: 4px 12px; border-radius: 20px; font-size: 12px; font-weight: 700; }
    .print-btn { display: block; width: calc(100% - 40px); margin: 16px 20px; padding: 14px; background: #652f8d; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; font-family: Arial; }
    .footer { background: #faf7fd; padding: 16px 20px; text-align: center; font-size: 12px; color: #9b8eaa; border-top: 1px solid #f0edf5; }
    @media print { body { background: white; padding: 0; } .wrap { box-shadow: none; border-radius: 0; } .print-btn { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div class="logo">Next <span>Ezeiza</span></div>
      <div class="rec-num">Comprobante #${num} &middot; ${fecha}</div>
    </div>
    <div class="monto-sec">
      <div class="monto-lab">Total abonado</div>
      <div class="monto">$${monto}</div>
      <div class="monto-mes">Cuota ${p.mes} ${p.anio}</div>
    </div>
    <div class="body">
      <div class="fila"><div class="fila-lab">Alumno</div><div class="fila-val">${al?.nombre} ${al?.apellido}</div></div>
      ${dniRow}
      <div class="fila"><div class="fila-lab">M&eacute;todo</div><div class="fila-val">${p.metodo || 'Efectivo'}</div></div>
      <div class="fila"><div class="fila-lab">Fecha</div><div class="fila-val">${fecha}</div></div>
      <div class="fila">
        <div class="fila-lab">Estado</div>
        <div class="fila-val"><span class="badge" style="background:${estadoBg};color:${estadoColor}">&#10003; ${estadoLabel}</span></div>
      </div>
    </div>
    <button class="print-btn" onclick="window.print()">Guardar / Imprimir</button>
    <div class="footer">Next Ezeiza English Institute &middot; Ezeiza, Buenos Aires</div>
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
