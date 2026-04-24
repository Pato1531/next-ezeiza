'use client'
import { useState, useEffect, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import { useAlumnos, useProfesoras, useCursos, apiHeaders } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

function fmt$(n: number) { return '$' + Math.round(n).toLocaleString('es-AR') }
function pct(a: number, b: number) { return b > 0 ? Math.round((a / b) * 100) : 0 }

export default function DashboardEjecutivo() {
  const hoy       = new Date()
  const [mes,  setMes]  = useState(hoy.getMonth())
  const [anio, setAnio] = useState(hoy.getFullYear())

  const { usuario }    = useAuth()
  const { alumnos }    = useAlumnos()
  const { profesoras } = useProfesoras()
  const { cursos }     = useCursos()

  // ── Datos financieros ─────────────────────────────────────────────────────
  const [pagos,         setPagos]         = useState<any[]>([])
  const [pagosMesAnt,   setPagosMesAnt]   = useState<any[]>([])
  const [liquidaciones, setLiquidaciones] = useState<any[]>([])
  const [altasMes,      setAltasMes]      = useState<any[]>([])
  const [bajasMes,      setBajasMes]      = useState<any[]>([])
  const [loading,          setLoading]          = useState(true)
  const [alumnosMesAnt,    setAlumnosMesAnt]    = useState<Set<string>>(new Set())
  const [rentabilidadData, setRentabilidadData] = useState<any[]>([])
  const [historico,        setHistorico]        = useState<any[]>([])
  const [asistenciaRiesgo, setAsistenciaRiesgo] = useState<any[]>([])

  // ── Estado de resultado ───────────────────────────────────────────────────
  const [erData,    setErData]    = useState<any[]>([])
  const [erIngresos, setErIngresos] = useState(0)
  const [erEditing,  setErEditing]  = useState<Record<string,number>>({})
  const [erGuardando, setErGuardando] = useState<Record<string,boolean>>({})
  const [erTab, setErTab] = useState<'resumen'|'estado'|'cierre'|'proyecciones'>('resumen')
  const erDebounceRef = useRef<Record<string,ReturnType<typeof setTimeout>>>({})

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
          .select('monto, metodo, observaciones, alumno_id, fecha_pago')
          .eq('mes', mesNombre).eq('anio', anio),
        sb.from('pagos_alumnos')
          .select('monto, alumno_id')
          .eq('mes', mesAntNombre).eq('anio', anioAnt),
        // Liquidaciones directas — useLiquidaciones() requiere profesora_id, no aplica aquí
        sb.from('liquidaciones')
          .select('total, estado, profesora_id')
          .eq('mes', mesNombre).eq('anio', anio),
        usuario?.instituto_id
          ? sb.from('alumnos').select('id, nombre, apellido, nivel, fecha_alta')
              .gte('fecha_alta', inicioMes).lte('fecha_alta', finMes).eq('activo', true)
              .eq('instituto_id', usuario.instituto_id)
          : sb.from('alumnos').select('id, nombre, apellido, nivel, fecha_alta')
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

      // Retención: IDs del mes anterior
      const idsAnt = new Set<string>((pagosAntRes.data || []).map((p: any) => p.alumno_id))
      setAlumnosMesAnt(idsAnt)

      // Rentabilidad: query directa con join a profesoras y cuotas
      const { data: rentData } = await sb
        .from('cursos')
        .select('id, nombre, nivel, profesora_id, profesoras(nombre, tarifa_hora, horas_semana), cursos_alumnos(alumnos(cuota_mensual))')
        .eq('activo', true)
      setRentabilidadData(rentData || [])

      // Histórico 12 meses: pagos agrupados por mes/anio
      const { data: histData } = await sb
        .from('pagos_alumnos')
        .select('mes, anio, monto')
        .gte('anio', anio - 1)
        .order('anio', { ascending: true })
      setHistorico(histData || [])

      // Alumnos en riesgo: asistencia reciente con ausencias
      const { data: riesgoData } = await sb
        .from('asistencia_clases')
        .select('alumno_id, presente, clase_id, clases(fecha, curso_id, cursos(nombre)), alumnos(nombre, apellido, nivel, cuota_mensual)')
        .eq('presente', 'A')
        .order('clase_id', { ascending: false })
        .limit(500)
      setAsistenciaRiesgo(riesgoData || [])

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
        if (json.data && json.data.length > 0) {
          setErData(json.data)
          // Limpiar edits locales — los datos del servidor son la verdad
          setErEditing({})
        }
        if (json.ingresos_cuotas !== undefined && json.ingresos_cuotas > 0) {
          setErIngresos(json.ingresos_cuotas)
        }
      } catch (e) { console.warn('[DashEjecutivo] estado-resultado error:', e) }
    }
    // Delay para que apiHeaders() tenga el instituto_id seteado
    // Intentar a los 800ms y de nuevo a los 2500ms como fallback
    setTimeout(cargarER, 800)
    setTimeout(cargarER, 2500)
  }, [mes, anio, usuario?.instituto_id])

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

  // ── Tasa de retención ────────────────────────────────────────────────────
  const alumnosQueRetuvimos = alumnosMesAnt.size > 0
    ? [...alumnosMesAnt].filter(id => alumnosPagaron.has(id)).length
    : 0
  const tasaRetencion = alumnosMesAnt.size > 0
    ? Math.round((alumnosQueRetuvimos / alumnosMesAnt.size) * 100)
    : null
  const alumnosPerdidos = alumnosMesAnt.size - alumnosQueRetuvimos

  // ── Rentabilidad por curso ────────────────────────────────────────────────
  const rentabilidadCursos = rentabilidadData.map((c: any) => {
    const prof = c.profesoras
    const inscriptos: any[] = c.cursos_alumnos || []
    const cantAlumnos = inscriptos.length
    const ingresosCurso = inscriptos.reduce((s: number, r: any) => s + (r.alumnos?.cuota_mensual || 0), 0)
    const costoPorMes = prof ? (prof.tarifa_hora || 0) * (prof.horas_semana || 0) * 4 : 0
    const margen = ingresosCurso - costoPorMes
    const pctMargen = ingresosCurso > 0 ? Math.round((margen / ingresosCurso) * 100) : 0
    return { id: c.id, nombre: c.nombre, nivel: c.nivel,
      profesora: prof ? prof.nombre : '—', cantAlumnos,
      ingresos: ingresosCurso, costo: costoPorMes, margen, pctMargen }
  }).filter((c: any) => c.cantAlumnos > 0).sort((a: any, b: any) => b.margen - a.margen)

  // ── Días con más pagos ────────────────────────────────────────────────────
  const diasConteo: Record<number, number> = {}
  pagos.forEach((p: any) => {
    if (!p.fecha_pago) return
    const dia = new Date(p.fecha_pago + 'T12:00:00').getDate()
    diasConteo[dia] = (diasConteo[dia] || 0) + 1
  })
  const diasSorted = Object.entries(diasConteo)
    .map(([dia, cant]) => ({ dia: parseInt(dia), cant }))
    .sort((a, b) => b.cant - a.cant)
  const maxDiaCant = diasSorted[0]?.cant || 1
  const diasTop5 = diasSorted.slice(0, 5)

  // ── Proyecciones ─────────────────────────────────────────────────────────

  // A) Evolución histórica 12 meses
  const historicoMeses = (() => {
    const mapa: Record<string, number> = {}
    historico.forEach((p: any) => {
      const key = `${p.mes}-${p.anio}`
      mapa[key] = (mapa[key] || 0) + (p.monto || 0)
    })
    // Últimos 12 meses ordenados
    const lista = []
    for (let i = 11; i >= 0; i--) {
      const d = new Date(anio, mes - i, 1)
      const m = MESES[d.getMonth()]
      const a = d.getFullYear()
      const key = `${m}-${a}`
      lista.push({ mes: m, anio: a, total: mapa[key] || 0, label: `${m.slice(0,3)} ${a}` })
    }
    return lista
  })()
  const maxHistorico = Math.max(...historicoMeses.map(h => h.total), 1)
  const totalCostoDocente = rentabilidadCursos.reduce((s: number, c: any) => s + (c.costo || 0), 0)

  // B) Proyección mes en curso
  const hoyDia = new Date().getDate()
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const esMesActual = mes === new Date().getMonth() && anio === new Date().getFullYear()
  const proyeccionMes = (() => {
    if (!esMesActual || hoyDia === 0) return null
    // Ritmo actual: cobrado / días transcurridos
    const ritmoDiario = hoyDia > 0 ? totalCobrado / hoyDia : 0
    const proyectado = Math.round(ritmoDiario * diasEnMes)
    const objetivo = proyeccion // suma de cuotas activos
    const pctAvance = pct(totalCobrado, objetivo)
    const pctDias = pct(hoyDia, diasEnMes)
    // Optimista: si el ritmo se mantiene + 10%
    const optimista = Math.round(proyectado * 1.1)
    // Pesimista: si el ritmo baja 20%
    const pesimista = Math.round(proyectado * 0.8)
    return { proyectado, objetivo, optimista, pesimista, pctAvance, pctDias, ritmoDiario }
  })()

  // C) Proyección liquidaciones próximo mes
  const proxMesIdx = mes === 11 ? 0 : mes + 1
  const proxAnio = mes === 11 ? anio + 1 : anio
  const proxMesNombre = MESES[proxMesIdx]
  const liqProxMes = rentabilidadCursos.reduce((s: number, c: any) => s + (c.costo || 0), 0)

  // D) Alumnos en riesgo de deserción
  const alumnosEnRiesgo = (() => {
    // Agrupar ausencias por alumno
    const ausenciasPorAlumno: Record<string, { nombre: string; apellido: string; nivel: string; cuota: number; ausencias: number; curso: string }> = {}
    asistenciaRiesgo.forEach((r: any) => {
      const id = r.alumno_id
      if (!id) return
      if (!ausenciasPorAlumno[id]) {
        ausenciasPorAlumno[id] = {
          nombre: r.alumnos?.nombre || '',
          apellido: r.alumnos?.apellido || '',
          nivel: r.alumnos?.nivel || '',
          cuota: r.alumnos?.cuota_mensual || 0,
          ausencias: 0,
          curso: r.clases?.cursos?.nombre || '—',
        }
      }
      ausenciasPorAlumno[id].ausencias++
    })
    return Object.entries(ausenciasPorAlumno)
      .map(([id, d]) => ({ id, ...d, noPago: !alumnosPagaron.has(id) }))
      .filter(a => a.ausencias >= 2 || (a.ausencias >= 1 && a.noPago))
      .sort((a, b) => {
        // Score: ausencias + no pagó = más riesgo arriba
        const sa = a.ausencias * 2 + (a.noPago ? 3 : 0)
        const sb = b.ausencias * 2 + (b.noPago ? 3 : 0)
        return sb - sa
      })
      .slice(0, 10)
  })()

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
      const res = await fetch('/api/estado-resultado', {
        method: 'POST', headers: apiHeaders(),
        body: JSON.stringify({ mes: MESES[mes], anio, concepto, tipo, importe: valor })
      })
      const json = await res.json()
      if (json.error) {
        console.error('[ER] guardar error:', json.error)
      } else {
        setErData(prev => {
          const idx = prev.findIndex((r: any) => r.concepto === concepto)
          if (idx >= 0) { const n = [...prev]; n[idx] = { ...n[idx], importe: valor }; return n }
          return [...prev, { concepto, tipo, importe: valor }]
        })
        setErEditing(prev => { const n = { ...prev }; delete n[concepto]; return n })
      }
    } catch (e) { console.warn('[ER] guardar catch:', e) }
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
        {(['resumen','estado','proyecciones'] as const).map(t => (
          <button key={t} onClick={() => setErTab(t as any)} style={{
            padding:'9px 18px', borderRadius:'20px', fontSize:'13px', fontWeight:600,
            cursor:'pointer', border:'1.5px solid',
            borderColor: erTab===t ? 'var(--v)' : 'var(--border)',
            background: erTab===t ? 'var(--v)' : 'var(--white)',
            color: erTab===t ? '#fff' : 'var(--text2)'
          }}>
            {t === 'resumen' ? 'Resumen' : t === 'estado' ? 'Est. Resultado' : '📈 Proyecciones'}
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
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          setErEditing(prev => ({ ...prev, [concepto]: v }))
                          // Guardar automáticamente 800ms después de dejar de tipear
                          if (erDebounceRef.current[concepto]) clearTimeout(erDebounceRef.current[concepto])
                          erDebounceRef.current[concepto] = setTimeout(() => guardarConcepto(concepto, 'egreso', v), 800)
                        }}
                        onBlur={e => {
                          const v = parseFloat(e.target.value) || 0
                          if (erDebounceRef.current[concepto]) clearTimeout(erDebounceRef.current[concepto])
                          guardarConcepto(concepto, 'egreso', v)
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
                        onChange={e => {
                          const v = parseFloat(e.target.value) || 0
                          setErEditing(prev => ({ ...prev, [concepto]: v }))
                          if (erDebounceRef.current[concepto]) clearTimeout(erDebounceRef.current[concepto])
                          erDebounceRef.current[concepto] = setTimeout(() => guardarConcepto(concepto, 'ingreso_extra', v), 800)
                        }}
                        onBlur={e => {
                          const v = parseFloat(e.target.value) || 0
                          if (erDebounceRef.current[concepto]) clearTimeout(erDebounceRef.current[concepto])
                          guardarConcepto(concepto, 'ingreso_extra', v)
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
      ) : erTab === 'proyecciones' ? (
        /* ── PROYECCIONES ── */
        <div>

          {/* A) Evolución histórica 12 meses */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'4px'}}>
              Evolución de ingresos — últimos 12 meses
            </div>
            <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'14px'}}>
              Línea punteada = costo docente estimado mensual
            </div>
            <div style={{display:'flex',alignItems:'flex-end',gap:'4px',height:'120px',marginBottom:'8px'}}>
              {historicoMeses.map((h, i) => {
                const altura = maxHistorico > 0 ? Math.round((h.total / maxHistorico) * 100) : 0
                const esMesSelec = h.mes === mesNombre && h.anio === anio
                const costoPct = maxHistorico > 0 ? Math.round((totalCostoDocente / maxHistorico) * 100) : 0
                return (
                  <div key={i} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',gap:'3px',height:'100%',justifyContent:'flex-end'}}>
                    <div style={{fontSize:'9px',color:esMesSelec?'var(--v)':'var(--text3)',fontWeight:esMesSelec?800:400,textAlign:'center',whiteSpace:'nowrap'}}>
                      {h.total > 0 ? `$${Math.round(h.total/1000)}k` : ''}
                    </div>
                    <div style={{
                      width:'100%', borderRadius:'4px 4px 0 0',
                      height:`${Math.max(altura,2)}%`,
                      background: esMesSelec ? 'var(--v)' : h.total >= totalCostoDocente && totalCostoDocente > 0 ? 'var(--green)' : h.total > 0 ? '#c4a8e0' : 'var(--border)',
                      transition:'height .3s',
                      position:'relative',
                    }} title={`${h.label}: ${fmt$(h.total)}`} />
                  </div>
                )
              })}
            </div>
            {/* Eje X */}
            <div style={{display:'flex',gap:'4px'}}>
              {historicoMeses.map((h, i) => (
                <div key={i} style={{flex:1,fontSize:'8px',color: h.mes===mesNombre&&h.anio===anio?'var(--v)':'var(--text3)',textAlign:'center',fontWeight:h.mes===mesNombre&&h.anio===anio?700:400}}>
                  {h.mes.slice(0,3)}
                </div>
              ))}
            </div>
            {totalCostoDocente > 0 && (
              <div style={{marginTop:'10px',fontSize:'11px',color:'var(--text3)',display:'flex',gap:'14px'}}>
                <span>■ <span style={{color:'var(--green)'}}>Sobre punto de equilibrio</span></span>
                <span>■ <span style={{color:'#c4a8e0'}}>Por debajo</span></span>
                <span>■ <span style={{color:'var(--v)'}}>Mes seleccionado</span></span>
              </div>
            )}
          </div>

          {/* B) Proyección mes en curso */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
              Proyección del mes en curso — {mesNombre} {anio}
            </div>
            {!esMesActual ? (
              <div style={{textAlign:'center',padding:'16px',color:'var(--text3)',fontSize:'13px'}}>
                Seleccioná el mes actual para ver la proyección en tiempo real
              </div>
            ) : proyeccionMes ? (
              <>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                  <div style={{background:'var(--vl)',borderRadius:'12px',padding:'14px',textAlign:'center'}}>
                    <div style={{fontSize:'11px',color:'var(--v)',fontWeight:700,marginBottom:'4px'}}>Cobrado hoy (día {hoyDia})</div>
                    <div style={{fontSize:'22px',fontWeight:800,color:'var(--v)'}}>{fmt$(totalCobrado)}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'3px'}}>{proyeccionMes.pctAvance}% del objetivo</div>
                  </div>
                  <div style={{background:'#f0f7ff',border:'1.5px solid #bdd7f5',borderRadius:'12px',padding:'14px',textAlign:'center'}}>
                    <div style={{fontSize:'11px',color:'#1a6b8a',fontWeight:700,marginBottom:'4px'}}>Proyectado al día {diasEnMes}</div>
                    <div style={{fontSize:'22px',fontWeight:800,color:'#1a6b8a'}}>{fmt$(proyeccionMes.proyectado)}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'3px'}}>al ritmo actual</div>
                  </div>
                </div>
                {/* Barra de progreso del mes */}
                <div style={{marginBottom:'10px'}}>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>
                    <span>Avance del mes: día {hoyDia} de {diasEnMes}</span>
                    <span>{proyeccionMes.pctDias}% del tiempo</span>
                  </div>
                  <div style={{height:'8px',background:'var(--border)',borderRadius:'10px',overflow:'hidden',marginBottom:'6px'}}>
                    <div style={{height:'100%',width:`${proyeccionMes.pctDias}%`,background:'var(--text3)',borderRadius:'10px',opacity:.4}} />
                  </div>
                  <div style={{display:'flex',justifyContent:'space-between',fontSize:'11px',color:'var(--text3)',marginBottom:'4px'}}>
                    <span>Cobranza: {fmt$(totalCobrado)} de {fmt$(proyeccionMes.objetivo)}</span>
                    <span>{proyeccionMes.pctAvance}%</span>
                  </div>
                  <div style={{height:'8px',background:'var(--border)',borderRadius:'10px',overflow:'hidden'}}>
                    <div style={{height:'100%',width:`${Math.min(proyeccionMes.pctAvance,100)}%`,
                      background: proyeccionMes.pctAvance >= proyeccionMes.pctDias ? 'var(--green)' : 'var(--amber)',
                      borderRadius:'10px',transition:'width .4s'}} />
                  </div>
                </div>
                {/* Escenarios */}
                <div style={{fontSize:'10.5px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px',marginTop:'6px'}}>Escenarios</div>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {[
                    {label:'Optimista (+10%)',  val:proyeccionMes.optimista,  color:'var(--green)',  bg:'var(--greenl)'},
                    {label:'Base (ritmo actual)',val:proyeccionMes.proyectado, color:'#1a6b8a',       bg:'#e0f0f7'},
                    {label:'Pesimista (-20%)',   val:proyeccionMes.pesimista,  color:'var(--amber)',  bg:'var(--amberl)'},
                    {label:'Objetivo (cuotas)',  val:proyeccionMes.objetivo,   color:'var(--text2)', bg:'var(--bg)'},
                  ].map(e => (
                    <div key={e.label} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:e.bg,borderRadius:'8px'}}>
                      <div style={{fontSize:'12px',color:e.color,fontWeight:600}}>{e.label}</div>
                      <div style={{fontSize:'14px',fontWeight:800,color:e.color}}>{fmt$(e.val)}</div>
                    </div>
                  ))}
                </div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'10px'}}>
                  {proyeccionMes.pctAvance >= proyeccionMes.pctDias
                    ? '✓ La cobranza va adelantada respecto al tiempo transcurrido del mes'
                    : '⚠ La cobranza está retrasada — quedan ' + (diasEnMes - hoyDia) + ' días para cerrar el mes'}
                </div>
              </>
            ) : null}
          </div>

          {/* C) Proyección liquidaciones próximo mes */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
            <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
              Proyección de liquidaciones — {proxMesNombre} {proxAnio}
            </div>
            {rentabilidadCursos.length === 0 ? (
              <div style={{textAlign:'center',padding:'16px',color:'var(--text3)',fontSize:'13px'}}>
                Sin datos de cursos con docente y tarifa asignada
              </div>
            ) : (
              <>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                  <div style={{background:'var(--redl)',borderRadius:'12px',padding:'14px',textAlign:'center'}}>
                    <div style={{fontSize:'11px',color:'var(--red)',fontWeight:700,marginBottom:'4px'}}>Total a liquidar</div>
                    <div style={{fontSize:'24px',fontWeight:800,color:'var(--red)'}}>{fmt$(liqProxMes)}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'3px'}}>{rentabilidadCursos.length} docente{rentabilidadCursos.length!==1?'s':''}</div>
                  </div>
                  <div style={{background:'var(--greenl)',borderRadius:'12px',padding:'14px',textAlign:'center'}}>
                    <div style={{fontSize:'11px',color:'var(--green)',fontWeight:700,marginBottom:'4px'}}>Margen proyectado</div>
                    <div style={{fontSize:'24px',fontWeight:800,color:'var(--green)'}}>{fmt$(proyeccionMes?.objetivo ? proyeccionMes.objetivo - liqProxMes : proyeccion - liqProxMes)}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'3px'}}>ingresos − liquidaciones</div>
                  </div>
                </div>
                <div style={{fontSize:'10.5px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px'}}>Detalle por docente</div>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {rentabilidadCursos.map((c: any) => (
                    <div key={c.id} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 12px',background:'var(--bg)',borderRadius:'8px'}}>
                      <div>
                        <div style={{fontSize:'13px',fontWeight:600}}>{c.profesora}</div>
                        <div style={{fontSize:'11px',color:'var(--text3)'}}>{c.nombre}</div>
                      </div>
                      <div style={{fontSize:'14px',fontWeight:700,color:'var(--red)'}}>{fmt$(c.costo)}</div>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>

          {/* D) Alumnos en riesgo de deserción */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
              <div>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em'}}>
                  Alumnos en riesgo de deserción
                </div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>2+ ausencias recientes o ausencia + cuota impaga</div>
              </div>
              {alumnosEnRiesgo.length > 0 && (
                <span style={{background:'var(--redl)',color:'var(--red)',padding:'3px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:700}}>
                  {alumnosEnRiesgo.length} alumnos
                </span>
              )}
            </div>
            {alumnosEnRiesgo.length === 0 ? (
              <div style={{textAlign:'center',padding:'24px',color:'var(--green)',fontSize:'13px',fontWeight:600}}>
                ✓ Sin alumnos en riesgo detectado este mes
              </div>
            ) : (
              <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                {alumnosEnRiesgo.map((a: any) => {
                  const score = a.ausencias * 2 + (a.noPago ? 3 : 0)
                  const riesgoLabel = score >= 7 ? 'Alto' : score >= 4 ? 'Medio' : 'Bajo'
                  const riesgoColor = score >= 7 ? 'var(--red)' : score >= 4 ? 'var(--amber)' : '#1a6b8a'
                  const riesgoBg = score >= 7 ? 'var(--redl)' : score >= 4 ? 'var(--amberl)' : '#e0f0f7'
                  return (
                    <div key={a.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',background:'var(--bg)',borderRadius:'10px'}}>
                      <div style={{width:34,height:34,borderRadius:'10px',background:'var(--v)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                        {a.nombre[0]}{a.apellido[0]}
                      </div>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13px',fontWeight:700}}>{a.nombre} {a.apellido}</div>
                        <div style={{fontSize:'11px',color:'var(--text3)'}}>{a.curso} · {a.nivel}</div>
                        <div style={{display:'flex',gap:'6px',marginTop:'3px',flexWrap:'wrap'}}>
                          <span style={{fontSize:'10px',fontWeight:600,background:'var(--redl)',color:'var(--red)',padding:'1px 7px',borderRadius:'10px'}}>
                            {a.ausencias} ausencia{a.ausencias!==1?'s':''}
                          </span>
                          {a.noPago && (
                            <span style={{fontSize:'10px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)',padding:'1px 7px',borderRadius:'10px'}}>
                              Sin pago {mesNombre}
                            </span>
                          )}
                        </div>
                      </div>
                      <div style={{flexShrink:0,textAlign:'center'}}>
                        <span style={{fontSize:'11px',fontWeight:700,background:riesgoBg,color:riesgoColor,padding:'3px 10px',borderRadius:'20px'}}>
                          {riesgoLabel}
                        </span>
                        <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>{fmt$(a.cuota)}/mes</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>

        </div>
      ) : erTab === 'cierre' ? (
        <CierreDeMes
          mes={mesNombre}
          anio={anio}
          totalCobrado={totalCobrado}
          proyeccion={pagosEstimados => pagosEstimados}
          alumnos={alumnos}
          cursos={cursos}
          profesoras={profesoras}
          pagos={pagos}
          liquidaciones={liquidaciones}
          altasMes={altasMes}
          bajasMes={bajasMes}
          pagosMesAnt={pagosMesAnt}
        />
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

          {/* ── Días con más pagos ── */}
          {erTab === 'resumen' && (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
                Días con más pagos — {mesNombre}
              </div>
              {diasSorted.length === 0 ? (
                <div style={{textAlign:'center',padding:'16px',color:'var(--text3)',fontSize:'13px'}}>Sin datos de fecha de pago</div>
              ) : (
                <>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'4px',marginBottom:'14px'}}>
                    {Array.from({length:31},(_,i)=>i+1).map(dia => {
                      const cant = diasConteo[dia] || 0
                      const intensidad = cant === 0 ? 0 : Math.max(0.12, cant / maxDiaCant)
                      const esPico = diasTop5.some(d => d.dia === dia)
                      return (
                        <div key={dia} title={`Día ${dia}: ${cant} pago${cant!==1?'s':''}`}
                          style={{width:26,height:26,borderRadius:6,
                            background: cant===0?'var(--border)':`rgba(101,47,141,${intensidad})`,
                            display:'flex',alignItems:'center',justifyContent:'center',
                            fontSize:'10px',fontWeight:esPico?800:500,
                            color:cant===0?'var(--text3)':intensidad>0.5?'#fff':'var(--v)',
                            border:esPico?'1.5px solid var(--v)':'1.5px solid transparent',cursor:'default'}}>
                          {dia}
                        </div>
                      )
                    })}
                  </div>
                  <div style={{fontSize:'10.5px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px'}}>Picos de cobranza</div>
                  <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                    {diasTop5.map(({dia,cant}) => (
                      <div key={dia} style={{display:'flex',alignItems:'center',gap:'8px'}}>
                        <div style={{width:28,fontSize:'12px',fontWeight:700,color:'var(--v)',textAlign:'right',flexShrink:0}}>{dia}</div>
                        <div style={{flex:1,height:'8px',background:'var(--border)',borderRadius:'10px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${(cant/maxDiaCant)*100}%`,background:'var(--v)',borderRadius:'10px',transition:'width .4s'}} />
                        </div>
                        <div style={{fontSize:'12px',fontWeight:600,color:'var(--text2)',flexShrink:0,minWidth:60}}>{cant} pago{cant!==1?'s':''}</div>
                      </div>
                    ))}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Tasa de retención ── */}
          {erTab === 'resumen' && (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>
                Retención mensual — {mesNombre}
              </div>
              {tasaRetencion === null ? (
                <div style={{textAlign:'center',padding:'12px',color:'var(--text3)',fontSize:'13px'}}>Sin datos del mes anterior para comparar</div>
              ) : (
                <>
                  <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                    {[
                      {label:'Retuvimos',            val:alumnosQueRetuvimos, color:'var(--green)', bg:'var(--greenl)'},
                      {label:'No pagaron este mes',  val:alumnosPerdidos,     color:'var(--red)',   bg:'var(--redl)'},
                      {label:'Tasa de retención',    val:`${tasaRetencion}%`, color:tasaRetencion>=80?'var(--green)':tasaRetencion>=60?'var(--amber)':'var(--red)', bg:tasaRetencion>=80?'var(--greenl)':tasaRetencion>=60?'var(--amberl)':'var(--redl)'},
                    ].map(k => (
                      <div key={k.label} style={{background:k.bg,borderRadius:'12px',padding:'14px',textAlign:'center'}}>
                        <div style={{fontSize:'22px',fontWeight:800,color:k.color}}>{k.val}</div>
                        <div style={{fontSize:'10px',fontWeight:600,color:k.color,marginTop:'3px',opacity:.8}}>{k.label}</div>
                      </div>
                    ))}
                  </div>
                  <div style={{height:'10px',background:'var(--border)',borderRadius:'10px',overflow:'hidden',marginBottom:'6px'}}>
                    <div style={{height:'100%',width:`${tasaRetencion}%`,background:tasaRetencion>=80?'var(--green)':tasaRetencion>=60?'var(--amber)':'var(--red)',borderRadius:'10px',transition:'width .5s'}} />
                  </div>
                  <div style={{fontSize:'11px',color:'var(--text3)'}}>
                    {tasaRetencion>=80?'✓ Retención saludable — más del 80% de los alumnos del mes anterior pagaron este mes':tasaRetencion>=60?'⚠ Retención moderada — revisar alumnos que no pagaron':'✗ Retención baja — más del 40% de alumnos no repitió el pago este mes'}
                  </div>
                </>
              )}
            </div>
          )}

          {/* ── Rentabilidad por curso ── */}
          {erTab === 'resumen' && rentabilidadCursos.length > 0 && (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px'}}>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em'}}>Costo docente vs. ingresos por curso</div>
                <div style={{fontSize:'10px',color:'var(--text3)'}}>tarifa × hs/sem × 4 sem</div>
              </div>
              <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
                {rentabilidadCursos.map((c: any) => {
                  const esPositivo = c.margen >= 0
                  const color = esPositivo?'var(--green)':'var(--red)'
                  const bg = esPositivo?'var(--greenl)':'var(--redl)'
                  const maxIngreso = Math.max(...rentabilidadCursos.map((x:any)=>x.ingresos),1)
                  return (
                    <div key={c.id} style={{borderBottom:'1px solid var(--border)',paddingBottom:'10px'}}>
                      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'5px'}}>
                        <div>
                          <div style={{fontSize:'13.5px',fontWeight:700}}>{c.nombre}</div>
                          <div style={{fontSize:'11px',color:'var(--text3)'}}>{c.profesora} · {c.cantAlumnos} alumnos</div>
                        </div>
                        <div style={{textAlign:'right',flexShrink:0,marginLeft:'12px'}}>
                          <span style={{fontSize:'12px',fontWeight:700,background:bg,color,padding:'2px 10px',borderRadius:'20px'}}>
                            {esPositivo?'+':''}{fmt$(c.margen)}
                          </span>
                          <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>{c.pctMargen}% margen</div>
                        </div>
                      </div>
                      <div style={{display:'flex',gap:'4px',alignItems:'center',marginBottom:'4px'}}>
                        <div style={{flex:1,height:'6px',background:'var(--greenl)',borderRadius:'10px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct(c.ingresos,maxIngreso)}%`,background:'var(--green)',borderRadius:'10px'}} />
                        </div>
                        <div style={{fontSize:'11px',color:'var(--green)',fontWeight:600,minWidth:70,textAlign:'right'}}>{fmt$(c.ingresos)}</div>
                      </div>
                      <div style={{display:'flex',gap:'4px',alignItems:'center'}}>
                        <div style={{flex:1,height:'6px',background:'var(--redl)',borderRadius:'10px',overflow:'hidden'}}>
                          <div style={{height:'100%',width:`${pct(c.costo,maxIngreso)}%`,background:'var(--red)',borderRadius:'10px'}} />
                        </div>
                        <div style={{fontSize:'11px',color:'var(--red)',fontWeight:600,minWidth:70,textAlign:'right'}}>{fmt$(c.costo)}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
              <div style={{display:'flex',gap:'14px',marginTop:'10px',fontSize:'11px',color:'var(--text3)'}}>
                <span>▬ <span style={{color:'var(--green)'}}>Ingresos cuotas</span></span>
                <span>▬ <span style={{color:'var(--red)'}}>Costo docente est.</span></span>
              </div>
            </div>
          )}

        </>
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

function CierreDeMes({ mes, anio, totalCobrado, alumnos, cursos, profesoras, pagos, liquidaciones, altasMes, bajasMes, pagosMesAnt }: any) {
  const fmt$ = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')
  const totalAnt = (pagosMesAnt || []).reduce((s: number, p: any) => s + (p.monto || 0), 0)
  const variacion = totalAnt > 0 ? Math.round(((totalCobrado - totalAnt) / totalAnt) * 100) : 0
  const totalLiq = (liquidaciones || []).reduce((s: number, l: any) => s + (l.total || 0), 0)
  const margen = totalCobrado - totalLiq

  const descargarPDF = () => {
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Cierre ${mes} ${anio}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;font-size:13px;color:#1a1020;max-width:700px;margin:0 auto}
      h1{font-size:22px;color:#652f8d;margin-bottom:4px}
      .sub{color:#9b8eaa;font-size:13px;margin-bottom:24px}
      .grid{display:grid;grid-template-columns:1fr 1fr;gap:16px;margin-bottom:24px}
      .card{border:1px solid #e0d8f0;border-radius:10px;padding:14px}
      .val{font-size:22px;font-weight:700;color:#652f8d}
      .lbl{font-size:11px;color:#9b8eaa;margin-top:4px}
      table{width:100%;border-collapse:collapse;margin-top:8px}
      th{text-align:left;font-size:11px;color:#9b8eaa;text-transform:uppercase;padding:6px 0;border-bottom:1px solid #e0d8f0}
      td{padding:8px 0;border-bottom:1px solid #f4f0fa;font-size:12px}
      .positive{color:#2d7a4f} .negative{color:#c0392b}
      @media print{body{padding:16px}}
    </style></head><body>
    <h1>Cierre de mes — ${mes} ${anio}</h1>
    <div class="sub">Generado el ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
    <div class="grid">
      <div class="card"><div class="val">${fmt$(totalCobrado)}</div><div class="lbl">Total cobrado</div></div>
      <div class="card"><div class="val ${variacion >= 0 ? 'positive' : 'negative'}">${variacion >= 0 ? '+' : ''}${variacion}%</div><div class="lbl">vs mes anterior</div></div>
      <div class="card"><div class="val">${fmt$(totalLiq)}</div><div class="lbl">Total liquidaciones</div></div>
      <div class="card"><div class="val ${margen >= 0 ? 'positive' : 'negative'}">${fmt$(margen)}</div><div class="lbl">Margen estimado</div></div>
    </div>
    <h2 style="font-size:14px;margin-bottom:8px">Altas del mes</h2>
    ${altasMes?.length > 0 ? `<table><thead><tr><th>Nombre</th><th>Nivel</th><th>Fecha</th></tr></thead><tbody>
      ${altasMes.map((a: any) => `<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>${a.fecha_alta ? new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR') : '—'}</td></tr>`).join('')}
    </tbody></table>` : '<p style="color:#9b8eaa">Sin altas este mes</p>'}
    <h2 style="font-size:14px;margin:16px 0 8px">Bajas del mes</h2>
    ${bajasMes?.length > 0 ? `<table><thead><tr><th>Nombre</th><th>Nivel</th><th>Motivo</th></tr></thead><tbody>
      ${bajasMes.map((b: any) => `<tr><td>${b.alumno_nombre} ${b.alumno_apellido}</td><td>${b.nivel}</td><td>${b.motivo}</td></tr>`).join('')}
    </tbody></table>` : '<p style="color:#9b8eaa">Sin bajas este mes</p>'}
    <script>setTimeout(()=>window.print(),400)</script>
    </body></html>`
    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <div style={{fontSize:'15px',fontWeight:700}}>Cierre — {mes} {anio}</div>
        <button onClick={descargarPDF} style={{padding:'8px 14px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'10px',fontSize:'12px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6M10 14v-4M7 11l3 3 3-3"/></svg>
          Exportar PDF
        </button>
      </div>

      {/* KPIs de cierre */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        <div style={{background:'var(--vl)',border:'1.5px solid #d4a8e8',borderRadius:'16px',padding:'16px'}}>
          <div style={{fontSize:'24px',fontWeight:700,color:'var(--v)'}}>{fmt$(totalCobrado)}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'3px'}}>Total cobrado</div>
          {variacion !== 0 && <div style={{fontSize:'11px',marginTop:'4px',fontWeight:600,color:variacion>=0?'var(--green)':'var(--red)'}}>{variacion>=0?'↑':'↓'} {Math.abs(variacion)}% vs mes anterior</div>}
        </div>
        <div style={{background:margen>=0?'var(--greenl)':'var(--redl)',border:`1.5px solid ${margen>=0?'#a3e0bc':'#f5c5c5'}`,borderRadius:'16px',padding:'16px'}}>
          <div style={{fontSize:'24px',fontWeight:700,color:margen>=0?'var(--green)':'var(--red)'}}>{fmt$(margen)}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'3px'}}>Margen estimado</div>
          <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'4px'}}>Cobrado − liquidaciones</div>
        </div>
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
          <div style={{fontSize:'24px',fontWeight:700}}>{fmt$(totalLiq)}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'3px'}}>Liquidaciones docentes</div>
        </div>
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
          <div style={{display:'flex',gap:'12px'}}>
            <div>
              <div style={{fontSize:'20px',fontWeight:700,color:'var(--green)'}}>+{altasMes?.length||0}</div>
              <div style={{fontSize:'11px',color:'var(--text3)'}}>Altas</div>
            </div>
            <div>
              <div style={{fontSize:'20px',fontWeight:700,color:'var(--red)'}}>−{bajasMes?.length||0}</div>
              <div style={{fontSize:'11px',color:'var(--text3)'}}>Bajas</div>
            </div>
          </div>
          <div style={{fontSize:'11px',color:'var(--text2)',marginTop:'4px'}}>Movimiento del mes</div>
        </div>
      </div>

      {/* Altas */}
      {altasMes?.length > 0 && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'12px',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:'12px',fontWeight:700,color:'var(--green)',display:'flex',alignItems:'center',gap:'6px'}}>
            <span>↑</span> {altasMes.length} alta{altasMes.length!==1?'s':''} en {mes}
          </div>
          {altasMes.map((a: any) => (
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{flex:1,fontSize:'13px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
              <span style={{fontSize:'11.5px',color:'var(--text2)'}}>{a.nivel}</span>
              <span style={{fontSize:'11px',color:'var(--text3)'}}>{a.fecha_alta ? new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR') : '—'}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bajas */}
      {bajasMes?.length > 0 && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'12px',overflow:'hidden'}}>
          <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',fontSize:'12px',fontWeight:700,color:'var(--red)',display:'flex',alignItems:'center',gap:'6px'}}>
            <span>↓</span> {bajasMes.length} baja{bajasMes.length!==1?'s':''} en {mes}
          </div>
          {bajasMes.map((b: any, i: number) => (
            <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 16px',borderBottom:'1px solid var(--border)'}}>
              <div style={{flex:1,fontSize:'13px',fontWeight:600}}>{b.alumno_nombre} {b.alumno_apellido}</div>
              <span style={{fontSize:'11px',color:'var(--text2)'}}>{b.motivo}</span>
            </div>
          ))}
        </div>
      )}

      {altasMes?.length === 0 && bajasMes?.length === 0 && (
        <div style={{padding:'20px',textAlign:'center',color:'var(--text3)',fontSize:'13px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px'}}>
          Sin movimientos de alumnos este mes
        </div>
      )}
    </div>
  )
}

