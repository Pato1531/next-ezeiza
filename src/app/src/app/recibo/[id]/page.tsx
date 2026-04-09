import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

// ── Supabase server-side (service role para bypass de RLS) ──
function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// ── Datos del pago (reutilizado por metadata y page) ──
async function getPago(id: string) {
  const sb = getSupabase()
  const { data, error } = await sb
    .from('pagos_alumnos')
    .select('*, alumnos(nombre, apellido, dni, nivel, color, telefono, padre_nombre, padre_telefono, es_menor, cuota_mensual)')
    .eq('id', id)
    .single()
  if (error || !data) return null
  return data
}

// ── OG meta tags — WhatsApp usa estos para la preview ──
export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = await getPago(params.id)
  if (!p) return { title: 'Recibo — Next Ezeiza' }
  const al = p.alumnos
  const monto = `$${(p.monto || 0).toLocaleString('es-AR')}`
  return {
    title: `Recibo de pago — ${al?.nombre} ${al?.apellido}`,
    description: `${al?.nombre} ${al?.apellido} · ${p.mes} ${p.anio} · ${monto}`,
    openGraph: {
      title: `Recibo Next Ezeiza — ${monto}`,
      description: `${al?.nombre} ${al?.apellido} · ${p.mes} ${p.anio} · ${p.metodo || 'Efectivo'}`,
      siteName: 'Next Ezeiza English Institute',
      type: 'website',
    },
  }
}

// ── Página del recibo ──
export default async function ReciboPage({ params }: { params: { id: string } }) {
  const p = await getPago(params.id)
  if (!p) notFound()

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

  const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Recibo ${al?.nombre} ${al?.apellido} — Next Ezeiza</title>
  <meta property="og:title" content="Recibo Next Ezeiza — $${monto}" />
  <meta property="og:description" content="${al?.nombre} ${al?.apellido} · ${p.mes} ${p.anio} · ${p.metodo || 'Efectivo'}" />
  <meta property="og:type" content="website" />
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
    .footer { background: #faf7fd; padding: 16px 20px; text-align: center; font-size: 12px; color: #9b8eaa; border-top: 1px solid #f0edf5; }
    .print-btn { display: block; width: calc(100% - 40px); margin: 16px 20px; padding: 14px; background: #652f8d; color: white; border: none; border-radius: 12px; font-size: 15px; font-weight: 700; cursor: pointer; text-align: center; }
    @media print { body { background: white; padding: 0; } .wrap { box-shadow: none; border-radius: 0; } .print-btn { display: none; } }
  </style>
</head>
<body>
  <div class="wrap">
    <div class="hdr">
      <div class="logo">Next <span>Ezeiza</span></div>
      <div class="rec-num">Comprobante #${num} · ${fecha}</div>
    </div>
    <div class="monto-sec">
      <div class="monto-lab">Total abonado</div>
      <div class="monto">$${monto}</div>
      <div class="monto-mes">Cuota ${p.mes} ${p.anio}</div>
    </div>
    <div class="body">
      <div class="fila">
        <div class="fila-lab">Alumno</div>
        <div class="fila-val">${al?.nombre} ${al?.apellido}</div>
      </div>
      ${al?.dni ? `<div class="fila"><div class="fila-lab">DNI</div><div class="fila-val">${al.dni}</div></div>` : ''}
      <div class="fila">
        <div class="fila-lab">Método</div>
        <div class="fila-val">${p.metodo || 'Efectivo'}</div>
      </div>
      <div class="fila">
        <div class="fila-lab">Fecha</div>
        <div class="fila-val">${fecha}</div>
      </div>
      ${p.observaciones ? `<div class="fila"><div class="fila-lab">Nota</div><div class="fila-val">${p.observaciones}</div></div>` : ''}
      <div class="fila">
        <div class="fila-lab">Estado</div>
        <div class="fila-val">
          <span class="badge" style="background:${estadoBg};color:${estadoColor}">✓ ${estadoLabel}</span>
        </div>
      </div>
    </div>
    <button class="print-btn" onclick="window.print()">Guardar / Imprimir</button>
    <div class="footer">Next Ezeiza English Institute · Ezeiza, Buenos Aires</div>
  </div>
</body>
</html>`

  // Retornar HTML directo (sin React) para máxima compatibilidad
  return new Response(html, {
    headers: { 'Content-Type': 'text/html; charset=utf-8' },
  }) as any
}
