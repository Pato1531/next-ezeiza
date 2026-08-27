'use client'
import { useState, useEffect } from 'react'
import * as XLSX from 'xlsx'
import { useAlumnos, apiHeaders, logActivity } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'
import { showToast } from '@/components/Toast'
import { FILTRO_SUPABASE_CUOTA_COMPLETA, estadoPagoMes, type PagoAlumno } from '@/lib/pagos'

// ── Constantes ────────────────────────────────────────────────────────────────
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmtFecha(f: string) {
  if (!f) return '—'
  const [y, m, d] = f.split('-')
  return `${d}/${m}/${y}`
}

function fmtMonto(n: number) {
  return n.toLocaleString('es-AR', { minimumFractionDigits: 0 })
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

// Arma el texto "Cuota y matrícula registrada" a partir de los tipos de pago
// que un alumno tiene cargados ese mes. Usado en la vista Registrar pagos
// para reemplazar el genérico "✓ Ya pagó" por lo que efectivamente se cobró.
function labelConceptosPagados(tiposRaw: (string | null | undefined)[], esClaseParticular: boolean): string {
  const LABEL_POR_TIPO: Record<string, string> = {
    cuota: 'Cuota',
    cuota_descuento: 'Cuota c/descuento',
    recargo: 'Recargo',
    cuota_recargo: 'Recargo',
    matricula: 'Matrícula',
    examen: 'Examen',
    proporcional: 'Proporcional',
  }
  const ORDEN = ['Cuota', 'Cuota c/descuento', 'Clases particulares', 'Recargo', 'Matrícula', 'Examen', 'Proporcional']

  const set = new Set<string>()
  tiposRaw.forEach(t => {
    const tipo = t || 'cuota'
    if (esClaseParticular && tipo === 'cuota') { set.add('Clases particulares'); return }
    set.add(LABEL_POR_TIPO[tipo] || tipo)
  })

  const labels = ORDEN.filter(l => set.has(l))
  set.forEach(l => { if (!labels.includes(l)) labels.push(l) })

  if (labels.length === 0) return 'Ya pagó'
  if (labels.length === 1) return `${labels[0]} registrada`
  return `${labels.slice(0, -1).join(', ')} y ${labels[labels.length - 1]} registrada`
}

// Chip de concepto para mostrar en el detalle de cada pago registrado
const ChipConcepto = ({ tipo }: { tipo: string }) => {
  const map: Record<string, { label: string; color: string; bg: string }> = {
    cuota:       { label: 'Cuota',        color: '#652f8d', bg: '#f4eefb' },
    cuota_recargo: { label: 'Recargo',    color: '#b45309', bg: '#fef3cd' },
    recargo:     { label: 'Recargo',      color: '#b45309', bg: '#fef3cd' },
    matricula:   { label: 'Matrícula',    color: '#1a6b8a', bg: '#e0f0f7' },
    examen:      { label: 'Examen',       color: '#7c3aed', bg: '#ede9fe' },
    proporcional:{ label: 'Proporcional', color: '#2d7a4f', bg: '#e6f4ec' },
    cuota_descuento: { label: 'Cuota c/desc.', color: '#0f766e', bg: '#e6f7f5' },
  }
  const c = map[tipo] || { label: tipo, color: 'var(--text3)', bg: 'var(--bg)' }
  return (
    <span style={{ padding:'2px 8px', borderRadius:'20px', fontSize:'10.5px', fontWeight:700, color: c.color, background: c.bg, border:`1px solid ${c.color}22` }}>
      {c.label}
    </span>
  )
}

// ── Componente principal ──────────────────────────────────────────────────────
export default function Pagos() {
  const { alumnos } = useAlumnos()
  const { usuario } = useAuth()
  const puedeEliminar = usuario?.rol === 'director' || usuario?.rol === 'secretaria'
  const mesActual = MESES[new Date().getMonth()]
  const anioActual = new Date().getFullYear()

  const [vistaTab, setVistaTab] = useState<'registrar' | 'reporte' | 'deudores'>('registrar')

  // ── Mapa alumno_id → nombre del curso (para reemplazar chip de nivel) ────
  const [cursosPorAlumno, setCursosPorAlumno] = useState<Record<string, string>>({})
  const [notasPorAlumno, setNotasPorAlumno] = useState<Record<string, string>>({})
  const [editandoNota, setEditandoNota] = useState<string | null>(null) // alumno_id
  const [notaInput, setNotaInput] = useState('')
  const [guardandoNota, setGuardandoNota] = useState(false)

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
  const [alumnosPagadosLabelMes, setAlumnosPagadosLabelMes] = useState<Record<string, string>>({})
  const [busqueda, setBusqueda] = useState('')
  const [guardando, setGuardando] = useState(false)
  // Conceptos
  const [cobrarCuota, setCobrarCuota] = useState(true)
  const [cobrarDescuento, setCobrarDescuento] = useState(false)
  const [montoDescuento, setMontoDescuento] = useState<Record<string, number>>({})
  const [cobrarRecargo, setCobrarRecargo] = useState(false)
  const [montoRecargo, setMontoRecargo] = useState('')
  const [cobrarMatricula, setCobrarMatricula] = useState(false)
  const [cobrarProporcional, setCobrarProporcional] = useState(false)
  const [montoProporcional, setMontoProporcional] = useState('')
  const [cobrarExamen, setCobrarExamen] = useState(false)
  const [montoExamen, setMontoExamen] = useState('')
  const [cobrarClaseParticular, setCobrarClaseParticular] = useState(false)
  const [montoClaseParticular, setMontoClaseParticular] = useState<Record<string, number>>({})
  const [cargandoClaseParticular, setCargandoClaseParticular] = useState(false)

  // ── Estado: Feedback post-registro ───────────────────────────────────────
  // Guarda el resumen del último registro para mostrarlo en pantalla
  const [resultadoRegistro, setResultadoRegistro] = useState<{
    ok: number
    errores: number
    totalMonto: number
    conceptos: string[]
    mes: string
    metodo: string
  } | null>(null)

  // ── Estado: Deudores ──────────────────────────────────────────────────────
  const [deudMes, setDeudMes] = useState(mesActual)
  const [deudAnio, setDeudAnio] = useState(anioActual)
  const [deudoresList, setDeudoresList] = useState<any[]>([])
  const [loadingDeudores, setLoadingDeudores] = useState(false)

  // ── Estado: Deudas pendientes (deuda puntual, ej. la que trae un alumno ──
  // al reactivarse — distinto de "Deudores", que es la cuota del mes) ──────
  const [deudasPendientes, setDeudasPendientes] = useState<any[]>([])
  const [loadingDeudasPendientes, setLoadingDeudasPendientes] = useState(false)
  const [marcandoPagadaId, setMarcandoPagadaId] = useState<string | null>(null)
  const puedeGestionarDeudas = usuario?.rol === 'director' || usuario?.rol === 'secretaria'

  const cargarDeudasPendientes = async () => {
    setLoadingDeudasPendientes(true)
    try {
      const sb = createClient()
      const { data, error } = await sb
        .from('deudas_pendientes')
        .select('id, monto, motivo, estado, fecha_generada, alumno_id, alumnos(nombre, apellido)')
        .eq('estado', 'pendiente')
        .order('fecha_generada', { ascending: false })
      if (error) { console.error('[cargarDeudasPendientes]', error.message); setDeudasPendientes([]); return }
      setDeudasPendientes(data || [])
    } catch (e: any) {
      console.error('[cargarDeudasPendientes] catch', e?.message)
      setDeudasPendientes([])
    }
    setLoadingDeudasPendientes(false)
  }

  useEffect(() => {
    if (vistaTab === 'deudores') cargarDeudasPendientes()
  }, [vistaTab]) // eslint-disable-line react-hooks/exhaustive-deps

  // Marca la deuda como pagada y, además, la registra como un pago real en
  // pagos_alumnos (usa el endpoint existente) para que sume en Ingresos.
  const marcarDeudaPagada = async (deuda: any) => {
    setMarcandoPagadaId(deuda.id)
    try {
      const res = await window.fetch('/api/registrar-pago', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          alumno_id: deuda.alumno_id,
          mes: mesActual,
          anio: anioActual,
          monto: deuda.monto,
          metodo: 'Efectivo',
          tipo: 'proporcional',
          observaciones: `Deuda por reactivación — ${deuda.motivo}`,
        }),
      })
      const json = await res.json()
      if (json.error) { showToast('No se pudo registrar el pago: ' + json.error, 'error'); setMarcandoPagadaId(null); return }

      const sb = createClient()
      const { error: updErr } = await sb
        .from('deudas_pendientes')
        .update({ estado: 'pagada', fecha_pago: new Date().toISOString().split('T')[0], pago_id: json.data?.id || null })
        .eq('id', deuda.id)
      if (updErr) { console.error('[marcarDeudaPagada]', updErr.message); showToast('El pago se registró pero no se pudo actualizar la deuda: ' + updErr.message, 'error'); setMarcandoPagadaId(null); return }

      logActivity('Cobró deuda pendiente', 'Pagos', `${deuda.alumnos?.nombre || ''} ${deuda.alumnos?.apellido || ''} — $${deuda.monto}`)
      showToast('✓ Deuda marcada como pagada')
      setDeudasPendientes(prev => prev.filter(d => d.id !== deuda.id))
    } catch (e: any) {
      console.error('[marcarDeudaPagada] catch', e?.message)
      showToast('Error al marcar la deuda como pagada', 'error')
    }
    setMarcandoPagadaId(null)
  }

  // ── Cargar reporte ────────────────────────────────────────────────────────
  const cargarReporte = async () => {
    setLoadingReporte(true)
    try {
      const sb = createClient()
      const { data } = await sb
        .from('pagos_alumnos')
        .select('*, alumnos(nombre,apellido,nivel,dni,padre_dni,cuota_mensual,color,telefono,padre_nombre,padre_telefono,es_menor)')
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

  // ── Cargar cursos y notas de cobro por alumno ────────────────────────────
  useEffect(() => {
    if (!usuario?.instituto_id) return
    const sb = createClient()
    // Cursos: alumno_id → nombre del primer curso activo
    sb.from('cursos_alumnos').select('alumno_id, cursos(nombre)').eq('cursos.instituto_id', usuario.instituto_id)
      .then(({ data }) => {
        const mapa: Record<string, string> = {}
        ;(data || []).forEach((r: any) => {
          if (r.alumno_id && r.cursos?.nombre && !mapa[r.alumno_id]) {
            mapa[r.alumno_id] = r.cursos.nombre
          }
        })
        setCursosPorAlumno(mapa)
      })
    // Notas de cobro: alumno_id → nota
    sb.from('alumnos').select('id, nota_cobro').eq('instituto_id', usuario.instituto_id).not('nota_cobro', 'is', null)
      .then(({ data }) => {
        const mapa: Record<string, string> = {}
        ;(data || []).forEach((r: any) => { if (r.nota_cobro) mapa[r.id] = r.nota_cobro })
        setNotasPorAlumno(mapa)
      })
  }, [usuario?.instituto_id])

  const abrirNota = (alumnoId: string) => {
    setEditandoNota(alumnoId)
    setNotaInput(notasPorAlumno[alumnoId] || '')
  }

  const guardarNota = async (alumnoId: string) => {
    setGuardandoNota(true)
    const sb = createClient()
    const { error } = await sb.from('alumnos').update({ nota_cobro: notaInput.trim() || null }).eq('id', alumnoId)
    if (!error) {
      setNotasPorAlumno(prev => {
        const n = { ...prev }
        if (notaInput.trim()) n[alumnoId] = notaInput.trim()
        else delete n[alumnoId]
        return n
      })
      showToast(notaInput.trim() ? 'Nota guardada' : 'Nota eliminada')
    } else {
      showToast('Error al guardar la nota', 'error')
    }
    setEditandoNota(null)
    setGuardandoNota(false)
  }

  // ── Cargar deudores del mes ───────────────────────────────────────────────
  // Trae directamente de Supabase los alumnos activos con fecha_alta <= mes consultado
  // que NO tienen pago registrado ese mes. Evita depender de los campos del hook useAlumnos.
  const cargarDeudores = async () => {
    setLoadingDeudores(true)
    try {
      const sb = createClient()
      const mesNum = MESES.indexOf(deudMes) + 1
      const periodoConsultado = deudAnio * 100 + mesNum
      // Último día del mes consultado para filtrar fecha_alta
      const ultimoDia = new Date(deudAnio, mesNum, 0).toISOString().split('T')[0]

      // 1. Alumnos activos con fecha_alta <= último día del mes consultado
      const { data: todosAlumnos } = await sb
        .from('alumnos')
        .select('id, nombre, apellido, nivel, cuota_mensual, color, telefono, padre_nombre, padre_telefono, es_menor, fecha_alta')
        .eq('activo', true)
        .lte('fecha_alta', ultimoDia)

      // 2. TODOS los pagos del mes (para calcular estado con calcularPagoMes,
      // incluye proporcionales para detectar "pago parcial" vs "sin pagar")
      const { data: pagosDelMes } = await sb
        .from('pagos_alumnos')
        .select('alumno_id, tipo, monto')
        .eq('mes', deudMes)
        .eq('anio', deudAnio)

      const pagosPorAlumno: Record<string, PagoAlumno[]> = {}
      ;(pagosDelMes || []).forEach((p: any) => {
        if (!pagosPorAlumno[p.alumno_id]) pagosPorAlumno[p.alumno_id] = []
        pagosPorAlumno[p.alumno_id].push({ tipo: p.tipo, monto: p.monto })
      })

      // 3. Filtrar: activos ese mes y sin la cuota saldada (deudor o parcial)
      const resultado = (todosAlumnos || [])
        .filter((a: any) => estadoPagoMes(pagosPorAlumno[a.id] || [], { esClaseParticular: !!a.tarifa_clase }) !== 'pagado')
        .map((a: any) => {
          const estado = estadoPagoMes(pagosPorAlumno[a.id] || [], { esClaseParticular: !!a.tarifa_clase })
          const montoParcial = (pagosPorAlumno[a.id] || [])
            .filter(p => p.tipo === 'proporcional')
            .reduce((s, p) => s + (p.monto || 0), 0)
          return { ...a, _estadoPago: estado, _montoParcial: montoParcial }
        })
      setDeudoresList(resultado)
    } catch (e) { console.error(e) }
    setLoadingDeudores(false)
  }

  useEffect(() => {
    if (vistaTab === 'deudores') cargarDeudores()
  }, [vistaTab, deudMes, deudAnio])

  // ── Cargar quiénes ya pagaron el mes ─────────────────────────────────────
  useEffect(() => {
    const cargar = async () => {
      try {
        const params = new URLSearchParams({ mes, anio: String(anioActual) })
        const res = await fetch(`/api/registrar-pago?${params}`, { headers: apiHeaders() })
        const json = await res.json()
        if (json.data) {
          // Agrupar por alumno y aplicar la misma lógica de "cuota saldada"
          // que Deudores, para que "✓ Ya pagó" sea consistente en toda la app
          const pagosPorAlumno: Record<string, PagoAlumno[]> = {}
          json.data.forEach((r: any) => {
            if (!pagosPorAlumno[r.alumno_id]) pagosPorAlumno[r.alumno_id] = []
            pagosPorAlumno[r.alumno_id].push({ tipo: r.tipo, monto: r.monto })
          })
          const pagados = Object.keys(pagosPorAlumno).filter(id => {
            const a = alumnos.find((x: any) => x.id === id)
            return estadoPagoMes(pagosPorAlumno[id], { esClaseParticular: !!a?.tarifa_clase }) === 'pagado'
          })
          setAlumnosPagadosMes(new Set(pagados))

          const labels: Record<string, string> = {}
          pagados.forEach(id => {
            const a = alumnos.find((x: any) => x.id === id)
            labels[id] = labelConceptosPagados(pagosPorAlumno[id].map(p => p.tipo), !!a?.tarifa_clase)
          })
          setAlumnosPagadosLabelMes(labels)
        } else {
          setAlumnosPagadosMes(new Set())
          setAlumnosPagadosLabelMes({})
        }
      } catch {
        setAlumnosPagadosMes(new Set())
        setAlumnosPagadosLabelMes({})
      }
    }
    cargar()
    // Limpiar resultado anterior al cambiar mes
    setResultadoRegistro(null)
    setSeleccionados(new Set())
  }, [mes, alumnos.length])

  // ── Filtros ───────────────────────────────────────────────────────────────
  const pagosReporteFiltrados = pagosReporte.filter(p => {
    const fechaNorm = p.fecha_pago ? p.fecha_pago.slice(0, 10) : ''
    const matchDia = !filtroRepDia || fechaNorm === filtroRepDia
    const matchMetodo = !filtroRepMetodo || p.metodo === filtroRepMetodo
    return matchDia && matchMetodo
  })

  const pagosAgrupados = (() => {
    const grupos: Record<string, any> = {}
    for (const p of pagosReporteFiltrados) {
      const key = `${p.alumno_id}-${p.mes}-${p.anio}`
      if (!grupos[key]) {
        grupos[key] = { ...p, _montoTotal: 0, _tipos: [], _pagos: [] }
      }
      grupos[key]._montoTotal += (p.monto || 0)
      grupos[key]._tipos.push(p.tipo || 'cuota')
      grupos[key]._pagos.push(p)
      if (p.tipo === 'cuota') {
        grupos[key].id = p.id
        grupos[key].monto = p.monto
        grupos[key].metodo = p.metodo
        grupos[key].fecha_pago = p.fecha_pago
      }
    }
    return Object.values(grupos).sort((a: any, b: any) =>
      (b.fecha_pago || '').localeCompare(a.fecha_pago || '')
    )
  })()

  const totalRecaudado = pagosReporteFiltrados.reduce((s, p) => s + (p.monto || 0), 0)

  // Helper: índice numérico de un nombre de mes (1-based)


  // ── Exportar Deudores XLS ─────────────────────────────────────────────────
  const descargarDeudoresXLS = () => {
    const rows = deudores.sort((a:any,b:any)=>a.apellido.localeCompare(b.apellido)).map((a:any) => ({
      'Apellido': a.apellido,
      'Nombre': a.nombre,
      'Nivel': a.nivel,
      'Cuota mensual': a.cuota_mensual || 0,
      'Estado': a._estadoPago === 'parcial' ? `Parcial ($${(a._montoParcial||0).toLocaleString('es-AR')})` : 'Sin pago',
      'Saldo pendiente': Math.max(0, (a.cuota_mensual||0) - (a._montoParcial||0)),
      'Teléfono': a.telefono || a.padre_telefono || '',
    }))
    const ws = XLSX.utils.json_to_sheet(rows)
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Deudores')
    XLSX.writeFile(wb, `deudores_${deudMes}_${deudAnio}.xlsx`)
  }

  // ── Exportar Deudores PDF ─────────────────────────────────────────────────
  const descargarDeudoresPDF = () => {
    const totalMonto = deudores.reduce((s:number,a:any) => s + Math.max(0,(a.cuota_mensual||0)-(a._montoParcial||0)), 0)
    const rows = deudores.sort((a:any,b:any)=>a.apellido.localeCompare(b.apellido))
      .map((a:any) => `<tr><td>${a.apellido}, ${a.nombre}</td><td>${a.nivel||'—'}</td><td>${a._estadoPago === 'parcial' ? `Parcial ($${(a._montoParcial||0).toLocaleString('es-AR')})` : 'Sin pago'}</td><td>$${Math.max(0,(a.cuota_mensual||0)-(a._montoParcial||0)).toLocaleString('es-AR')}</td></tr>`).join('')
    const html = `<h1 style="font-family:sans-serif;color:#652f8d">Deudores — ${deudMes} ${deudAnio}</h1>
      <p style="font-family:sans-serif;font-size:13px;color:#666">${deudores.length} deudores · Total: $${totalMonto.toLocaleString('es-AR')}</p>
      <table style="font-family:sans-serif;border-collapse:collapse;width:100%;font-size:13px">
        <tr><th style="border-bottom:2px solid #652f8d;text-align:left;padding:6px">Alumno</th><th style="border-bottom:2px solid #652f8d;padding:6px">Nivel</th><th style="border-bottom:2px solid #652f8d;padding:6px">Estado</th><th style="border-bottom:2px solid #652f8d;text-align:right;padding:6px">Saldo</th></tr>
        ${rows}
        <tr style="border-top:2px solid #652f8d;font-weight:700"><td style="padding:6px">TOTAL</td><td></td><td></td><td style="text-align:right;padding:6px">$${totalMonto.toLocaleString('es-AR')}</td></tr>
      </table>`
    const w = window.open('','_blank')
    if (!w) return
    w.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Deudores</title></head><body style="padding:24px">${html}<script>setTimeout(()=>window.print(),400)<\/script></body></html>`)
    w.document.close()
  }

  // deudores viene directo de Supabase con fecha_alta ya filtrada en cargarDeudores
  const deudores = deudoresList

  const filtrados = busqueda
    ? alumnos.filter((a: any) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(busqueda.toLowerCase()))
    : alumnos

  // ── Clase particular: calcular monto sugerido por alumno según asistencia del mes ──
  // Se dispara al activar el concepto o al cambiar de mes. Se apoya en `clases` +
  // `asistencia_clases`, la misma fuente que usa Alumnos → Registrar pago individual.
  useEffect(() => {
    if (!cobrarClaseParticular) return
    const idsPorClase = alumnos.filter((a: any) => a.tarifa_clase).map((a: any) => a.id)
    if (idsPorClase.length === 0) { setMontoClaseParticular({}); return }
    setCargandoClaseParticular(true)
    const sb = createClient()
    const mesIdx = MESES.indexOf(mes)
    const desde = `${anioActual}-${String(mesIdx + 1).padStart(2, '0')}-01`
    const hasta = `${anioActual}-${String(mesIdx + 1).padStart(2, '0')}-31`
    ;(async () => {
      const { data: cursosAlumno } = await sb.from('cursos_alumnos').select('alumno_id, curso_id').in('alumno_id', idsPorClase)
      const cursoIds = [...new Set((cursosAlumno || []).map((r: any) => r.curso_id))]
      if (cursoIds.length === 0) { setMontoClaseParticular({}); setCargandoClaseParticular(false); return }
      const { data: clases } = await sb.from('clases').select('id, curso_id').in('curso_id', cursoIds).gte('fecha', desde).lte('fecha', hasta)
      const claseIds = (clases || []).map((c: any) => c.id)
      if (claseIds.length === 0) { setMontoClaseParticular({}); setCargandoClaseParticular(false); return }
      const { data: asist } = await sb.from('asistencia_clases').select('alumno_id, clase_id, estado').in('alumno_id', idsPorClase).in('clase_id', claseIds)
      const conteoPorAlumno: Record<string, number> = {}
      for (const r of (asist || [])) {
        if (r.estado !== 'P' && r.estado !== 'T') continue
        conteoPorAlumno[r.alumno_id] = (conteoPorAlumno[r.alumno_id] || 0) + 1
      }
      const montos: Record<string, number> = {}
      for (const a of alumnos) {
        if (!a.tarifa_clase) continue
        montos[a.id] = (conteoPorAlumno[a.id] || 0) * a.tarifa_clase
      }
      setMontoClaseParticular(montos)
      setCargandoClaseParticular(false)
    })()
  }, [cobrarClaseParticular, mes, anioActual, alumnos]) // eslint-disable-line react-hooks/exhaustive-deps

  const totalMonto = [...seleccionados].reduce((sum, id) => {
    const a = alumnos.find((x: any) => x.id === id)
    if (!a) return sum
    let t = 0
    if (cobrarCuota) t += (a.cuota_mensual || 0)
    if (cobrarDescuento) t += (montoDescuento[id] ?? a.cuota_mensual ?? 0)
    if (cobrarRecargo) t += (parseFloat(montoRecargo) || 0)
    if (cobrarMatricula) t += (a.matricula || 0)
    if (cobrarProporcional) t += (parseFloat(montoProporcional) || 0)
    if (cobrarExamen) t += (parseFloat(montoExamen) || 0)
    if (cobrarClaseParticular) t += (montoClaseParticular[id] || 0)
    return sum + t
  }, 0)

  // Cantidad de alumnos seleccionados que ya tienen un pago de cuota este mes
  // (para advertir antes de registrar)
  const seleccionadosQueYaPagaron = [...seleccionados].filter(id => alumnosPagadosMes.has(id))

  // Conceptos activos (para mostrar en resumen)
  const conceptosActivos = [
    cobrarCuota && 'Cuota mensual',
    cobrarDescuento && 'Cuota con descuento',
    cobrarRecargo && `Recargo ($${fmtMonto(parseFloat(montoRecargo)||0)})`,
    cobrarMatricula && 'Matrícula',
    cobrarProporcional && `Proporcional ($${fmtMonto(parseFloat(montoProporcional)||0)})`,
    cobrarExamen && `Examen ($${fmtMonto(parseFloat(montoExamen)||0)})`,
    cobrarClaseParticular && 'Clase particular',
  ].filter(Boolean) as string[]

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
  const ejecutarGuardado = async () => {
    setGuardando(true)
    setResultadoRegistro(null)
    const fecha = new Date().toISOString().split('T')[0]
    const alumnosSeleccionados = alumnos.filter((a: any) => seleccionados.has(a.id))

    const inserts: any[] = []
    for (const a of alumnosSeleccionados) {
      if (cobrarCuota) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: a.cuota_mensual || 0,
        tipo: 'cuota', observaciones: `Cuota ${mes} ${anioActual}`,
      })
      if (cobrarDescuento) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: montoDescuento[a.id] ?? a.cuota_mensual ?? 0,
        tipo: 'cuota_descuento', observaciones: `Cuota con descuento ${mes} ${anioActual}`,
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
      if (cobrarProporcional) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: parseFloat(montoProporcional) || 0,
        tipo: 'proporcional', observaciones: `Monto proporcional ${mes} ${anioActual}`,
      })
      if (cobrarExamen) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: parseFloat(montoExamen) || 0,
        tipo: 'examen', observaciones: `Examen ${mes} ${anioActual}`,
      })
      if (cobrarClaseParticular && (montoClaseParticular[a.id] || 0) > 0) inserts.push({
        alumno_id: a.id, mes, anio: anioActual, metodo, fecha_pago: fecha,
        monto: montoClaseParticular[a.id],
        tipo: 'cuota', observaciones: `Clases particulares ${mes} ${anioActual}`,
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
      const alumnosOk = [...new Set(resultados.filter(r => !r.error).map((_, i) => inserts[i].alumno_id))]

      // ── Resumen de feedback ───────────────────────────────────────────────
      const montoTotal = [...seleccionados].reduce((sum, id) => {
        const a = alumnos.find((x: any) => x.id === id)
        if (!a) return sum
        let t = 0
        if (cobrarCuota) t += (a.cuota_mensual || 0)
        if (cobrarDescuento) t += (montoDescuento[id] ?? a.cuota_mensual ?? 0)
        if (cobrarRecargo) t += (parseFloat(montoRecargo) || 0)
        if (cobrarMatricula) t += (a.matricula || 0)
        if (cobrarProporcional) t += (parseFloat(montoProporcional) || 0)
        if (cobrarExamen) t += (parseFloat(montoExamen) || 0)
        if (cobrarClaseParticular) t += (montoClaseParticular[id] || 0)
        return sum + t
      }, 0)

      setResultadoRegistro({
        ok: alumnosSeleccionados.length - errores.length,
        errores: errores.length,
        totalMonto: montoTotal,
        conceptos: conceptosActivos,
        mes,
        metodo,
      })

      if (errores.length > 0) {
        showToast(`⚠ ${errores.length} pago(s) no se pudieron guardar`, 'error')
      } else {
        showToast(`✓ ${alumnosSeleccionados.length} alumno${alumnosSeleccionados.length !== 1 ? 's' : ''} · $${fmtMonto(montoTotal)} registrado${alumnosSeleccionados.length !== 1 ? 's' : ''}`)
      }

      logActivity('Registró pagos', 'Pagos', `${alumnosSeleccionados.length} alumnos · ${mes} ${anioActual}`)
      alumnosOk.forEach(id => window.dispatchEvent(new CustomEvent('pago-registrado', { detail: { alumno_id: id } })))
      setAlumnosPagadosMes(prev => new Set([...prev, ...alumnosOk]))
    } catch (e) {
      console.error('[Pagos] catch:', e)
      showToast('Error de conexión al guardar los pagos', 'error')
    }

    setGuardando(false)
    setSeleccionados(new Set())
  }

  const guardar = () => {
    if (seleccionados.size === 0) return showToast('Seleccioná al menos un alumno', 'warning')
    if (!cobrarCuota && !cobrarDescuento && !cobrarRecargo && !cobrarMatricula && !cobrarProporcional && !cobrarExamen && !cobrarClaseParticular) return showToast('Seleccioná al menos un concepto', 'warning')
    if (cobrarDescuento && [...seleccionados].some(id => (montoDescuento[id] ?? alumnos.find((a:any)=>a.id===id)?.cuota_mensual ?? 0) <= 0)) return showToast('Ingresá el monto con descuento para cada alumno seleccionado', 'warning')
    if (cobrarProporcional && (!montoProporcional || parseFloat(montoProporcional) <= 0)) return showToast('Ingresá el monto proporcional', 'warning')
    if (cobrarRecargo && (!montoRecargo || parseFloat(montoRecargo) <= 0)) return showToast('Ingresá el monto del recargo', 'warning')

    // ── Advertencia si algún alumno seleccionado ya pagó cuota este mes ─────
    if (seleccionadosQueYaPagaron.length > 0 && (cobrarCuota || cobrarDescuento || cobrarRecargo || cobrarMatricula)) {
      const nombres = seleccionadosQueYaPagaron
        .map(id => { const a = alumnos.find((x: any) => x.id === id); return a ? `${a.nombre} ${a.apellido}` : '' })
        .filter(Boolean).join(', ')
      const concepto = [cobrarCuota && 'cuota', cobrarDescuento && 'cuota con descuento', cobrarRecargo && 'recargo', cobrarMatricula && 'matrícula'].filter(Boolean).join(', ')
      window.dispatchEvent(new CustomEvent('confirm-action', { detail: {
        mensaje: `${seleccionadosQueYaPagaron.length} alumno${seleccionadosQueYaPagaron.length > 1 ? 's' : ''} ya ${seleccionadosQueYaPagaron.length > 1 ? 'tienen' : 'tiene'} pago de ${concepto} en ${mes}`,
        detalle: `${nombres}. El pago anterior será reemplazado. ¿Continuás?`,
        labelConfirm: 'Sí, reemplazar',
        onConfirm: ejecutarGuardado,
      }}))
      return
    }

    ejecutarGuardado()
  }
  const descargarExcel = () => {
    const rows = [
      ['REPORTE DE PAGOS'],
      [`Mes: ${repMes} ${repAnio}`, '', '', `Total: $${totalRecaudado.toLocaleString('es-AR')}`],
      [''],
      ['Alumno', 'DNI', 'Concepto', 'Monto', 'Método', 'Fecha', 'Observaciones'],
      ...pagosReporteFiltrados.map(p => [
        `${p.alumnos?.nombre} ${p.alumnos?.apellido}`,
        p.alumnos?.es_menor ? (p.alumnos?.padre_dni || '—') : (p.alumnos?.dni || '—'),
        p.tipo || 'cuota',
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
        <td>${p.alumnos?.es_menor ? (p.alumnos?.padre_dni || '—') : (p.alumnos?.dni || '—')}</td>
        <td><span style="padding:2px 8px;border-radius:20px;font-size:10px;font-weight:700;background:#f4eefb;color:#652f8d">${p.tipo || 'cuota'}</span></td>
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
    <table><tr><th>Alumno</th><th>DNI</th><th>Concepto</th><th>Monto</th><th>Método</th><th>Fecha</th></tr>
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
    <>
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
        <button
          onClick={() => setVistaTab('deudores')}
          style={{ padding:'9px 18px', borderRadius:'20px', border:'1.5px solid', fontSize:'13px', fontWeight:600, cursor:'pointer',
            background: vistaTab === 'deudores' ? '#dc2626' : 'transparent',
            color: vistaTab === 'deudores' ? '#fff' : 'var(--text2)',
            borderColor: vistaTab === 'deudores' ? '#dc2626' : 'var(--border)' }}>
          Deudores
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
                    {pagosAgrupados.length} alumnos · {pagosReporteFiltrados.length} cobros{filtroRepDia ? ` · ${new Date(filtroRepDia + 'T12:00:00').toLocaleDateString('es-AR')}` : ` · ${repMes} ${repAnio}`}
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
                  {pagosAgrupados.map((p: any, i: number) => {
                    const tel = p.alumnos?.es_menor
                      ? (p.alumnos.padre_telefono || p.alumnos.telefono)
                      : (p.alumnos?.telefono || p.alumnos?.padre_telefono)
                    const cel = tel?.replace(/\D/g, '')
                    const contacto = p.alumnos?.es_menor ? (p.alumnos.padre_nombre || p.alumnos.nombre) : p.alumnos?.nombre
                    const fechaFmt = p.fecha_pago
                      ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })
                      : new Date().toLocaleDateString('es-AR', { day:'numeric', month:'long', year:'numeric' })
                    const urlRecibo = typeof window !== 'undefined' ? `${window.location.origin}/api/recibo/${p.id}` : ''
                    const montoTotal = (p._montoTotal || p.monto) || 0
                    const textoWS = `✅ *Recibo de pago*\n\nHola ${contacto}! Confirmamos el pago de *${p.mes} ${p.anio}* de *${p.alumnos?.nombre} ${p.alumnos?.apellido}*.\n\n💰 Monto: *$${montoTotal.toLocaleString('es-AR')}*\n📅 Fecha: ${fechaFmt}\n💳 Método: ${p.metodo || 'Efectivo'}\n\n📄 Tu recibo: ${urlRecibo}\n\n¡Gracias! 🙌`
                    return (
                      <div key={p.id} style={{ padding:'12px 16px', borderBottom: i < pagosAgrupados.length - 1 ? '1px solid var(--border)' : 'none' }}>
                        <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                          <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                            <div style={{ width:32, height:32, borderRadius:8, background:p.alumnos?.color || '#652f8d', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:700, color:'#fff', flexShrink:0 }}>
                              {p.alumnos?.nombre?.[0]}{p.alumnos?.apellido?.[0]}
                            </div>
                            <div>
                              <div style={{ fontSize:'13.5px', fontWeight:600 }}>{p.alumnos?.nombre} {p.alumnos?.apellido}</div>
                              <div style={{ fontSize:'11px', color:'var(--text3)' }}>
                                {p.metodo} · {p.fecha_pago ? new Date(p.fecha_pago + 'T12:00:00').toLocaleDateString('es-AR') : '—'}
                              </div>
                            </div>
                          </div>
                          <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                            <div style={{ textAlign:'right' }}>
                              <div style={{ fontSize:'15px', fontWeight:700, color:'var(--v)' }}>
                                ${fmtMonto(montoTotal)}
                              </div>
                              {/* Chips de concepto por cada pago del alumno ese mes */}
                              <div style={{ display:'flex', gap:'4px', marginTop:'4px', flexWrap:'wrap', justifyContent:'flex-end' }}>
                                {p._tipos.map((t: string, idx: number) => (
                                  <ChipConcepto key={idx} tipo={t} />
                                ))}
                              </div>
                            </div>
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
                                onClick={() => {
                                  window.dispatchEvent(new CustomEvent('confirm-action', { detail: {
                                    mensaje: `¿Eliminar el pago de ${p.alumnos?.nombre} ${p.alumnos?.apellido}?`,
                                    detalle: `${p.mes} ${p.anio} · $${p.monto?.toLocaleString('es-AR')} · ${p.metodo}`,
                                    labelConfirm: 'Eliminar pago',
                                    onConfirm: async () => {
                                      const sb = createClient()
                                      const { error } = await sb.from('pagos_alumnos').delete().eq('id', p.id)
                                      if (!error) {
                                        setPagosReporte(prev => prev.filter(x => x.id !== p.id))
                                        const restantes = pagosReporte.filter(x => x.id !== p.id && x.alumno_id === p.alumno_id)
                                        if (restantes.length === 0) {
                                          setAlumnosPagadosMes(prev => { const n = new Set(prev); n.delete(p.alumno_id); return n })
                                        }
                                        logActivity('Eliminó pago', 'Pagos', `${p.alumnos?.nombre} ${p.alumnos?.apellido} · ${p.mes} ${p.anio}`)
                                        showToast('Pago eliminado')
                                      } else {
                                        showToast('Error al eliminar el pago', 'error')
                                      }
                                    }
                                  }}))
                                }}
                                style={{ padding:'5px 10px', background:'var(--redl, #fef2f2)', color:'var(--red, #dc2626)', border:'1px solid #fca5a5', borderRadius:'7px', fontSize:'11px', fontWeight:600, cursor:'pointer', flexShrink:0 }}>
                                Eliminar
                              </button>
                            )}
                          </div>
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

      {/* ── VISTA DEUDORES ────────────────────────────────────────────────── */}
      {vistaTab === 'deudores' && (
        <div>
          {/* Deudas pendientes — puntuales, ej. lo que trae un alumno reactivado.
              Distinto de "Deudores" de abajo, que es la cuota normal del mes. */}
          {(loadingDeudasPendientes || deudasPendientes.length > 0) && (
            <div style={{ background:'var(--white)', border:'1.5px solid #f5c5c5', borderRadius:'16px', padding:'16px', marginBottom:'14px' }}>
              <div style={{ fontSize:'11px', fontWeight:700, color:'#dc2626', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:'10px' }}>
                Deudas pendientes {deudasPendientes.length > 0 ? `(${deudasPendientes.length})` : ''}
              </div>
              {loadingDeudasPendientes ? (
                <div style={{ fontSize:'13px', color:'var(--text3)', padding:'8px 0' }}>Cargando...</div>
              ) : (
                <div style={{ display:'flex', flexDirection:'column', gap:'8px' }}>
                  {deudasPendientes.map((d: any) => (
                    <div key={d.id} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', background:'var(--bg)', borderRadius:'10px' }}>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontSize:'13px', fontWeight:700 }}>{d.alumnos?.nombre} {d.alumnos?.apellido}</div>
                        <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>
                          {d.motivo} · desde {fmtFecha(d.fecha_generada)}
                        </div>
                      </div>
                      <div style={{ fontSize:'14px', fontWeight:700, color:'#dc2626', flexShrink:0 }}>${fmtMonto(d.monto)}</div>
                      {puedeGestionarDeudas && (
                        <button onClick={() => marcarDeudaPagada(d)} disabled={marcandoPagadaId === d.id}
                          style={{ padding:'7px 12px', background: marcandoPagadaId === d.id ? '#aaa' : 'var(--v)', color:'#fff', border:'none', borderRadius:'9px', fontSize:'12px', fontWeight:600, cursor: marcandoPagadaId === d.id ? 'not-allowed' : 'pointer', flexShrink:0, whiteSpace:'nowrap' }}>
                          {marcandoPagadaId === d.id ? '...' : '✓ Pagó'}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          )}

          {/* Filtros */}
          <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'16px', padding:'16px', marginBottom:'14px' }}>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:'10px' }}>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Mes</div>
                <select style={IS} value={deudMes} onChange={e => setDeudMes(e.target.value)}>
                  {MESES.map(m => <option key={m}>{m}</option>)}
                </select>
              </div>
              <div>
                <div style={{ fontSize:'10.5px', fontWeight:600, color:'var(--text3)', textTransform:'uppercase', marginBottom:'3px' }}>Año</div>
                <select style={IS} value={deudAnio} onChange={e => setDeudAnio(+e.target.value)}>
                  {[2024, 2025, 2026, 2027].map(y => <option key={y}>{y}</option>)}
                </select>
              </div>
            </div>
          </div>

          {loadingDeudores ? (
            <div style={{ textAlign:'center', padding:'32px', color:'var(--text3)' }}>Cargando...</div>
          ) : (
            <>
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'12px', flexWrap:'wrap', gap:'8px' }}>
                <div>
                  <div style={{ fontSize:'15px', fontWeight:700 }}>
                    {deudores.length} deudor{deudores.length !== 1 ? 'es' : ''} · {deudMes} {deudAnio}
                  </div>
                  <div style={{ fontSize:'12px', color:'var(--text3)', marginTop:'2px' }}>
                    Alumnos activos ese mes sin pago registrado
                  </div>
                  {deudores.length > 0 && (
                    <div style={{ fontSize:'13px', fontWeight:700, color:'#dc2626', marginTop:'4px' }}>
                      Total deuda: ${deudores.reduce((s:number,a:any)=>s+Math.max(0,(a.cuota_mensual||0)-(a._montoParcial||0)),0).toLocaleString('es-AR')}
                    </div>
                  )}
                </div>
                {deudores.length > 0 && (
                  <div style={{ display:'flex', gap:'8px' }}>
                    <button onClick={descargarDeudoresXLS} style={{ padding:'7px 13px', background:'var(--white)', color:'var(--v)', border:'1.5px solid var(--v)', borderRadius:'9px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>⬇ XLS</button>
                    <button onClick={descargarDeudoresPDF} style={{ padding:'7px 13px', background:'var(--v)', color:'#fff', border:'none', borderRadius:'9px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>⬇ PDF</button>
                  </div>
                )}
              </div>

              {deudores.length === 0 ? (
                <div style={{ textAlign:'center', padding:'40px', color:'var(--text3)', background:'var(--white)', borderRadius:'14px', border:'1.5px solid var(--border)' }}>
                  ✓ Sin deudores para {deudMes} {deudAnio}
                </div>
              ) : (
                <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'14px', overflow:'hidden' }}>
                  {deudores.sort((a: any, b: any) => a.apellido.localeCompare(b.apellido)).map((a: any, i: number) => {
                    const tel = a.es_menor ? (a.padre_telefono || a.telefono) : (a.telefono || a.padre_telefono)
                    const cel = tel?.replace(/\D/g, '')
                    const contacto = a.es_menor ? (a.padre_nombre || a.nombre) : a.nombre
                    const msgDeudor = `Hola ${contacto} 👋, te escribimos desde Next English Institute. Notamos que la cuota de *${deudMes} ${deudAnio}* de *${a.nombre} ${a.apellido}* aún no fue registrada.\n📌 Si ya realizaste el pago, por favor ignorá este mensaje. Cualquier consulta estamos disponibles. ¡Muchas gracias! 🙌`
                    return (
                      <div key={a.id} style={{ padding:'12px 16px', borderBottom: i < deudores.length - 1 ? '1px solid var(--border)' : 'none', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
                        <div style={{ display:'flex', alignItems:'center', gap:'10px' }}>
                          <div style={{ width:32, height:32, borderRadius:8, background:a.color || '#652f8d', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:700, color:'#fff', flexShrink:0 }}>
                            {a.nombre?.[0]}{a.apellido?.[0]}
                          </div>
                          <div>
                            <div style={{ fontSize:'13.5px', fontWeight:600 }}>{a.nombre} {a.apellido}</div>
                            <div style={{ fontSize:'11px', color:'var(--text3)' }}>
                              {cursosPorAlumno[a.id] || a.nivel || '—'} · ${a.cuota_mensual?.toLocaleString('es-AR')}/mes
                            </div>
                            {notasPorAlumno[a.id] && (
                              <div style={{ fontSize:'11px', color:'var(--amber)', fontWeight:600, marginTop:'1px' }}>
                                📌 {notasPorAlumno[a.id]}
                              </div>
                            )}
                          </div>
                        </div>
                        <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                          {a._estadoPago === 'parcial' ? (
                            <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11.5px', fontWeight:600, background:'var(--amberl)', color:'var(--amber)', border:'1px solid var(--amber)' }}>
                              Pago parcial ${a._montoParcial?.toLocaleString('es-AR')}
                            </span>
                          ) : (
                            <span style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11.5px', fontWeight:600, background:'#fef2f2', color:'#dc2626', border:'1px solid #fca5a5' }}>
                              Sin pago
                            </span>
                          )}
                          {cel && (
                            <a
                              href={`https://wa.me/54${cel}?text=${encodeURIComponent(msgDeudor)}`}
                              target="_blank" rel="noopener noreferrer"
                              style={{ padding:'5px 10px', background:'#25D366', color:'#fff', borderRadius:'7px', fontSize:'11px', fontWeight:600, textDecoration:'none', display:'flex', alignItems:'center', gap:'3px', flexShrink:0 }}>
                              <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                              WS
                            </a>
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
                onClick={() => {
                  window.dispatchEvent(new CustomEvent('confirm-action', { detail: {
                    mensaje: `¿Eliminar el pago de ${pagoEditando.alumnos?.nombre} ${pagoEditando.alumnos?.apellido}?`,
                    detalle: `${pagoEditando.mes} ${pagoEditando.anio} · $${pagoEditando.monto?.toLocaleString('es-AR')} · ${pagoEditando.metodo}`,
                    labelConfirm: 'Eliminar pago',
                    onConfirm: async () => {
                      setEliminandoPago(true)
                      const sb = createClient()
                      const { error } = await sb.from('pagos_alumnos').delete().eq('id', pagoEditando.id)
                      if (!error) {
                        setPagosReporte(prev => prev.filter(x => x.id !== pagoEditando.id))
                        const restantes = pagosReporte.filter(x => x.id !== pagoEditando.id && x.alumno_id === pagoEditando.alumno_id)
                        if (restantes.length === 0) {
                          setAlumnosPagadosMes(prev => { const n = new Set(prev); n.delete(pagoEditando.alumno_id); return n })
                        }
                        logActivity('Eliminó pago', 'Pagos', `${pagoEditando.alumnos?.nombre} ${pagoEditando.alumnos?.apellido} · ${pagoEditando.mes} ${pagoEditando.anio}`)
                        showToast('Pago eliminado')
                        setPagoEditando(null)
                      } else {
                        showToast('Error al eliminar el pago', 'error')
                      }
                      setEliminandoPago(false)
                    }
                  }}))
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
                  showToast('✓ Pago actualizado')
                  setPagoEditando(null)
                } else {
                  showToast('Error al guardar', 'error')
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
          {/* ── PANEL DE RESULTADO POST-REGISTRO ─────────────────────────── */}
          {resultadoRegistro && (
            <div style={{
              background: resultadoRegistro.errores === 0 ? 'var(--greenl)' : 'var(--amberl)',
              border: `1.5px solid ${resultadoRegistro.errores === 0 ? 'var(--green)' : 'var(--amber)'}`,
              borderRadius:'16px', padding:'16px', marginBottom:'14px',
            }}>
              {/* Encabezado */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'10px' }}>
                <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                  <span style={{ fontSize:'20px' }}>{resultadoRegistro.errores === 0 ? '✅' : '⚠️'}</span>
                  <div>
                    <div style={{ fontSize:'14px', fontWeight:700, color: resultadoRegistro.errores === 0 ? 'var(--green)' : 'var(--amber)' }}>
                      {resultadoRegistro.errores === 0
                        ? `${resultadoRegistro.ok} pago${resultadoRegistro.ok !== 1 ? 's' : ''} registrado${resultadoRegistro.ok !== 1 ? 's' : ''} correctamente`
                        : `${resultadoRegistro.ok} OK · ${resultadoRegistro.errores} con error`}
                    </div>
                    <div style={{ fontSize:'12px', color:'var(--text2)', marginTop:'1px' }}>
                      {resultadoRegistro.mes} {anioActual} · {resultadoRegistro.metodo}
                    </div>
                  </div>
                </div>
                <button
                  onClick={() => setResultadoRegistro(null)}
                  style={{ background:'transparent', border:'none', fontSize:'18px', color:'var(--text3)', cursor:'pointer', lineHeight:1, padding:'2px' }}>
                  ×
                </button>
              </div>

              {/* Detalle: monto total + conceptos */}
              <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', padding:'10px 12px', background:'rgba(255,255,255,.55)', borderRadius:'10px', marginBottom:'8px' }}>
                <div style={{ fontSize:'12px', color:'var(--text2)', fontWeight:600 }}>Total registrado</div>
                <div style={{ fontSize:'18px', fontWeight:800, color:'var(--v)' }}>
                  ${fmtMonto(resultadoRegistro.totalMonto)}
                </div>
              </div>

              {/* Chips de conceptos aplicados */}
              <div style={{ display:'flex', gap:'6px', flexWrap:'wrap' }}>
                {resultadoRegistro.conceptos.map((c, i) => (
                  <span key={i} style={{ padding:'3px 10px', borderRadius:'20px', fontSize:'11.5px', fontWeight:600, background:'rgba(255,255,255,.7)', color:'var(--text2)', border:'1px solid rgba(0,0,0,.08)' }}>
                    {c}
                  </span>
                ))}
              </div>

              {/* Acceso rápido al reporte */}
              <button
                onClick={() => setVistaTab('reporte')}
                style={{ marginTop:'10px', padding:'8px 14px', background:'transparent', color:'var(--v)', border:'1.5px solid var(--v)', borderRadius:'9px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
                Ver reporte del mes →
              </button>
            </div>
          )}

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
              onClick={() => { setCobrarCuota(!cobrarCuota); if (!cobrarCuota) setCobrarDescuento(false) }}
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

            {/* Cuota con descuento */}
            <div
              onClick={() => { setCobrarDescuento(!cobrarDescuento); if (!cobrarDescuento) setCobrarCuota(false) }}
              style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'10px', marginBottom:'8px', cursor:'pointer',
                border: `1.5px solid ${cobrarDescuento ? '#0f766e' : 'var(--border)'}`,
                background: cobrarDescuento ? '#e6f7f5' : 'var(--white)' }}>
              <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarDescuento ? '#0f766e' : 'var(--border)'}`, background: cobrarDescuento ? '#0f766e' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                {cobrarDescuento && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
              </div>
              <div style={{ flex:1 }}>
                <div style={{ fontSize:'13px', fontWeight:600 }}>Cuota con descuento</div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>
                  {mes} {anioActual} · monto editable por alumno — cuenta como cuota pagada
                </div>
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
              style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', borderRadius:'10px', marginBottom:'8px', cursor:'pointer',
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

            {/* Monto proporcional */}
            <div style={{ borderRadius:'10px', border: `1.5px solid ${cobrarProporcional ? 'var(--green)' : 'var(--border)'}`, background: cobrarProporcional ? 'var(--greenl)' : 'var(--white)' }}>
              <div onClick={() => setCobrarProporcional(!cobrarProporcional)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', cursor:'pointer' }}>
                <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarProporcional ? 'var(--green)' : 'var(--border)'}`, background: cobrarProporcional ? 'var(--green)' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {cobrarProporcional && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600 }}>Monto proporcional</div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>Se acumula — no reemplaza pagos anteriores del mes</div>
                </div>
                {cobrarProporcional && montoProporcional && (
                  <div style={{ fontSize:'14px', fontWeight:700, color:'var(--green)' }}>${parseFloat(montoProporcional || '0').toLocaleString('es-AR')}</div>
                )}
              </div>
              {cobrarProporcional && (
                <div style={{ padding:'0 12px 10px' }}>
                  <input
                    type="number"
                    style={{ ...IS, borderColor:'var(--green)' }}
                    placeholder="Monto proporcional para todos..."
                    value={montoProporcional}
                    onChange={e => setMontoProporcional(e.target.value)}
                  />
                </div>
              )}
            </div>

            {/* Examen */}
            <div style={{ borderRadius:'10px', border: `1.5px solid ${cobrarExamen ? '#7c3aed' : 'var(--border)'}`, background: cobrarExamen ? '#ede9fe' : 'var(--white)', marginTop:'8px' }}>
              <div onClick={() => setCobrarExamen(!cobrarExamen)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', cursor:'pointer' }}>
                <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarExamen ? '#7c3aed' : 'var(--border)'}`, background: cobrarExamen ? '#7c3aed' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {cobrarExamen && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600 }}>Examen</div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>Monto manual — se registra como ingreso de examen en el EERR</div>
                </div>
                {cobrarExamen && montoExamen && (
                  <div style={{ fontSize:'14px', fontWeight:700, color:'#7c3aed' }}>${parseFloat(montoExamen || '0').toLocaleString('es-AR')}</div>
                )}
              </div>
              {cobrarExamen && (
                <div style={{ padding:'0 12px 10px' }}>
                  <input
                    type="number"
                    style={{ ...IS, borderColor:'#7c3aed' }}
                    placeholder="Monto del examen..."
                    value={montoExamen}
                    onChange={e => setMontoExamen(e.target.value)}
                  />
                </div>
              )}
            </div>
            {/* Clase particular */}
            <div style={{ borderRadius:'10px', border: `1.5px solid ${cobrarClaseParticular ? '#d4537e' : 'var(--border)'}`, background: cobrarClaseParticular ? '#fbeaf0' : 'var(--white)', marginTop:'8px' }}>
              <div onClick={() => setCobrarClaseParticular(!cobrarClaseParticular)} style={{ display:'flex', alignItems:'center', gap:'10px', padding:'10px 12px', cursor:'pointer' }}>
                <div style={{ width:18, height:18, borderRadius:5, border: `2px solid ${cobrarClaseParticular ? '#d4537e' : 'var(--border)'}`, background: cobrarClaseParticular ? '#d4537e' : 'transparent', display:'flex', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                  {cobrarClaseParticular && <svg width="10" height="10" viewBox="0 0 10 10" fill="none" stroke="white" strokeWidth="2.5"><path d="M2 5l2 2 4-4"/></svg>}
                </div>
                <div style={{ flex:1 }}>
                  <div style={{ fontSize:'13px', fontWeight:600 }}>Clase particular</div>
                  <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'1px' }}>
                    {cargandoClaseParticular ? 'Calculando clases asistidas...' : `${mes} ${anioActual} · clases asistidas × tarifa de cada alumno`}
                  </div>
                </div>
              </div>
            </div>
          </div>

          {/* ── BARRA DE BÚSQUEDA RÁPIDA ─────────────────────────────────── */}
          <div style={{ position:'relative', marginBottom:'10px' }}>
            <input
              type="text"
              value={busqueda}
              onChange={e => setBusqueda(e.target.value)}
              placeholder="🔍 Buscar alumno por nombre o apellido..."
              style={{ ...IS, width:'100%', paddingLeft:'16px', fontSize:'14px', borderRadius:'12px', boxSizing:'border-box' }}
              autoComplete="off"
            />
            {busqueda && (
              <button
                onClick={() => setBusqueda('')}
                style={{ position:'absolute', right:'12px', top:'50%', transform:'translateY(-50%)', background:'none', border:'none', cursor:'pointer', fontSize:'16px', color:'var(--text3)', lineHeight:1, padding:'0 4px' }}>
                ×
              </button>
            )}
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
              <div style={{ flex:1, fontSize:'13px', fontWeight:600 }}>
                {busqueda
                  ? `${filtrados.length} resultado${filtrados.length !== 1 ? 's' : ''} para "${busqueda}"`
                  : `Seleccionar todos (${filtrados.length})`}
              </div>
            </div>
            <div style={{ maxHeight:'360px', overflowY:'auto' }}>
              {filtrados.map((a: any) => {
                const sel = seleccionados.has(a.id)
                let monto = 0
                if (cobrarCuota) monto += (a.cuota_mensual || 0)
                if (cobrarDescuento) monto += (montoDescuento[a.id] ?? a.cuota_mensual ?? 0)
                if (cobrarRecargo) monto += (parseFloat(montoRecargo) || 0)
                if (cobrarMatricula) monto += (a.matricula || 0)
                if (cobrarProporcional) monto += (parseFloat(montoProporcional) || 0)
                if (cobrarClaseParticular) monto += (montoClaseParticular[a.id] || 0)
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
                      <div style={{ fontSize:'11.5px', color:'var(--text2)' }}>
                        {cursosPorAlumno[a.id] || a.nivel || '—'}{a.tarifa_clase ? ' · particular' : ''}
                      </div>
                      {notasPorAlumno[a.id] && (
                        <div
                          onClick={e => { e.stopPropagation(); abrirNota(a.id) }}
                          style={{ fontSize:'11px', color:'var(--amber)', fontWeight:600, marginTop:'2px', display:'flex', alignItems:'center', gap:'4px', cursor:'pointer' }}>
                          <span>📌</span>{notasPorAlumno[a.id]}
                        </div>
                      )}
                    </div>
                    {/* Botón agregar nota si no tiene */}
                    {!notasPorAlumno[a.id] && !yaPago && (
                      <button
                        onClick={e => { e.stopPropagation(); abrirNota(a.id) }}
                        style={{ background:'none', border:'none', cursor:'pointer', fontSize:'14px', color:'var(--text3)', padding:'2px 4px', flexShrink:0, opacity:.5 }}
                        title="Agregar nota de cobro">
                        📌
                      </button>
                    )}
                    {cobrarDescuento && sel ? (
                      <input
                        type="number"
                        value={montoDescuento[a.id] ?? a.cuota_mensual ?? 0}
                        onClick={e => e.stopPropagation()}
                        onChange={e => setMontoDescuento(prev => ({ ...prev, [a.id]: +e.target.value }))}
                        style={{ width:'86px', padding:'6px 8px', border:'1.5px solid #0f766e', borderRadius:'8px', fontSize:'13px', fontWeight:700, color:'#0f766e', textAlign:'right', flexShrink:0 }}
                      />
                    ) : yaPago
                      ? <span style={{ fontSize:'11px', fontWeight:700, color:'var(--green)', background:'var(--greenl)', padding:'3px 10px', borderRadius:'20px', flexShrink:0, textAlign:'right' }}>✓ {alumnosPagadosLabelMes[a.id] || 'Ya pagó'}</span>
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

            {/* Advertencia: alumnos seleccionados que ya pagaron */}
            {seleccionadosQueYaPagaron.length > 0 && (cobrarCuota || cobrarDescuento || cobrarRecargo || cobrarMatricula) && (
              <div style={{ padding:'9px 12px', background:'var(--amberl)', border:'1px solid var(--amber)', borderRadius:'10px', fontSize:'12px', color:'var(--amber)', fontWeight:600, marginBottom:'10px', lineHeight:1.4 }}>
                ⚠ {seleccionadosQueYaPagaron.length} alumno{seleccionadosQueYaPagaron.length > 1 ? 's' : ''} ya {seleccionadosQueYaPagaron.length > 1 ? 'tienen' : 'tiene'} un pago de cuota/recargo/matrícula en {mes}. Al confirmar, ese pago será reemplazado.
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

    {/* ── MODAL EDITAR NOTA DE COBRO ── */}
    {editandoNota && (
      <div
        style={{ position:'fixed', inset:0, background:'rgba(20,0,40,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center', zIndex:300 }}
        onClick={() => setEditandoNota(null)}
      >
        <div
          style={{ background:'var(--white)', borderRadius:'24px 24px 0 0', padding:'24px 20px 32px', width:'100%', maxWidth:'480px' }}
          onClick={e => e.stopPropagation()}
        >
          <div style={{ width:'40px', height:'4px', background:'var(--border)', borderRadius:'2px', margin:'0 auto 20px' }} />
          <div style={{ fontSize:'17px', fontWeight:700, marginBottom:'6px' }}>Nota de cobro</div>
          <div style={{ fontSize:'12px', color:'var(--text2)', marginBottom:'16px' }}>
            Visible en la lista de pagos todos los meses. Sirve para recordar fechas, métodos o acuerdos especiales.
          </div>
          <textarea
            value={notaInput}
            onChange={e => setNotaInput(e.target.value)}
            placeholder="Ej: Paga los 20 de cada mes · Solo efectivo · Acordar con director..."
            rows={3}
            style={{ width:'100%', padding:'11px 12px', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', resize:'none', color:'var(--text)', background:'var(--white)', marginBottom:'14px' }}
            autoFocus
          />
          <div style={{ display:'flex', gap:'10px' }}>
            {notasPorAlumno[editandoNota] && (
              <button
                onClick={() => { setNotaInput(''); guardarNota(editandoNota) }}
                disabled={guardandoNota}
                style={{ padding:'12px 16px', background:'var(--redl)', color:'var(--red)', border:'1px solid #fca5a5', borderRadius:'12px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
                Eliminar
              </button>
            )}
            <button
              onClick={() => setEditandoNota(null)}
              style={{ flex:1, padding:'12px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'14px', fontWeight:600, cursor:'pointer', color:'var(--text2)' }}>
              Cancelar
            </button>
            <button
              onClick={() => guardarNota(editandoNota)}
              disabled={guardandoNota}
              style={{ flex:2, padding:'12px', background:'var(--v)', color:'#fff', border:'none', borderRadius:'12px', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
              {guardandoNota ? 'Guardando...' : 'Guardar nota'}
            </button>
          </div>
        </div>
      </div>
    )}
    </>
  )
}
