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
      .select('*, alumnos(nombre, apellido, dni, nivel, cuota_mensual, cursos_alumnos(cursos(nombre, nivel)))')
      .eq('id', params.id)
      .single()

    if (error || !p) {
      return new NextResponse('Recibo no encontrado', { status: 404 })
    }

    // Datos del instituto para multi-tenant
    let institutoNombre = 'Next Ezeiza English Institute'
    let institutoSub = 'Instituto de Inglés · Ezeiza, Buenos Aires'
    if (p.instituto_id) {
      const { data: inst } = await sb
        .from('institutos')
        .select('nombre')
        .eq('id', p.instituto_id)
        .single()
      if (inst?.nombre) {
        institutoNombre = inst.nombre
        institutoSub = `Instituto de Inglés · Buenos Aires`
      }
    }

    const al = p.alumnos
    const cursoNombre = (al as any)?.cursos_alumnos?.[0]?.cursos?.nombre ?? null
    const monto = (p.monto || 0).toLocaleString('es-AR')
    const montoNum = Number(p.monto || 0)

    const fecha = p.fecha_pago
      ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR', {
          day: 'numeric', month: 'long', year: 'numeric',
        })
      : new Date().toLocaleDateString('es-AR', {
          day: 'numeric', month: 'long', year: 'numeric',
        })

    const fechaEmision = new Date().toLocaleDateString('es-AR', {
      day: '2-digit', month: '2-digit', year: 'numeric',
    })

    const num = params.id.slice(0, 6).toUpperCase()
    const cuotaMensual = al?.cuota_mensual || 0
    const ok   = montoNum > 0 && montoNum >= cuotaMensual
    const parc = montoNum > 0 && montoNum < cuotaMensual
    const estadoLabel = ok ? 'Pago completo' : parc ? 'Pago parcial' : 'Pendiente'
    const estadoColor = ok ? '#2d7a4f' : parc ? '#b45309' : '#c0392b'
    const estadoBg    = ok ? '#e6f4ec' : parc ? '#fef3cd' : '#fdeaea'
    const estadoDot   = ok ? '#2d7a4f' : parc ? '#b45309' : '#c0392b'

    const dniRow    = al?.dni    ? `<div class="row"><span class="row-label">DNI</span><span class="row-value">${al.dni}</span></div>` : ''
    const cursoRow  = cursoNombre ? `<div class="row"><span class="row-label">Curso</span><span class="row-value">${cursoNombre}</span></div>` : ''
    const obsRow    = p.observaciones ? `<div class="row"><span class="row-label">Observaciones</span><span class="row-value">${p.observaciones}</span></div>` : ''

    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <meta property="og:title" content="Recibo de pago — ${institutoNombre}" />
  <meta property="og:description" content="${al?.nombre ?? ''} ${al?.apellido ?? ''} · ${p.mes} ${p.anio} · $${monto}" />
  <meta property="og:site_name" content="${institutoNombre}" />
  <meta property="og:type" content="website" />
  <title>Recibo ${al?.nombre ?? ''} ${al?.apellido ?? ''} — ${institutoNombre}</title>
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
      max-width: 480px;
      background: #fff;
      border-radius: 20px;
      overflow: hidden;
      box-shadow: 0 8px 40px rgba(101,47,141,.18);
    }

    /* ── CABECERA ── */
    .head {
      background: #652f8d;
      padding: 30px 36px 26px;
      color: #fff;
    }
    .head-top {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
    }
    .inst-nombre {
      font-family: 'Lora', Georgia, serif;
      font-size: 20px;
      font-weight: 700;
      letter-spacing: -.2px;
    }
    .inst-sub {
      font-size: 11px;
      opacity: .65;
      margin-top: 3px;
      letter-spacing: .08em;
      text-transform: uppercase;
    }
    .rec-num-box { text-align: right; }
    .rec-num-label {
      font-size: 10px;
      opacity: .6;
      text-transform: uppercase;
      letter-spacing: .1em;
      display: block;
    }
    .rec-num-val {
      font-family: 'Courier New', Courier, monospace;
      font-size: 22px;
      font-weight: 700;
      letter-spacing: .06em;
    }
    .head-divider {
      border: none;
      border-top: 1px solid rgba(255,255,255,.22);
      margin: 20px 0 16px;
    }
    .head-meta {
      display: flex;
      justify-content: space-between;
      font-size: 12px;
      opacity: .75;
    }

    /* ── CUERPO ── */
    .body { padding: 30px 36px; }

    .section-label {
      font-size: 10px;
      font-weight: 600;
      color: #9b8eaa;
      letter-spacing: .1em;
      text-transform: uppercase;
      margin-bottom: 8px;
    }
    .alumno-nombre {
      font-family: 'Lora', Georgia, serif;
      font-size: 24px;
      color: #1a1020;
      margin-bottom: 4px;
      letter-spacing: -.3px;
    }
    .alumno-meta {
      font-size: 13px;
      color: #5a4d6a;
    }

    .separator {
      border: none;
      border-top: 1px solid #ede8f5;
      margin: 24px 0;
    }

    .rows { display: flex; flex-direction: column; }
    .row {
      display: flex;
      justify-content: space-between;
      align-items: center;
      padding: 10px 0;
      border-bottom: 1px solid #f5f0fa;
    }
    .row:last-child { border-bottom: none; }
    .row-label {
      font-size: 11px;
      font-weight: 600;
      color: #9b8eaa;
      text-transform: uppercase;
      letter-spacing: .08em;
    }
    .row-value {
      font-size: 14px;
      color: #1a1020;
      font-weight: 500;
      text-align: right;
      max-width: 62%;
    }

    /* ── CAJA DE MONTO ── */
    .monto-box {
      background: #f4eefb;
      border: 1px solid #d4a8e8;
      border-radius: 14px;
      padding: 22px 26px;
      margin: 24px 0;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .monto-label {
      font-size: 11px;
      font-weight: 700;
      color: #652f8d;
      text-transform: uppercase;
      letter-spacing: .1em;
    }
    .monto-periodo {
      font-size: 12px;
      color: #9b8eaa;
      margin-top: 4px;
    }
    .monto-valor {
      font-family: 'Lora', Georgia, serif;
      font-size: 38px;
      font-weight: 700;
      color: #652f8d;
      letter-spacing: -1px;
    }

    /* ── ESTADO ── */
    .estado-wrap { display: flex; justify-content: center; margin-top: 4px; }
    .badge-estado {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      border-radius: 20px;
      padding: 8px 20px;
      font-size: 13px;
      font-weight: 600;
      background: ${estadoBg};
      color: ${estadoColor};
    }
    .badge-dot {
      width: 8px;
      height: 8px;
      border-radius: 50%;
      background: ${estadoDot};
      flex-shrink: 0;
    }

    /* ── BOTÓN IMPRIMIR ── */
    .btn-print {
      display: block;
      width: calc(100% - 72px);
      margin: 22px 36px 24px;
      background: #652f8d;
      color: #fff;
      border: none;
      border-radius: 10px;
      padding: 14px;
      font-size: 15px;
      font-weight: 600;
      cursor: pointer;
      font-family: 'Inter', Arial, sans-serif;
      letter-spacing: .02em;
      transition: background .15s;
    }
    .btn-print:hover { background: #7d3aab; }

    /* ── FOOTER ── */
    .footer {
      background: #faf5fd;
      border-top: 1px solid #ede8f5;
      padding: 16px 36px;
      display: flex;
      justify-content: space-between;
      align-items: center;
      font-size: 11px;
      color: #9b8eaa;
    }
    .footer-id { font-family: 'Courier New', monospace; }

    /* ── PRINT ── */
    @media print {
      body { background: white; padding: 0; }
      .doc { box-shadow: none; border-radius: 0; max-width: 100%; }
      .btn-print { display: none !important; }
    }
  </style>
</head>
<body>
  <div class="doc">

    <div class="head">
      <div class="head-top">
        <div>
          <div class="inst-nombre">${institutoNombre}</div>
          <div class="inst-sub">${institutoSub}</div>
        </div>
        <div class="rec-num-box">
          <span class="rec-num-label">Recibo N°</span>
          <div class="rec-num-val">${num}</div>
        </div>
      </div>
      <hr class="head-divider" />
      <div class="head-meta">
        <span>Comprobante de pago de cuota mensual</span>
        <span>${fecha}</span>
      </div>
    </div>

    <div class="body">
      <div class="section-label">Alumno</div>
      <div class="alumno-nombre">${al?.nombre ?? ''} ${al?.apellido ?? ''}</div>
      ${al?.dni ? `<div class="alumno-meta">DNI ${al.dni}</div>` : ''}

      <hr class="separator" />

      <div class="rows">
        <div class="row">
          <span class="row-label">Período</span>
          <span class="row-value">${p.mes} ${p.anio}</span>
        </div>
        ${cursoRow}
        <div class="row">
          <span class="row-label">Método de pago</span>
          <span class="row-value">${p.metodo || 'Efectivo'}</span>
        </div>
        ${obsRow}
      </div>

      <div class="monto-box">
        <div>
          <div class="monto-label">Total abonado</div>
          <div class="monto-periodo">${p.mes} ${p.anio}</div>
        </div>
        <div class="monto-valor">$${monto}</div>
      </div>

      <div class="estado-wrap">
        <span class="badge-estado">
          <span class="badge-dot"></span>
          ${estadoLabel}
        </span>
      </div>
    </div>

    <button class="btn-print" onclick="window.print()">Imprimir / Guardar PDF</button>

    <div class="footer">
      <span class="footer-id">ID: ${params.id}</span>
      <span>Emitido: ${fechaEmision}</span>
    </div>

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
