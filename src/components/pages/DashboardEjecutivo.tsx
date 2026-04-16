'use client'
import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'
import { useAlumnos, useProfesoras, useCursos, apiHeaders } from '@/lib/hooks'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt$(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0 }

export default function DashboardEjecutivo() {
  const hoy       = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const { alumnos }    = useAlumnos()
  const { profesoras } = useProfesoras()
  const { cursos }     = useCursos()

  // ── Datos financieros ─────────────────────────────────────────────────────
  const [pagos,         setPagos]         = useState<any[]>([])
  const [pagosMesAnt,   setPagosMesAnt]   = useState<any[]>([])
  const [liquidaciones, setLiquidaciones] = useState<any[]>([])
  const [altasMes,      setAltasMes]      = useState<any[]>([])
  const [bajasMes,      setBajasMes]      = useState<any[]>([])
  const [loading,       setLoading]       = useState(true)

  // ── Estado de resultado ───────────────────────────────────────────────────
  const [erData,    setErData]    = useState<any[]>([])
  const [erIngresos, setErIngresos] = useState(0)
  const [erEditing,  setErEditing]  = useState<Record<string,number>>({})
  const [erGuardando, setErGuardando] = useState<Record<string,boolean>>({})
  const [erTab, setErTab] = useState<'resumen'|'estado'>('resumen')

  const mesNombre    = MESES[mes]
  const mesAntIdx    = mes === 0 ? 11 : mes - 1
  const anioAnt      = mes === 0 ? anio - 1 : anio
  const mesAntNombre = MESES[mesAntIdx]

  useEffect(() => {
    const cargar = async () => {
      setLoading(true)
      const sb = createClient()
      const inicioMes = `${anio}-${String(mes + 1).padStart(2,'0')}-01`
      const finMes    = new Date(anio, mes + 1, 0).toISOString().split('T')[0]

      const [pagosRes, pagosAntRes, liqRes, altasRes, bajasRes] = await Promise.all([
        // metodo incluido — era el campo que faltaba
        sb.from('pagos_alumnos')
          .select('monto, metodo, observaciones, alumno_id')
          .eq('mes', mesNombre).eq('anio', anio),
        sb.from('pagos_alumnos')
          .select('monto')
          .eq('mes', mesAntNombre).eq('anio', anioAnt),
        // Liquidaciones directas — useLiquidaciones() requiere profesora_id, no aplica aquí
        sb.from('liquidaciones')
          .select('total, estado, profesora_id')
          .eq('mes', mesNombre).eq('anio', anio),
        sb.from('alumnos')
          .select('id, nombre, apellido, nivel, fecha_alta')
          .gte('fecha_alta', inicioMes).lte('fecha_alta', finMes).eq('activo', true),
        sb.from('bajas_alumnos')
          .select('alumno_nombre, alumno_apellido, nivel, fecha_baja, motivo')
          .gte('fecha_baja', inicioMes).lte('fecha_baja', finMes),
      ])

      setPagos(pagosRes.data || [])
      setPagosMesAnt(pagosAntRes.data || [])
      setLiquidaciones(liqRes.data || [])
      setAltasMes(altasRes.data || [])
      setBajasMes(bajasRes.data || [])
      setLoading(false)
    }
    cargar()

    // Cargar estado de resultado (conceptos editables)
    const cargarER = async () => {
      try {
        const res = await fetch(`/api/estado-resultado?mes=${MESES[mes]}&anio=${anio}`, {
          headers: apiHeaders()
        })
        const json = await res.json()
        if (json.data) setErData(json.data)
        // ingresos_cuotas viene del API si está disponible
        if (json.ingresos_cuotas !== undefined && json.ingresos_cuotas > 0) {
          setErIngresos(json.ingresos_cuotas)
        }
      } catch (e) { console.warn('[DashEjecutivo] estado-resultado error:', e) }
    }
    // Pequeño delay para dar tiempo a que apiHeaders() tenga el instituto_id
    setTimeout(cargarER, 800)
  }, [mes, anio])

  // Sincronizar erIngresos con pagos reales cuando estos cargan
  // Esto garantiza que el EERR siempre muestre el total correcto
  // independientemente del timing del API route
  useEffect(() => {
    if (pagos.length > 0) {
      const total = pagos.reduce((s: number, p: any) => s + (p.monto || 0), 0)
      setErIngresos(total)
    }
  }, [pagos])

  // ── Cálculos financieros ──────────────────────────────────────────────────
  const totalCobrado    = pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const totalAntCobrado = pagosMesAnt.reduce((s, p) => s + (p.monto || 0), 0)
  const variacionCobrado = totalAntCobrado > 0
    ? Math.round(((totalCobrado - totalAntCobrado) / totalAntCobrado) * 100)
    : 0

  // Proyección: total esperado = suma de cuotas de todos los alumnos activos
  const proyeccion = alumnos.reduce((s, a) => s + (a.cuota_mensual || 0), 0)
  const pctCobrado = pct(totalCobrado, proyeccion)

  // Alumnos que pagaron vs no pagaron
  const alumnosPagaron = new Set(pagos.map((p: any) => p.alumno_id))
  const cobrados   = alumnosPagaron.size
  const sinPagar   = alumnos.length - cobrados
  const pctCobranza = pct(cobrados, alumnos.length)

  // Liquidaciones del mes
  const liqsMes  = liquidaciones  // ya filtradas por mes/anio en la query
  const totalLiq = liqsMes.reduce((s, l) => s + (l.total || 0), 0)
  const liqPend  = profesoras.length - liqsMes.filter(l => l.estado === 'pagada').length

  // Resultado neto estimado
  const neto = totalCobrado - totalLiq

  // ── Cuotas por método de pago ─────────────────────────────────────────────
  const metodos: Record<string, number> = {}
  pagos.forEach((p: any) => {
    const m = p.observaciones === 'Matrícula de inscripción' ? 'Matrículas' : (p.metodo || 'Efectivo')
    metodos[m] = (metodos[m] || 0) + (p.monto || 0)
  })
  const metodosSorted = Object.entries(metodos).sort((a, b) => b[1] - a[1])

  // ── Exportar PDF ──────────────────────────────────────────────────────────
  const exportarPDF = () => {
    const filasMetodos = metodosSorted.map(([m, v]) =>
      `<tr><td>${m}</td><td style="text-align:right;font-weight:700;color:#652f8d">${fmt$(v)}</td><td style="text-align:right;color:#9b8eaa">${pct(v, totalCobrado)}%</td></tr>`
    ).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Cierre ${mesNombre} ${anio}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#1a1020;max-width:680px;margin:0 auto}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #652f8d;padding-bottom:14px;margin-bottom:20px}
      .logo{font-size:20px;font-weight:800}.logo span{color:#652f8d}
      h2{color:#652f8d;font-size:16px;margin:20px 0 10px;border-bottom:1px solid #ede8f5;padding-bottom:6px}
      .kpis{display:grid;grid-template-columns:repeat(4,1fr);gap:10px;margin-bottom:20px}
      .kpi{background:#f9f5fd;border-radius:10px;padding:12px;text-align:center}
      .kpi-val{font-size:20px;font-weight:800;color:#652f8d}
      .kpi-lab{font-size:10px;color:#9b8eaa;font-weight:600;text-transform:uppercase;margin-top:2px}
      table{width:100%;border-collapse:collapse;margin-bottom:14px}
      th{border-bottom:2px solid #652f8d;padding:7px;text-align:left;font-size:11px;text-transform:uppercase;color:#652f8d;letter-spacing:.04em}
      td{padding:7px 8px;border-bottom:1px solid #f0edf5}
      .neto{background:#e6f4ec;border-radius:10px;padding:14px;text-align:center;margin:14px 0}
      .neto-val{font-size:28px;font-weight:800;color:#2d7a4f}
      .neto-lab{font-size:11px;color:#2d7a4f;font-weight:600;text-transform:uppercase;margin-top:3px}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="hd">
      <div class="logo"><span>Next</span> Ezeiza</div>
      <div style="font-size:13px;color:#9b8eaa">Cierre mensual — ${mesNombre} ${anio}</div>
    </div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-val">${fmt$(totalCobrado)}</div><div class="kpi-lab">Cobrado</div></div>
      <div class="kpi"><div class="kpi-val">${pctCobrado}%</div><div class="kpi-lab">Cobranza</div></div>
      <div class="kpi"><div class="kpi-val">${alumnos.length}</div><div class="kpi-lab">Alumnos</div></div>
      <div class="kpi"><div class="kpi-val">${fmt$(totalLiq)}</div><div class="kpi-lab">Liquidaciones</div></div>
    </div>
    <div class="neto"><div class="neto-val">${fmt$(neto)}</div><div class="neto-lab">Resultado neto estimado</div></div>
    <h2>Métodos de pago</h2>
    <table><tr><th>Método</th><th style="text-align:right">Monto</th><th style="text-align:right">%</th></tr>
    ${filasMetodos}</table>
    <h2>Movimientos del mes</h2>
    <table><tr><th>Altas</th><th>Bajas</th><th>Retención</th></tr>
    <tr><td style="font-weight:700;color:#2d7a4f">+${altasMes.length} alumnos</td><td style="font-weight:700;color:#c0392b">-${bajasMes.length} alumnos</td><td style="font-weight:700;color:#652f8d">${pct(alumnos.length - bajasMes.length, alumnos.length + bajasMes.length)}%</td></tr>
    </table>
    <script>setTimeout(function(){window.print()},400)</script></body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
  }

  // ── Estado de resultado helpers ──────────────────────────────────────────
  const CONCEPTOS_EGRESO = [
    'Alquiler','Regalías','Luz','Emergencias','Seguro Integral',
    'Agua','Municipal','Internet','Sueldos Administrativos',
    'Sueldo Coordinadora','Gastos Limpieza','Redes Sociales',
    'Publicidad','Bonos'
  ]
  const CONCEPTOS_INGRESO_EXTRA = ['Ingresos por Exámenes','Ingresos por Matrículas']

  const getImporte = (concepto: string) => {
    if (concepto in erEditing) return erEditing[concepto]
    const row = erData.find((r: any) => r.concepto === concepto)
    return row?.importe ?? 0
  }

  const guardarConcepto = async (concepto: string, tipo: string, valor: number) => {
    setErGuardando(prev => ({ ...prev, [concepto]: true }))
    try {
      await fetch('/api/estado-resultado', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ mes: MESES[mes], anio, concepto, tipo, importe: valor })
      })
      setErData(prev => {
        const idx = prev.findIndex((r: any) => r.concepto === concepto)
        if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], importe: valor }; return n }
        return [...prev, { concepto, tipo, importe: valor }]
      })
      setErEditing(prev => { const n = { ...prev }; delete n[concepto]; return n })
    } catch (e) { console.warn('[ER] guardar error:', e) }
    setErGuardando(prev => { const n = { ...prev }; delete n[concepto]; return n })
  }

  const totalEgresos = CONCEPTOS_EGRESO.reduce((s, c) => s + (getImporte(c) || 0), 0)
  const totalIngresosExtra = CONCEPTOS_INGRESO_EXTRA.reduce((s, c) => s + (getImporte(c) || 0), 0)
  const totalMes = erIngresos + totalIngresosExtra - totalEgresos

  // ── Render ────────────────────────────────────────────────────────────────
  const IS = { padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'13px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

  return (
    <div className="fade-in">

      {/* Encabezado */}
      <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'20px',flexWrap:'wrap',gap:'10px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Dashboard Ejecutivo</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Cierre mensual consolidado</div>
        </div>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <select style={{...IS,width:'auto'}} value={mes} onChange={e => setMes(+e.target.value)}>
            {MESES.map((m, i) => <option key={m} value={i}>{m}</option>)}
          </select>
          <select style={{...IS,width:'auto'}} value={anio} onChange={e => setAnio(+e.target.value)}>
            {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
          </select>
          <button onClick={exportarPDF} style={{padding:'9px 16px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
            ⬇ PDF
          </button>
        </div>
      </div>

      {/* Tabs */}
      <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
        {(['resumen','estado'] as const).map(t => (
          <button key={t} onClick={() => setErTab(t)} style={{
            padding:'9px 18px', borderRadius:'20px', fontSize:'13px', fontWeight:600,
            cursor:'pointer', border:'1.5px solid',
            borderColor: erTab===t ? 'var(--v)' : 'var(--border)',
            background: erTab===t ? 'var(--v)' : 'var(--white)',
            color: erTab===t ? '#fff' : 'var(--text2)'
          }}>
            {t === 'resumen' ? 'Resumen' : 'Estado de Resultado'}
          </button>
        ))}
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'48px',color:'var(--text3)'}}>Cargando datos del mes...</div>
      ) : erTab === 'estado' ? (
        /* ── ESTADO DE RESULTADO ── */
        <div>
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',overflow:'hidden',marginBottom:'14px'}}>
            {/* Ingresos mensuales (automático) */}
            <div style={{padding:'12px 16px',background:'var(--greenl)',borderBottom:'1px solid #a8d8b4',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:'12px',fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'.05em'}}>Ingresos Mensuales</div>
                <div style={{fontSize:'11px',color:'var(--green)',marginTop:'2px'}}>Tomado automáticamente de pagos registrados</div>
              </div>
              <div style={{fontSize:'22px',fontWeight:800,color:'var(--green)'}}>{fmt$(erIngresos)}</div>
            </div>

            {/* Egresos */}
            <div style={{padding:'10px 16px 4px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Egresos</div>
              {CONCEPTOS_EGRESO.map(concepto => {
                const val = getImporte(concepto)
                const editVal = erEditing[concepto]
                const guardando = erGuardando[concepto]
                return (
                  <div key={concepto} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                    <div style={{flex:1,fontSize:'13px',color:'var(--text)',fontWeight:500}}>{concepto}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <span style={{fontSize:'11px',color:'var(--text3)'}}>$</span>
                      <input
                        type="number" min="0" step="100"
                        value={editVal !== undefined ? editVal : val}
                        onChange={e => setErEditing(prev => ({ ...prev, [concepto]: parseFloat(e.target.value) || 0 }))}
                        onBlur={e => {
                          const v = parseFloat(e.target.value) || 0
                          if (v !== val) guardarConcepto(concepto, 'egreso', v)
                        }}
                        style={{width:'110px',padding:'6px 8px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'13px',fontFamily:'inherit',outline:'none',textAlign:'right'}}
                      />
                      {guardando && <span style={{fontSize:'10px',color:'var(--text3)'}}>...</span>}
                    </div>
                  </div>
                )
              })}
              <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--border)',marginTop:'4px'}}>
                <span style={{fontSize:'12px',fontWeight:700,color:'var(--red)'}}>Total Egresos</span>
                <span style={{fontSize:'14px',fontWeight:800,color:'var(--red)'}}>{fmt$(totalEgresos)}</span>
              </div>
            </div>

            {/* Ingresos extra */}
            <div style={{padding:'10px 16px 4px',borderBottom:'1px solid var(--border)'}}>
              <div style={{fontSize:'10px',fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Ingresos Adicionales</div>
              {CONCEPTOS_INGRESO_EXTRA.map(concepto => {
                const val = getImporte(concepto)
                const editVal = erEditing[concepto]
                const guardando = erGuardando[concepto]
                return (
                  <div key={concepto} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'8px'}}>
                    <div style={{flex:1,fontSize:'13px',color:'var(--text)',fontWeight:500}}>{concepto}</div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      <span style={{fontSize:'11px',color:'var(--text3)'}}>$</span>
                      <input
                        type="number" min="0" step="100"
                        value={editVal !== undefined ? editVal : val}
                        onChange={e => setErEditing(prev => ({ ...prev, [concepto]: parseFloat(e.target.value) || 0 }))}
                        onBlur={e => {
                          const v = parseFloat(e.target.value) || 0
                          if (v !== val) guardarConcepto(concepto, 'ingreso_extra', v)
                        }}
                        style={{width:'110px',padding:'6px 8px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'13px',fontFamily:'inherit',outline:'none',textAlign:'right'}}
                      />
                      {guardando && <span style={{fontSize:'10px',color:'var(--text3)'}}>...</span>}
                    </div>
                  </div>
                )
              })}
              <div style={{display:'flex',justifyContent:'space-between',padding:'8px 0',borderTop:'1px solid var(--border)',marginTop:'4px'}}>
                <span style={{fontSize:'12px',fontWeight:700,color:'var(--green)'}}>Total Ingresos Adicionales</span>
                <span style={{fontSize:'14px',fontWeight:800,color:'var(--green)'}}>{fmt$(totalIngresosExtra)}</span>
              </div>
            </div>

            {/* TOTAL DEL MES */}
            <div style={{padding:'16px',background:totalMes >= 0 ? 'var(--greenl)' : 'var(--redl)',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
              <div>
                <div style={{fontSize:'13px',fontWeight:700,color:totalMes >= 0 ? 'var(--green)' : 'var(--red)',textTransform:'uppercase',letterSpacing:'.05em'}}>Total del Mes</div>
                <div style={{fontSize:'11px',color:totalMes >= 0 ? 'var(--green)' : 'var(--red)',marginTop:'2px'}}>
                  {fmt$(erIngresos)} + {fmt$(totalIngresosExtra)} − {fmt$(totalEgresos)}
                </div>
              </div>
              <div style={{fontSize:'28px',fontWeight:800,color:totalMes >= 0 ? 'var(--green)' : 'var(--red)'}}>{fmt$(totalMes)}</div>
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* KPIs principales */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(2,1fr)',gap:'10px',marginBottom:'14px'}}>
            <KpiCard
              label="Total cobrado"
              val={fmt$(totalCobrado)}
              sub={`${pctCobrado}% de ${fmt$(proyeccion)} proyectado`}
              color="var(--v)"
              trend={variacionCobrado !== 0 ? { val: variacionCobrado, label: `vs ${mesAntNombre}` } : undefined}
            />
            <KpiCard
              label="Cobranza del mes"
              val={`${pctCobrado}%`}
              sub={`${cobrados} pagaron · ${sinPagar} pendientes`}
              color={pctCobrado >= 80 ? 'var(--green)' : pctCobrado >= 60 ? 'var(--amber)' : 'var(--red)'}
            />
            <KpiCard
              label="Liquidaciones docentes"
              val={fmt$(totalLiq)}
              sub={`${liqsMes.length}/${profesoras.length} confirmadas · ${liqPend} pendiente${liqPend !== 1 ? 's' : ''}`}
              color="var(--blue)"
            />
            <KpiCard
              label="Resultado neto est."
              val={fmt$(neto)}
              sub="Cobrado menos liquidaciones"
              color={neto >= 0 ? 'var(--green)' : 'var(--red)'}
            />
          </div>

          {/* Segunda fila: operativa */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'10px',marginBottom:'14px'}}>
            {[
              { label:'Alumnos activos', val: alumnos.length, color:'var(--v)' },
              { label:'Cursos activos',  val: cursos.length,  color:'var(--v)' },
              { label:'Altas del mes',   val: `+${altasMes.length}`, color:'var(--green)' },
              { label:'Bajas del mes',   val: `-${bajasMes.length}`, color: bajasMes.length > 0 ? 'var(--red)' : 'var(--text3)' },
            ].map(k => (
              <div key={k.label} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'22px',fontWeight:800,color:k.color}}>{k.val}</div>
                <div style={{fontSize:'10px',color:'var(--text3)',fontWeight:600,marginTop:'2px'}}>{k.label}</div>
              </div>
            ))}
          </div>

          {/* Métodos de pago + Barra de cobranza */}
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'14px'}}>

            {/* Métodos de pago */}
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
                Métodos de pago
              </div>
              {metodosSorted.length === 0 ? (
                <div style={{textAlign:'center',padding:'16px',color:'var(--text3)',fontSize:'13px'}}>Sin pagos registrados</div>
              ) : (
                metodosSorted.map(([metodo, monto]) => (
                  <div key={metodo} style={{marginBottom:'10px'}}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',marginBottom:'4px'}}>
                      <span style={{color:'var(--text)',fontWeight:500}}>{metodo}</span>
                      <span style={{fontWeight:700,color:'var(--v)'}}>{fmt$(monto)}</span>
                    </div>
                    <div style={{height:'6px',background:'var(--border)',borderRadius:'10px',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct(monto, totalCobrado)}%`,background:'var(--v)',borderRadius:'10px'}} />
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* Cobranza por estado */}
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
                Estado de cobranza
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {[
                  { label:'Pagaron', val: cobrados,           total: alumnos.length, color:'var(--green)', bg:'var(--greenl)' },
                  { label:'Sin pagar', val: sinPagar,         total: alumnos.length, color:'var(--red)',   bg:'var(--redl)'   },
                ].map(r => (
                  <div key={r.label}>
                    <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',marginBottom:'4px'}}>
                      <span style={{color:'var(--text)',fontWeight:500}}>{r.label}</span>
                      <span style={{background:r.bg,color:r.color,padding:'2px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:700}}>
                        {r.val} alumnos
                      </span>
                    </div>
                    <div style={{height:'8px',background:'var(--border)',borderRadius:'10px',overflow:'hidden'}}>
                      <div style={{height:'100%',width:`${pct(r.val, r.total)}%`,background:r.color,borderRadius:'10px',transition:'width .4s'}} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Movimientos del mes */}
          {(altasMes.length > 0 || bajasMes.length > 0) && (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
                Movimientos del mes
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--green)',marginBottom:'6px'}}>
                    ↑ Altas ({altasMes.length})
                  </div>
                  {altasMes.length === 0
                    ? <div style={{fontSize:'12px',color:'var(--text3)'}}>Sin altas este mes</div>
                    : altasMes.slice(0, 4).map((a: any) => (
                        <div key={a.id} style={{fontSize:'13px',color:'var(--text)',padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                          {a.nombre} {a.apellido}
                          <span style={{fontSize:'11px',color:'var(--text3)',marginLeft:'6px'}}>{a.nivel}</span>
                        </div>
                      ))
                  }
                  {altasMes.length > 4 && <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'4px'}}>+{altasMes.length - 4} más</div>}
                </div>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700,color:'var(--red)',marginBottom:'6px'}}>
                    ↓ Bajas ({bajasMes.length})
                  </div>
                  {bajasMes.length === 0
                    ? <div style={{fontSize:'12px',color:'var(--text3)'}}>Sin bajas este mes</div>
                    : bajasMes.slice(0, 4).map((b: any, i: number) => (
                        <div key={i} style={{fontSize:'13px',color:'var(--text)',padding:'4px 0',borderBottom:'1px solid var(--border)'}}>
                          {b.alumno_nombre} {b.alumno_apellido}
                          <span style={{fontSize:'11px',color:'var(--text3)',marginLeft:'6px'}}>{b.motivo || '—'}</span>
                        </div>
                      ))
                  }
                  {bajasMes.length > 4 && <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'4px'}}>+{bajasMes.length - 4} más</div>}
                </div>
              </div>
            </div>
          )}
        </>
      )}
      )}
    </div>
  )
}

// ── Sub-componente KPI con variación ─────────────────────────────────────────
function KpiCard({ label, val, sub, color, trend }: {
  label: string; val: string; sub: string; color: string
  trend?: { val: number; label: string }
}) {
  return (
    <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px 18px'}}>
      <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'6px'}}>
        {label}
      </div>
      <div style={{display:'flex',alignItems:'baseline',gap:'10px',flexWrap:'wrap'}}>
        <div style={{fontSize:'24px',fontWeight:800,color,lineHeight:1}}>{val}</div>
        {trend && (
          <span style={{
            fontSize:'11px',fontWeight:700,padding:'2px 8px',borderRadius:'10px',
            background: trend.val >= 0 ? 'var(--greenl)' : 'var(--redl)',
            color:      trend.val >= 0 ? 'var(--green)'  : 'var(--red)',
          }}>
            {trend.val >= 0 ? '+' : ''}{trend.val}% {trend.label}
          </span>
        )}
      </div>
      <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'5px'}}>{sub}</div>
    </div>
  )
}
