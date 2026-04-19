'use client'
import { useState, useEffect } from 'react'
import { useAlumnos, apiHeaders, logActivity } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { showToast } from '@/components/Toast'

// ── Constantes ────────────────────────────────────────────────────────────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtFecha(f: string) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

// ── Componentes UI locales ────────────────────────────────────────────────────
const SL = ({ children, style }: any) => (
  <div style={{ fontSize:'11px', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.07em', ...style }}>
    {children}
  </div>
)
const Av = ({ color, size, children }: any) => (
  <div style={{ width:size, height:size, borderRadius:Math.round(size*.32)+'px', background:color, display:'flex', alignItems:'center', justifyContent:'center', fontSize:size*.28+'px', fontWeight:700, color:'#fff', flexShrink:0 }}>
    {children}
  </div>
)
const ModalSheet = ({ title, children, onClose }: any) => (
  <div style={{ position:'fixed', inset:0, background:'rgba(20,0,40,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:200 }} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
    <div style={{ background:'var(--white)', borderRadius:'24px 24px 0 0', padding:'28px 20px 32px', width:'100%', maxWidth:'480px', maxHeight:'90vh', overflowY:'auto' }}>
      <div style={{ width:'40px', height:'4px', background:'var(--border)', borderRadius:'2px', margin:'0 auto 20px' }} />
      <div style={{ fontSize:'18px', fontWeight:700, marginBottom:'20px' }}>{title}</div>
      {children}
    </div>
  </div>
)

// ── Componente principal ──────────────────────────────────────────────────────
export default function Pagos() {
  const { alumnos } = useAlumnos()
  const { usuario } = useAuth()
  const puedeEliminar = usuario?.rol === 'director' || usuario?.rol === 'secretaria'
  const mesActual = MESES[new Date().getMonth()]
  const anioActual = new Date().getFullYear()

  const [vistaTab, setVistaTab] = useState<'registrar' | 'reporte'>('registrar')

  // ── Estado: Reporte ───────────────────────────────────────────────────────
  const [repMes, setRepMes] = useState(mesActual)
  const [repAnio, setRepAnio] = useState(anioActual)
  const [pagosReporte, setPagosReporte] = useState<any[]>([])
  const [loadingReporte, setLoadingReporte] = useState(false)
  const [filtroRepDia, setFiltroRepDia] = useState('')
  const [filtroRepMetodo, setFiltroRepMetodo] = useState('')
  const [pagoEditando, setPagoEditando] = useState<any>(null)
  const [guardandoEditPago, setGuardandoEditPago] = useState(false)
  const [eliminandoPago, setEliminandoPago] = useState(false)

  // ── Estado: Registrar ─────────────────────────────────────────────────────
  const [mes, setMes] = useState(mesActual)
  const [metodo, setMetodo] = useState('Efectivo')
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [alumnosPagadosMes, setAlumnosPagadosMes] = useState<Set<string>>(new Set())
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  // Conceptos
  const [cobrarCuota, setCobrarCuota] = useState(true)
  const [cobrarRecargo, setCobrarRecargo] = useState(false)
  const [montoRecargo, setMontoRecargo] = useState('')
  const [cobrarMatricula, setCobrarMatricula] = useState(false)

  // ── Cargar reporte ────────────────────────────────────────────────────────
  const cargarReporte = async () => {
    setLoadingReporte(true)
    try {
      const sb = createClient()
      const { data } = await sb
        .from('pagos_alumnos')
        .select('*, alumnos(nombre,apellido,nivel,cuota_mensual,color,telefono,padre_nombre,padre_telefono,es_menor)')
        .eq('mes', repMes)
        .eq('anio', repAnio)
        .order('created_at', { ascending: false })
      setPagosReporte(data || [])
    } catch (e) { console.error(e) }
    setLoadingReporte(false)
  }

  useEffect(() => {
    if (vistaTab === 'reporte') cargarReporte()
  }, [vistaTab, repMes, repAnio])

  // ── Cargar quiénes ya pagaron el mes ─────────────────────────────────────
  useEffect(() => {
    const cargar = async () => {
      try {
        const params = new URLSearchParams({ mes, anio: String(anioActual) })
        const res = await fetch(`/api/registrar-pago?${params}`, { headers: apiHeaders() })
        const json = await res.json()
        if (json.data) {
          setAlumnosPagadosMes(new Set(json.data.map((r: any) => r.alumno_id)))
        } else {
          setAlumnosPagadosMes(new Set())
        }
      } catch {
        setAlumnosPagadosMes(new Set())
      }
    }
    cargar()
  }, [mes])

  // ── Filtros ───────────────────────────────────────────────────────────────
  const pagosReporteFiltrados = pagosReporte.filter(p => {
    const fechaNorm = p.fecha_pago ? p.fecha_pago.slice(0, 10) : ''
    const matchDia = !filtroRepDia || fechaNorm === filtroRepDia
    const matchMetodo = !filtroRepMetodo || p.metodo === filtroRepMetodo
    return matchDia && matchMetodo
  })
  const totalRecaudado = pagosReporteFiltrados.reduce((s, p) => s + (p.monto || 0), 0)

  const filtrados = busqueda
    ? alumnos.filter((a: any) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(busqueda.toLowerCase()))
    : alumnos

  const totalMonto = [...seleccionados].reduce((sum, id) => {
    const a = alumnos.find((x: any) => x.id === id)
    if (!a) return sum
    let t = 0
    if (cobrarCuota) t += (a.cuota_mensual || 0)
    if (cobrarRecargo) t += (parseFloat(montoRecargo) || 0)
    if (cobrarMatricula) t += (a.matricula || 0)
    return sum + t
  }, 0)

  // ── Selección alumnos ─────────────────────────────────────────────────────
  const toggleAlumno = (id: string) => {
    setSeleccionados(prev => {
      const n = new Set(prev)
      n.has(id) ? n.delete(id) : n.add(id)
      return n
    })
  }
  const toggleTodos = () => {
    if (seleccionados.size === filtrados.length) {
      setSeleccionados(new Set())
    } else {
      setSeleccionados(new Set(filtrados.map((a: any) => a.id)))
    }
  }

  // ── Guardar pagos ─────────────────────────────────────────────────────────
  const guardar = async () => {
    if (seleccionados.size === 0) return alert('Seleccioná al menos un alumno')
    if (!cobrarCuota && !cobrarRecargo && !cobrarMatricula) return alert('Seleccioná al menos un concepto')
    if (cobrarRecargo && (!montoRecargo || parseFloat(montoRecargo) <= 0)) return alert('Ingresá el monto del recargo')

    setGuardando(true)
    const fecha = new Date().toISOString().split('T')[0]
    const alumnosSeleccionados = alumnos.filter((a: any) => seleccionados.has(a.id))

    const inserts: any[] = []
    for (const a of alumnosSeleccionados) {
      if (cobrarCuota) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: a.cuota_mensual || 0,
        tipo: 'cuota', observaciones: `Cuota ${mes} ${anioActual}`,
      })
      if (cobrarRecargo) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: parseFloat(montoRecargo) || 0,
        tipo: 'recargo', observaciones: `Cuota con recargo ${mes} ${anioActual}`,
      })
      if (cobrarMatricula) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: a.matricula || 0,
        tipo: 'matricula', observaciones: 'Matrícula',
      })
    }

    try {
      const resultados = await Promise.all(
        inserts.map(ins =>
          fetch('/api/registrar-pago', {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify(ins),
          }).then(r => r.json())
        )
      )
      const errores = resultados.filter(r => r.error)
      if (errores.length > 0) {
        console.error('[Pagos] errores:', errores)
        alert(`${errores.length} pago(s) no se pudieron guardar.`)
      }
      showToast(`✓ ${alumnosSeleccionados.length} alumno${alumnosSeleccionados.length !== 1 ? 's' : ''} · ${inserts.length} concepto${inserts.length !== 1 ? 's' : ''} registrado${inserts.length !== 1 ? 's' : ''}`)
      logActivity('Registró pagos', 'Pagos', `${alumnosSeleccionados.length} alumnos · ${mes} ${anioActual}`)
      const alumnosOk = [...new Set(resultados.filter(r => !r.error).map((_, i) => inserts[i].alumno_id))]
      alumnosOk.forEach(id => window.dispatchEvent(new CustomEvent('pago-registrado', { detail: { alumno_id: id } })))
      setAlumnosPagadosMes(prev => new Set([...prev, ...alumnosOk]))
    } catch (e) {
      console.error('[Pagos] catch:', e)
      alert('Error de conexión al guardar los pagos.')
    }

    setGuardando(false)
    setGuardado(true)
    setSeleccionados(new Set())
    setTimeout(() => setGuardado(false), 3000)
  }

  // ── Exportar Excel ────────────────────────────────────────────────────────
  const descargarExcel = () => {
    const rows = [
      ['REPORTE DE PAGOS'],
      [`Mes: ${repMes} ${repAnio}`, '', '', `Total: $${totalRecaudado.toLocaleString('es-AR')}`],
      [''],
      ['Alumno', 'Nivel', 'Monto', 'Método', 'Fecha', 'Observaciones'],
      ...pagosReporteFiltrados.map(p => [
        `${p.alumnos?.nombre} ${p.alumnos?.apellido}`,
        p.alumnos?.nivel || '—',
        `$${p.monto?.toLocaleString('es-AR')}`,
        p.metodo || '—',
        p.fecha_pago ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR') : '—',
        p.observaciones || '—',
      ]),
    ]
    const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url
    a.download = `pagos-${repMes}-${repAnio}.csv`
    a.click()
    URL.revokeObjectURL(url)
  }

  // ── Exportar PDF ──────────────────────────────────────────────────────────
  const descargarPDF = () => {
    const filas = pagosReporteFiltrados.map(p => `
      <tr>
        <td>${p.alumnos?.nombre} ${p.alumnos?.apellido}</td>
        <td>${p.alumnos?.nivel || '—'}</td>
        <td style="font-weight:600;color:#652f8d">$${p.monto?.toLocaleString('es-AR')}</td>
        <td>${p.metodo || '—'}</td>
        <td>${p.fecha_pago ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR') : '—'}</td>
      </tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Pagos ${repMes} ${repAnio}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#1a1020}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #652f8d;padding-bottom:14px;margin-bottom:20px}
      .logo{font-size:20px;font-weight:700}.logo span{color:#652f8d}
      h1{color:#652f8d;font-size:18px;margin:0 0 4px}
      .total{background:#f2e8f9;padding:12px 16px;border-radius:10px;display:flex;justify-content:space-between;margin-bottom:16px}
      table{width:100%;border-collapse:collapse}
      th{border-bottom:2px solid #652f8d;padding:9px 8px;text-align:left;font-size:11px;text-transform:uppercase;color:#652f8d;letter-spacing:.04em}
      td{padding:9px 8px;border-bottom:1px solid #f0edf5}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="hd">
      <div class="logo"><span>Next</span> Ezeiza</div>
      <div style="font-size:12px;color:#888">${new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })}</div>
    </div>
    <h1>Reporte de Pagos — ${repMes} ${repAnio}</h1>
    <div class="total">
      <span style="font-weight:600;color:#652f8d">${pagosReporte.length} pagos registrados</span>
      <span style="font-size:18px;font-weight:700;color:#652f8d">Total: $${totalRecaudado.toLocaleString('es-AR')}</span>
    </div>
    <table><tr><th>Alumno</th><th>Nivel</th><th>Monto</th><th>Método</th><th>Fecha</th></tr>
    ${filas}
    </table>
    <script>setTimeout(function(){window.print()},400)</script>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = `pagos-${repMes}-${repAnio}.html`
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  // ── Render ────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">
      {/* Tabs */}
      <div style={{ display:'flex', gap:'8px', marginBottom:'16px' }}>
        <button
          onClick={() => setVistaTab('registrar')}
          style={{ padding:'9px 18px', borderRadius:'20px', border:'1.5px solid', fontSize:'13px', fontWeight:600, cursor:'pointer',
            background: vistaTab === 'registrar' ? 'var(--v)' : 'transparent',
            color: vistaTab === 'registrar' ? '#fff' : 'var(--text2)',
            borderColor: vistaTab === 'registrar' ? 'var(--v)' : 'var(--border)' }}>
          Registrar pagos
        </button>
        <button
          onClick={() => setVistaTab('reporte')}
          style={{ padding:'9px 18px', borderRadius:'20px', border:'1.5px solid', fontSize:'13px', fontWeight:600, cursor:'pointer',
            background: vistaTab === 'reporte' ? 'var(--v)' : 'transparent',
            color: vistaTab === 'reporte' ? '#fff' : 'var(--text2)',
            borderColor: vistaTab === 'reporte' ? 'var(--v)' : 'var(--border)' }}>
          Reporte
        </button>
      </div>

      {/* ── VISTA REPORTE ─────────────────────────────────────────────────── */}
      {vistaTab === 'reporte' && (
        <div>
          {/* Filtros reporte */}
          <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'16px', padding:'16px', marginBottom:'14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Mes</div>
                <select style={IS} value={repMes} onChange={e => { setRepMes(e.target.value); setFiltroRepDia('') }}>
                  {MESES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Año</div>
                <select style={IS} value={repAnio} onChange={e => { setRepAnio(+e.target.value); setFiltroRepDia('') }}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Filtrar por día</div>
                <input type="date" style={IS} value={filtroRepDia} onChange={e => setFiltroRepDia(e.target.value)} />
              </div>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Método de pago</div>
                <select style={IS} value={filtroRepMetodo} onChange={e => setFiltroRepMetodo(e.target.value)}>
                  <option value="">Todos</option>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  <option>MercadoPago</option>
                </select>
              </div>
            </div>
          </div>

          {loadingReporte ? (
            <div style={{ textAlign:'center', padding:'32px', color:'var(--text3)' }}>Cargando...</div>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
                <div>
                  <div style={{ fontSize:'15px', fontWeight:700 }}>
                    {pagosReporteFiltrados.length} pagos{filtroRepDia ? ` · ${new Date(filtroRepDia + 'T12:00:00').toLocaleDateString('es-AR')}` : ` · ${repMes} ${repAnio}`}
                  </div>
                  <div style={{ fontSize:'13px', color:'var(--v)', fontWeight:600 }}>Total: ${totalRecaudado.toLocaleString('es-AR')}</div>
                </div>
                <div style={{ display:'flex', gap:'8px' }}>
                  <button onClick={descargarExcel} style={{ padding:'9px 14px', background:'var(--white)', color:'var(--green)', border:'1.5px solid var(--green)', borderRadius:'10px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>⬇ Excel</button>
                  <button onClick={descargarPDF} style={{ padding:'9px 14px', background:'var(--v)', color:'#fff', border:'none', borderRadius:'10px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>⬇ PDF</button>
                </div>
              </div>

              {pagosReporte.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)', background:'var(--white)', borderRadius:'14px', border:'1.5px solid var(--border)' }}>
                  No hay pagos para los filtros seleccionados
                </div>
              ) : (
                <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
                  {pagosReporteFiltrados.map((p: any, i: number) => {
                    const tel = p.alumnos?.es_menor
                      ? (p.alumnos.padre_telefono || p.alumnos.telefono)
                      : (p.alumnos?.telefono || p.alumnos?.padre_telefono)
                    const cel = tel?.replace(/\D/g, '')
                    const contacto = p.alumnos?.es_menor ? (p.alumnos.padre_nombre || p.alumnos.nombre) : p.alumnos?.nombre
                    const fechaFmt = p.fecha_pago
                      ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })
                      : new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })
                    const urlRecibo = typeof window !== 'undefined' ? `${window.location.origin}/api/recibo/${p.id}` : ''
                    const textoWS = `✅ *Recibo de pago*\n\nHola ${contacto}! Confirmamos el pago de *${p.mes} ${p.anio}* de *${p.alumnos?.nombre} ${p.alumnos?.apellido}*.\n\n💰 Monto: *$${p.monto?.toLocaleString('es-AR')}*\n📅 Fecha: ${fechaFmt}\n💳 Método: ${p.metodo || 'Efectivo'}\n\n📄 Tu recibo: ${urlRecibo}\n\n¡Gracias! 🙌`
                    return (
                      <div key={p.id} style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'12px 16px', borderBottom: i < pagosReporteFiltrados.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:p.alumnos?.color || '#652f8d', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {p.alumnos?.nombre?.[0]}{p.alumnos?.apellido?.[0]}
                          </div>
                          <div>
                            <div style={{ fontSize:'13.5px', fontWeight:600 }}>{p.alumnos?.nombre} {p.alumnos?.apellido}</div>
                            <div style={{ fontSize:'11px', color:'var(--text3)' }}>{p.metodo} · {p.fecha_pago ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR') : '—'}</div>
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          <div style={{ fontSize:'15px', fontWeight:700, color:'var(--v)' }}>${p.monto?.toLocaleString('es-AR')}</div>
                          {cel && (
                            <a
                              href={`https://wa.me/54${cel}?text=${encodeURIComponent(textoWS)}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ padding:'5px 10px', background:'#25D366', color:'#fff', borderRadius:'7px', fontSize:'11px', fontWeight:600, textDecoration:'none', display:'flex', alignItems:'center', gap:'3px', flexShrink:0 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              WS
                            </a>
                          )}
                          <button
                            onClick={() => setPagoEditando({ ...p })}
                            style={{ padding:'5px 10px', background:'var(--vl)', color:'var(--v)', border:'1px solid #d4a8e8', borderRadius:'7px', fontSize:'11px', fontWeight:600, cursor:'pointer', flexShrink:0 }}>
                            Editar
                          </button>
                          {puedeEliminar && (
                            <button
                              onClick={async () => {
                                if (!confirm(`¿Eliminar el pago de ${p.alumnos?.nombre} ${p.alumnos?.apellido}?`)) return
                                const sb = createClient()
                                const { error } = await sb.from('pagos_alumnos').delete().eq('id', p.id)
                                if (!error) {
                                  setPagosReporte(prev => prev.filter(x => x.id !== p.id))
                                  // Si ya no quedan pagos de ese alumno en el mes, marcarlo como no pagado
                                  const restantes = pagosReporte.filter(x => x.id !== p.id && x.alumno_id === p.alumno_id)
                                  if (restantes.length === 0) {
                                    setAlumnosPagadosMes(prev => { const n = new Set(prev); n.delete(p.alumno_id); return n })
                                  }
                                  logActivity('Eliminó pago', 'Pagos', `${p.alumnos?.nombre} ${p.alumnos?.apellido} · ${p.mes} ${p.anio}`)
                                  showToast('Pago eliminado')
                                } else {
                                  alert('Error al eliminar el pago')
                                }
                              }}
                              style={{ padding:'5px 10px', background:'var(--redl, #fef2f2)', color:'var(--red, #dc2626)', border:'1px solid #fca5a5', borderRadius:'7px', fontSize:'11px', fontWeight:600, cursor:'pointer', flexShrink:0 }}>
                              Eliminar
                            </button>
                          )}
                        </div>
                      </div>
                    )
                  })}
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* ── MODAL EDITAR PAGO ─────────────────────────────────────────────── */}
      {pagoEditando && (
        <ModalSheet title="Editar pago" onClose={() => setPagoEditando(null)}>
          <div style={{ marginBottom:'10px' }}>
            <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Alumno</div>
            <div style={{ padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', background:'var(--bg)', fontSize:'13px' }}>
              {pagoEditando.alumnos?.nombre} {pagoEditando.alumnos?.apellido}
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
            <div>
              <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Monto</div>
              <input type="number" style={IS} value={pagoEditando.monto || ''} onChange={e => setPagoEditando({ ...pagoEditando, monto: +e.target.value })} />
            </div>
            <div>
              <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Método</div>
              <select style={IS} value={pagoEditando.metodo || 'Efectivo'} onChange={e => setPagoEditando({ ...pagoEditando, metodo: e.target.value })}>
                <option>Efectivo</option><option>Transferencia</option><option>MercadoPago</option>
              </select>
            </div>
          </div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'10px' }}>
            <div>
              <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Mes</div>
              <select style={IS} value={pagoEditando.mes || ''} onChange={e => setPagoEditando({ ...pagoEditando, mes: e.target.value })}>
                {MESES.map(m => <option key={m}>{m}</option>)}
              </select>
            </div>
            <div>
              <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Fecha pago</div>
              <input type="date" style={IS} value={pagoEditando.fecha_pago || ''} onChange={e => setPagoEditando({ ...pagoEditando, fecha_pago: e.target.value })} />
            </div>
          </div>
          <div style={{ marginBottom:'14px' }}>
            <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Observaciones</div>
            <input type="text" style={IS} value={pagoEditando.observaciones || ''} onChange={e => setPagoEditando({ ...pagoEditando, observaciones: e.target.value })} placeholder="Opcional..." />
          </div>
          <div style={{ display:'flex', gap:'10px' }}>
            <button onClick={() => setPagoEditando(null)} style={{ flex:1, padding:'12px', background:'transparent', color:'var(--text2)', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontWeight:600, cursor:'pointer' }}>
              Cancelar
            </button>
            {puedeEliminar && (
              <button
                disabled={eliminandoPago}
                onClick={async () => {
                  if (!confirm(`¿Eliminar el pago de ${pagoEditando.alumnos?.nombre} ${pagoEditando.alumnos?.apellido}?`)) return
                  setEliminandoPago(true)
                  const sb = createClient()
                  const { error } = await sb.from('pagos_alumnos').delete().eq('id', pagoEditando.id)
                  if (!error) {
                    setPagosReporte(prev => prev.filter(x => x.id !== pagoEditando.id))
                    // Si ya no quedan pagos de ese alumno en el mes, marcarlo como no pagado
                    const restantes = pagosReporte.filter(x => x.id !== pagoEditando.id && x.alumno_id === pagoEditando.alumno_id)
                    if (restantes.length === 0) {
                      setAlumnosPagadosMes(prev => { const n = new Set(prev); n.delete(pagoEditando.alumno_id); return n })
                    }
                    logActivity('Eliminó pago', 'Pagos', `${pagoEditando.alumnos?.nombre} ${pagoEditando.alumnos?.apellido} · ${pagoEditando.mes} ${pagoEditando.anio}`)
                    showToast('Pago eliminado')
                    setPagoEditando(null)
                  } else {
                    alert('Error al eliminar el pago')
                  }
                  setEliminandoPago(false)
                }}
                style={{ flex:1, padding:'12px', background: eliminandoPago ? '#aaa' : 'var(--redl, #fef2f2)', color: eliminandoPago ? '#fff' : 'var(--red, #dc2626)', border:'1.5px solid #fca5a5', borderRadius:'10px', fontSize:'14px', fontWeight:600, cursor: eliminandoPago ? 'not-allowed' : 'pointer' }}>
                {eliminandoPago ? 'Eliminando...' : 'Eliminar'}
              </button>
            )}
            <button
              disabled={guardandoEditPago}
              onClick={async () => {
                setGuardandoEditPago(true)
                const sb = createClient()
                const { error } = await sb.from('pagos_alumnos').update({
                  monto: pagoEditando.monto,
                  metodo: pagoEditando.metodo,
                  mes: pagoEditando.mes,
                  fecha_pago: pagoEditando.fecha_pago,
                  observaciones: pagoEditando.observaciones,
                }).eq('id', pagoEditando.id)
                if (!error) {
                  setPagosReporte(prev => prev.map(p => p.id === pagoEditando.id ? { ...p, ...pagoEditando } : p))
                  setPagoEditando(null)
                }
                setGuardandoEditPago(false)
              }}
              style={{ flex:2, padding:'12px', background: guardandoEditPago ? '#aaa' : 'var(--v)', color:'#fff', border:'none', borderRadius:'10px', fontSize:'14px', fontWeight:600, cursor: guardandoEditPago ? 'not-allowed' : 'pointer' }}>
              {guardandoEditPago ? 'Guardando...' : 'Guardar cambios'}
            </button>
          </div>
        </ModalSheet>
      )}

      {/* ── VISTA REGISTRAR ───────────────────────────────────────────────── */}
      {vistaTab === 'registrar' && (
        <>
          {/* Configuración */}
          <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'16px', padding:'16px', marginBottom:'14px' }}>
            <SL style={{ marginBottom:'12px' }}>Configuración del pago</SL>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px', marginBottom:'14px' }}>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Mes</div>
                <select style={IS} value={mes} onChange={e => setMes(e.target.value)}>
                  {MESES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Método</div>
                <select style={IS} value={metodo} onChange={e => setMetodo(e.target.value)}>
                  <option>Efectivo</option>
                  <option>Transferencia</option>
                  <option>MercadoPago</option>
                </select>
              </div>
            </div>

            <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'8px' }}>Conceptos a cobrar</div>

            {/* Cuota mensual */}
            <div
              onClick={() => setCobrarCuota(!cobrarCuota)}
              style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'10px', marginBottom:'8px', cursor:'pointer',
                border: `1.5px solid ${cobrarCuota ? 'var(--v)' : 'var(--border)'}`,
                background: cobrarCuota ? 'var(--vl)' : 'var(--white)' }}>
              <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarCuota ? 'var(--v)' : 'var(--border)'}`, background: cobrarCuota ? 'var(--v)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {cobrarCuota && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:600 }}>Cuota mensual</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>{mes} {anioActual} · monto individual de cada alumno</div>
              </div>
            </div>

            {/* Cuota con recargo */}
            <div style={{ borderRadius:'10px', marginBottom:'8px', border: `1.5px solid ${cobrarRecargo ? 'var(--amber)' : 'var(--border)'}`, background: cobrarRecargo ? 'var(--amberl)' : 'var(--white)' }}>
              <div onClick={() => setCobrarRecargo(!cobrarRecargo)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', cursor:'pointer' }}>
                <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarRecargo ? 'var(--amber)' : 'var(--border)'}`, background: cobrarRecargo ? 'var(--amber)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {cobrarRecargo && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600 }}>Cuota con recargo</div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>Monto fijo igual para todos</div>
                </div>
                {cobrarRecargo && montoRecargo && (
                  <div style={{ fontSize:'14px', fontWeight:700, color:'var(--amber)' }}>${parseFloat(montoRecargo || '0').toLocaleString('es-AR')}</div>
                )}
              </div>
              {cobrarRecargo && (
                <div style={{ padding:'0 12px 10px' }}>
                  <input
                    type="number"
                    style={{ ...IS, borderColor:'var(--amber)' }}
                    placeholder="Monto del recargo para todos..."
                    value={montoRecargo}
                    onChange={e => setMontoRecargo(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Matrícula */}
            <div
              onClick={() => setCobrarMatricula(!cobrarMatricula)}
              style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'10px', cursor:'pointer',
                border: `1.5px solid ${cobrarMatricula ? '#1a6b8a' : 'var(--border)'}`,
                background: cobrarMatricula ? '#e0f0f7' : 'var(--white)' }}>
              <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarMatricula ? '#1a6b8a' : 'var(--border)'}`, background: cobrarMatricula ? '#1a6b8a' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {cobrarMatricula && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:600 }}>Matrícula</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>{anioActual} · monto individual de cada alumno</div>
              </div>
            </div>
          </div>

          {/* Selección alumnos */}
          <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'16px', overflow:'hidden', marginBottom:'14px' }}>
            <div style={{ padding:'12px 16px', borderBottom:'1px solid var(--border)', display:'flex', alignItems:'center', gap:'12px', background:'var(--bg)' }}>
              <input
                type="checkbox"
                checked={seleccionados.size === filtrados.length && filtrados.length > 0}
                onChange={toggleTodos}
                style={{ width:'16px', height:'16px', cursor:'pointer', accentColor:'var(--v)' }}
              />
              <div style={{ flex:1, fontSize:'13px', fontWeight:600 }}>Seleccionar todos ({filtrados.length})</div>
              <div style={{ position:'relative' }}>
                <input
                  type="text"
                  value={busqueda}
                  onChange={e => setBusqueda(e.target.value)}
                  placeholder="Buscar..."
                  style={{ ...IS, width:'150px', padding:'6px 10px 6px 30px', fontSize:'12px' }}
                />
                <svg style={{ position:'absolute', left:'9px', top:'50%', transform:'translateY(-50%)', width:'13px', height:'13px' }} viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
              </div>
            </div>
            <div style={{ maxHeight:'360px', overflowY:'auto' }}>
              {filtrados.map((a: any) => {
                const sel = seleccionados.has(a.id)
                let monto = 0
                if (cobrarCuota) monto += (a.cuota_mensual || 0)
                if (cobrarRecargo) monto += (parseFloat(montoRecargo) || 0)
                if (cobrarMatricula) monto += (a.matricula || 0)
                const yaPago = alumnosPagadosMes.has(a.id)
                return (
                  <div
                    key={a.id}
                    onClick={() => toggleAlumno(a.id)}
                    style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 16px', borderBottom:'1px solid var(--border)', cursor:'pointer',
                      background: sel ? 'var(--vl)' : yaPago ? '#f0fdf4' : 'var(--white)', transition:'background .1s' }}>
                    <input
                      type="checkbox"
                      checked={sel}
                      onChange={() => toggleAlumno(a.id)}
                      onClick={e => e.stopPropagation()}
                      style={{ width:'16px', height:'16px', cursor:'pointer', accentColor:'var(--v)', flexShrink:0 }}
                    />
                    <Av color={a.color} size={32}>{a.nombre[0]}{a.apellido[0]}</Av>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:'13.5px', fontWeight:600 }}>{a.nombre} {a.apellido}</div>
                      <div style={{ fontSize:'11.5px', color:'var(--text2)' }}>{a.nivel}</div>
                    </div>
                    {yaPago
                      ? <span style={{ fontSize:'11px', fontWeight:700, color:'var(--green)', background:'var(--greenl)', padding:'3px 10px', borderRadius:'20px', flexShrink:0 }}>✓ Ya pagó</span>
                      : <div style={{ fontSize:'13px', fontWeight:700, color: sel ? 'var(--v)' : 'var(--text3)', flexShrink:0 }}>${monto.toLocaleString('es-AR')}</div>
                    }
                  </div>
                )
              })}
            </div>
          </div>

          {/* Footer */}
          <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'16px', padding:'16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:'14px' }}>
              <div>
                <div style={{ fontSize:'13px', color:'var(--text2)' }}>{seleccionados.size} alumno{seleccionados.size !== 1 ? 's' : ''} seleccionado{seleccionados.size !== 1 ? 's' : ''}</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'2px' }}>{mes} {anioActual} · {metodo}</div>
              </div>
              <div style={{ textAlign:'right' }}>
                <div style={{ fontSize:'12px', color:'var(--text3)' }}>Total a registrar</div>
                <div style={{ fontSize:'22px', fontWeight:700, color:'var(--v)' }}>${totalMonto.toLocaleString('es-AR')}</div>
              </div>
            </div>
            {guardado && (
              <div style={{ padding:'10px 14px', background:'var(--greenl)', borderRadius:'10px', fontSize:'13px', fontWeight:600, color:'var(--green)', marginBottom:'10px', textAlign:'center' }}>
                ✓ Pagos registrados correctamente
              </div>
            )}
            <button
              onClick={guardar}
              disabled={guardando || seleccionados.size === 0}
              style={{ width:'100%', padding:'14px', background: guardando || seleccionados.size === 0 ? '#aaa' : 'var(--v)', color:'#fff', border:'none', borderRadius:'12px', fontSize:'15px', fontWeight:700, cursor: guardando || seleccionados.size === 0 ? 'not-allowed' : 'pointer' }}>
              {guardando ? 'Registrando pagos...' : `Registrar ${seleccionados.size} pago${seleccionados.size !== 1 ? 's' : ''}`}
            </button>
          </div>
        </>
      )}
    </div>
  )
}
