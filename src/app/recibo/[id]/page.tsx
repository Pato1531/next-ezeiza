import { createClient } from '@supabase/supabase-js'
import { notFound } from 'next/navigation'
import type { Metadata } from 'next'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

async function getPago(id: string) {
  try {
    const sb = getSupabase()
    const { data, error } = await sb
      .from('pagos_alumnos')
      .select('*, alumnos(nombre, apellido, dni, nivel, cuota_mensual)')
      .eq('id', id)
      .single()
    if (error || !data) return null
    return data
  } catch {
    return null
  }
}

export async function generateMetadata({ params }: { params: { id: string } }): Promise<Metadata> {
  const p = await getPago(params.id)
  if (!p) return { title: 'Recibo — Next Ezeiza' }
  const al = p.alumnos
  const monto = `$${(p.monto || 0).toLocaleString('es-AR')}`
  return {
    title: `Recibo — ${al?.nombre} ${al?.apellido} · ${monto}`,
    description: `${al?.nombre} ${al?.apellido} · ${p.mes} ${p.anio} · ${monto}`,
    openGraph: {
      title: `Recibo Next Ezeiza — ${monto}`,
      description: `${al?.nombre} ${al?.apellido} · ${p.mes} ${p.anio} · ${p.metodo || 'Efectivo'}`,
      siteName: 'Next Ezeiza English Institute',
      type: 'website',
    },
  }
}

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

  return (
    <div style={{fontFamily:'Arial,Helvetica,sans-serif',background:'#f5f0fa',minHeight:'100vh',display:'flex',alignItems:'flex-start',justifyContent:'center',padding:'24px 16px'}}>
      <style>{`
        @media print {
          body { background: white !important; }
          .wrap { box-shadow: none !important; border-radius: 0 !important; }
          .print-btn { display: none !important; }
        }
      `}</style>
      <div className="wrap" style={{width:'100%',maxWidth:'420px',background:'white',borderRadius:'20px',overflow:'hidden',boxShadow:'0 8px 32px rgba(101,47,141,.15)'}}>

        {/* Header */}
        <div style={{background:'#652f8d',padding:'24px',color:'white'}}>
          <div style={{fontSize:'20px',fontWeight:900}}>Next <span style={{opacity:.65,fontWeight:400}}>Ezeiza</span></div>
          <div style={{fontSize:'12px',opacity:.65,marginTop:'4px'}}>Comprobante #{num} · {fecha}</div>
        </div>

        {/* Monto */}
        <div style={{background:'#f2e8f9',padding:'24px',textAlign:'center',borderBottom:'2px dashed #d4a8e8'}}>
          <div style={{fontSize:'11px',color:'#9b8eaa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Total abonado</div>
          <div style={{fontSize:'48px',fontWeight:900,color:'#652f8d',letterSpacing:'-2px',lineHeight:1}}>${monto}</div>
          <div style={{fontSize:'14px',color:'#9b8eaa',marginTop:'6px'}}>Cuota {p.mes} {p.anio}</div>
        </div>

        {/* Detalle */}
        <div style={{padding:'20px'}}>
          {[
            { label: 'Alumno', value: `${al?.nombre} ${al?.apellido}` },
            ...(al?.dni ? [{ label: 'DNI', value: al.dni }] : []),
            { label: 'Método', value: p.metodo || 'Efectivo' },
            { label: 'Fecha', value: fecha },
            ...(p.observaciones ? [{ label: 'Nota', value: p.observaciones }] : []),
          ].map((f, i, arr) => (
            <div key={f.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom: i < arr.length - 1 ? '1px solid #f0edf5' : 'none'}}>
              <div style={{fontSize:'11px',color:'#9b8eaa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em'}}>{f.label}</div>
              <div style={{fontSize:'14px',color:'#1a1020',fontWeight:600,textAlign:'right',maxWidth:'60%'}}>{f.value}</div>
            </div>
          ))}
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0'}}>
            <div style={{fontSize:'11px',color:'#9b8eaa',fontWeight:700,textTransform:'uppercase',letterSpacing:'.05em'}}>Estado</div>
            <span style={{padding:'4px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:700,background:estadoBg,color:estadoColor}}>
              ✓ {estadoLabel}
            </span>
          </div>
        </div>

        {/* Botón imprimir — necesita 'use client' así que usamos script inline */}
        <div style={{padding:'0 20px 20px'}}>
          <button
            className="print-btn"
            style={{display:'block',width:'100%',padding:'14px',background:'#652f8d',color:'white',border:'none',borderRadius:'12px',fontSize:'15px',fontWeight:700,cursor:'pointer',fontFamily:'Arial'}}
            onClick={() => window.print()}
          >
            Guardar / Imprimir
          </button>
        </div>

        <div style={{background:'#faf7fd',padding:'16px 20px',textAlign:'center',fontSize:'12px',color:'#9b8eaa',borderTop:'1px solid #f0edf5'}}>
          Next Ezeiza English Institute · Ezeiza, Buenos Aires
        </div>
      </div>
    </div>
  )
}
