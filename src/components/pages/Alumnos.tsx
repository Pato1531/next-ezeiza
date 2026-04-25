'use client'
import { useState, useEffect, useRef } from 'react'
import { useAlumnos, usePagos, useMiProfesora, useHistorialCursos, useCuotasHistorial, useCursos, logActivity, apiHeaders } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

function hoy() { return new Date().toISOString().split('T')[0] }
function fmtFecha(f: string) { if(!f)return'—'; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}` }

const NIVELES = ['Básico','Intermedio','Advanced','Cambridge']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const COLORES = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#1B6B4A','#7d3aab','#2d5016','#5a3010','#1a4b8a']
const NIVEL_COL: Record<string,{bg:string,text:string}> = {
  'Básico':     {bg:'#FEF3CD',text:'#b45309'},
  'Intermedio': {bg:'#E0F0F7',text:'#1a6b8a'},
  'Advanced':   {bg:'#e6f4ec',text:'#2d7a4f'},
  'Cambridge':  {bg:'#f2e8f9',text:'#652f8d'},
}

const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const
const Input = ({value,onChange,type='text',placeholder=''}:any) => <input type={type} value={value} placeholder={placeholder} onChange={(e:any)=>onChange(e.target.value)} style={IS} />
const Loader = () => <div style={{color:'var(--text3)',padding:'24px',textAlign:'center'}}>Cargando...</div>
const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const BtnG = ({children,sm,onClick,style}:any) => <button onClick={onClick} style={{padding:sm?'9px 14px':'12px 20px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:'pointer',...style}}>{children}</button>
const BtnDanger = ({children,sm,onClick}:any) => <button onClick={onClick} style={{padding:sm?'7px 13px':'9px 14px',background:'var(--redl)',color:'var(--red)',border:'1.5px solid #f5c5c5',borderRadius:'10px',fontSize:sm?'12px':'13px',fontWeight:600,cursor:'pointer'}}>{children}</button>
const Badge = ({children,cls,style}:any) => { const s:Record<string,any>={'b-green':{bg:'var(--greenl)',c:'var(--green)'},'b-blue':{bg:'var(--bluel)',c:'var(--blue)'},'b-amber':{bg:'var(--amberl)',c:'var(--amber)'},'b-red':{bg:'var(--redl)',c:'var(--red)'},'b-purple':{bg:'var(--vl)',c:'var(--v)'}}; const t=s[cls]??s['b-purple']; return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:t.bg,color:t.c,...style}}>{children}</span> }
const SearchBar = ({value,onChange}:any) => <div style={{position:'relative',marginBottom:'14px'}}><input type="text" value={value} onChange={(e:any)=>onChange(e.target.value)} placeholder="Buscar alumno..." style={{...IS,paddingLeft:'42px'}}/><svg style={{position:'absolute',left:'14px',top:'50%',transform:'translateY(-50%)',width:'16px',height:'16px'}} viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg></div>
const ListItem = ({children,onClick}:any) => <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'10px',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')} onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>{children}</div>
const Av = ({color,size,children}:any) => <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.28+'px',fontWeight:700,color:'#fff',flexShrink:0}}>{children}</div>
const Kpi = ({val,label,color='var(--text)'}:any) => <div style={{background:'var(--white)',padding:'12px 8px',textAlign:'center'}}><div style={{fontSize:'18px',fontWeight:700,color}}>{val}</div><div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>{label}</div></div>
const TabBtn = ({children,active,onClick}:any) => <button onClick={onClick} style={{padding:'9px 16px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:active?'var(--v)':'var(--border)',background:active?'var(--v)':'var(--white)',color:active?'#fff':'var(--text2)',whiteSpace:'nowrap'}}>{children}</button>
const Row2 = ({children}:any) => <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px'}}>{children}</div>
const Field2 = ({label,children}:any) => <div style={{marginBottom:'11px'}}><div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>{label}</div>{children}</div>
const FieldRO = ({label,value}:any) => <Field2 label={label}><div style={{padding:'8px 11px',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'13px',background:'var(--bg)',color:'var(--text2)'}}>{value}</div></Field2>
const Card = ({children}:any) => <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px',marginBottom:'14px'}}>{children}</div>
const Chevron = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M7 5l5 5-5 5"/></svg>
const ModalSheet = ({title,children,onClose}:any) => (
  <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)onClose()}}>
    <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'}}>
      <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
      <div style={{fontSize:'18px',fontWeight:700,marginBottom:'20px'}}>{title}</div>
      {children}
    </div>
  </div>
)


import { showToast } from '@/components/Toast'

type Vista = 'lista' | 'detalle' | 'form' | 'baja' | 'bajas_historicas' | 'renovacion_matricula'

export default function Alumnos() {
  const { alumnos: todosAlumnos, loading, actualizar, agregar, recargar } = useAlumnos()
  const { usuario } = useAuth()
  const { miProfesora, loading: loadingProf } = useMiProfesora()

  // Si es profesora, mostrar solo alumnos de sus cursos
  const [alumnosDeProfesora, setAlumnosDeProfesora] = useState<string[]>([])
  useEffect(() => {
    if (usuario?.rol !== 'profesora' || !miProfesora) return
    const sb = createClient()
    sb.from('cursos').select('id').eq('profesora_id', miProfesora.id).then(({ data: cursosDatos }) => {
      if (!cursosDatos?.length) return
      const cursoIds = cursosDatos.map(c => c.id)
      sb.from('cursos_alumnos').select('alumno_id').in('curso_id', cursoIds).then(({ data }) => {
        const ids = [...new Set((data || []).map((r: any) => r.alumno_id))]
        setAlumnosDeProfesora(ids)
      })
    })
  }, [usuario?.rol, miProfesora?.id])

  const alumnos = usuario?.rol === 'profesora'
    ? todosAlumnos.filter(a => alumnosDeProfesora.includes(a.id))
    : todosAlumnos
  const [vista, setVista] = useState<Vista>('lista')
  const [selId, setSelId] = useState<string|null>(null)
  const [tab, setTab] = useState<'datos'|'pagos'>('datos')
  const [form, setForm] = useState<any>(null)
  const [formStep, setFormStep] = useState(0)
  const [guardando, setGuardando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [soloSinCurso, setSoloSinCurso] = useState(false)
  const [soloSinCuota, setSoloSinCuota] = useState(false)
  const [soloSinTel, setSoloSinTel] = useState(false)
  const [soloSinDni, setSoloSinDni] = useState(false)
  const [soloSinFecha, setSoloSinFecha] = useState(false)
  const [filtroPago, setFiltroPago] = useState<'todos'|'pagaron'|'no_pagaron'>('todos')
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth())
  const [alumnosSinCurso, setAlumnosSinCurso] = useState<Set<string>>(new Set())
  const [alumnosConPagoMes, setAlumnosConPagoMes] = useState<Set<string>>(new Set())

  const MESES_LISTA = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesActual = MESES_LISTA[new Date().getMonth()]
  const mesFiltroNombre = MESES_LISTA[mesFiltro]

  // Cargar pagos del mes y cursos
  const cargarPagosYCursos = () => {
    if (!alumnos.length) return
    const sb = createClient()
    const anio = new Date().getFullYear()
    Promise.all([
      sb.from('pagos_alumnos').select('alumno_id').eq('mes', mesFiltroNombre).eq('anio', anio),
      sb.from('cursos_alumnos').select('alumno_id')
    ]).then(([pagosRes, cursosRes]) => {
      setAlumnosConPagoMes(new Set((pagosRes.data || []).map((r: any) => r.alumno_id)))
      const conCurso = new Set((cursosRes.data || []).map((r: any) => r.alumno_id))
      setAlumnosSinCurso(new Set(alumnos.map(a => a.id).filter(id => !conCurso.has(id))))
    }).catch(() => {})
  }

  useEffect(() => { cargarPagosYCursos() }, [mesFiltro, alumnos.length])

  // Refrescar lista cuando se registra un pago individual
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      // Agregar inmediatamente al set para que el filtro se actualice al instante
      if (detail?.alumno_id) setAlumnosConPagoMes(prev => new Set([...prev, detail.alumno_id]))
    }
    window.addEventListener('pago-registrado', handler)
    return () => window.removeEventListener('pago-registrado', handler)
  }, [])
  const [modalPago, setModalPago] = useState(false)
  const [motivoBaja, setMotivoBaja] = useState('')
  const [motivoLibre, setMotivoLibre] = useState('')
  const [guardandoBaja, setGuardandoBaja] = useState(false)
  const [bajas, setBajas] = useState<any[]>([])
  const [loadingBajas, setLoadingBajas] = useState(false)
  const [pago, setPago] = useState({ mes: MESES[new Date().getMonth()], anio: new Date().getFullYear(), monto: 0, metodo:'Efectivo', fecha_pago: new Date().toISOString().split('T')[0], observaciones:'' })

  const [renovacionMes, setRenovacionMes] = useState(new Date().getMonth())
  const [renovacionAnio, setRenovacionAnio] = useState(new Date().getFullYear())
  const [renovacionMonto, setRenovacionMonto] = useState('')
  const [renovacionMetodo, setRenovacionMetodo] = useState('Efectivo')
  const [renovacionSeleccionados, setRenovacionSeleccionados] = useState<Set<string>>(new Set())
  const [renovacionAplicando, setRenovacionAplicando] = useState(false)
  const [renovacionResultado, setRenovacionResultado] = useState<{ok:number;err:number}|null>(null)

  const puedeVerPagos = ['director','coordinadora','secretaria'].includes(usuario?.rol||'')
  const puedeEditar = usuario?.rol !== 'profesora'
  const selLive = alumnos.find(a => a.id === selId)
  const selRef = useRef<any>(null)
  if (selLive) selRef.current = selLive
  const sel = selLive ?? selRef.current

  const irADetalle = (id: string) => { setSelId(id); setTab('datos'); setVista('detalle') }
  const irALista = () => { setSelId(null); setVista('lista') }

  // ── Exportar lista de alumnos ────────────────────────────────────────────
  const exportarPDF = () => {
    const fecha = new Date().toLocaleDateString('es-AR', { day:'2-digit', month:'long', year:'numeric' })
    const filas = filtrados.map((a:any) => {
      const pagado = alumnosConPagoMes.has(a.id)
      return `<tr>
        <td>${a.apellido}, ${a.nombre}</td>
        <td>${a.nivel || '—'}</td>
        <td>${a.cuota_mensual ? '$' + a.cuota_mensual.toLocaleString('es-AR') : '—'}</td>
        <td style="color:${pagado?'#2d7a4f':'#c0392b'};font-weight:600">${pagado ? '✓ Pagó' : '✗ Debe'}</td>
        <td>${a.telefono || a.padre_telefono || '—'}</td>
      </tr>`
    }).join('')
    const filtroLabel = [
      busqueda ? `Búsqueda: "${busqueda}"` : '',
      soloSinCurso ? 'Sin curso' : '',
      soloSinCuota ? 'Sin cuota' : '',
      filtroPago !== 'todos' ? (filtroPago === 'pagaron' ? `Pagaron ${mesFiltroNombre}` : `Deben ${mesFiltroNombre}`) : '',
    ].filter(Boolean).join(' · ')
    const win = window.open('', '_blank')!
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Alumnos</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;color:#1a1020}
      h1{font-size:22px;font-weight:800;color:#652f8d;margin:0 0 4px}
      .sub{font-size:13px;color:#888;margin-bottom:24px}
      table{width:100%;border-collapse:collapse;font-size:13px}
      th{background:#652f8d;color:#fff;padding:9px 12px;text-align:left;font-size:11px;text-transform:uppercase;letter-spacing:.05em}
      td{padding:8px 12px;border-bottom:1px solid #f0edf5}
      tr:nth-child(even) td{background:#faf7fd}
      .total{margin-top:16px;font-size:13px;color:#888}
      @media print{body{padding:16px}}
    </style></head><body>
    <h1>Lista de alumnos</h1>
    <div class="sub">${fecha}${filtroLabel ? ' · ' + filtroLabel : ''}</div>
    <table>
      <thead><tr><th>Alumno</th><th>Nivel</th><th>Cuota</th><th>${mesFiltroNombre}</th><th>Teléfono</th></tr></thead>
      <tbody>${filas}</tbody>
    </table>
    <div class="total">${filtrados.length} alumno${filtrados.length!==1?'s':''} · Generado por EduGest</div>
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    win.document.close()
  }

  const exportarExcel = () => {
    const headers = ['Apellido', 'Nombre', 'Nivel', 'Cuota mensual', mesFiltroNombre, 'Teléfono', 'Email', 'DNI', 'Fecha nacimiento']
    const rows = filtrados.map((a:any) => [
      a.apellido,
      a.nombre,
      a.nivel || '',
      a.cuota_mensual || 0,
      alumnosConPagoMes.has(a.id) ? 'Pagó' : 'Debe',
      a.telefono || a.padre_telefono || '',
      a.email || '',
      a.dni || '',
      a.fecha_nacimiento || '',
    ])
    const bom = '\uFEFF'
    const csv = bom + [headers, ...rows]
      .map((row:any[]) => row.map((v:any) => `"${String(v).replace(/"/g, '""')}"`).join(','))
      .join('\n')
    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const link = document.createElement('a')
    link.href = url
    link.download = `alumnos-${mesFiltroNombre.toLowerCase()}-${new Date().getFullYear()}.csv`
    link.click()
    URL.revokeObjectURL(url)
  }
  const irABaja = () => { setMotivoBaja(''); setMotivoLibre(''); setVista('baja') }
  const irABajasHistoricas = async () => {
    setVista('bajas_historicas')
    setLoadingBajas(true)
    const sb = createClient()
    const { data } = await sb.from('bajas_alumnos').select('*').order('fecha_baja', { ascending: false })
    setBajas(data || [])
    setLoadingBajas(false)
  }
  const irAFormNuevo = () => {
    setForm({
      nombre:'', apellido:'', dni:'', edad:0, fecha_nacimiento:'',
      fecha_alta: new Date().toISOString().split('T')[0],
      matricula:0, telefono:'', email:'', nivel:'Básico', cuota_mensual:0,
      es_menor:false, padre_nombre:'', padre_telefono:'', padre_email:'', padre_dni:'',
      color: COLORES[alumnos.length % COLORES.length],
      instituto_id: usuario?.instituto_id || null,
    })
    setFormStep(0)
    setVista('form')
  }
  const irAFormEditar = () => { if (sel) { setForm({...sel}); setFormStep(0); setVista('form') } }

  const guardar = async () => {
    if (!form?.nombre?.trim() || !form?.apellido?.trim()) {
      return alert('Nombre y apellido son obligatorios')
    }
    setGuardando(true)
    const { id, activo, ...datos } = form

    // Garantizar instituto_id siempre presente — fallback al usuario actual
    if (!datos.instituto_id && usuario?.instituto_id) {
      datos.instituto_id = usuario.instituto_id
    }

    // Timeout de seguridad — solo navega si no hubo respuesta, nunca confirma guardado
    const t = setTimeout(() => {
      setGuardando(false)
      showToast('La operación tardó demasiado. Revisá si se guardó.', 'error')
      irALista()
    }, 12000)

    try {
      if (!id) {
        // ── CREAR NUEVO ALUMNO ──
        const nuevo = await agregar(datos)
        clearTimeout(t)
        if (nuevo) {
          // La matrícula se guarda como referencia en el alumno pero NO se registra
          // automáticamente como pago — se cobra manualmente desde el módulo de Pagos
          showToast(`✓ ${datos.nombre} ${datos.apellido} creado correctamente`)
          irADetalle((nuevo as any).id)
        } else {
          showToast('No se pudo crear el alumno. Revisá los datos o la conexión.', 'error')
          irALista()
        }
      } else {
        // ── EDITAR ALUMNO EXISTENTE ──
        // actualizar() del hook ya llama /api/actualizar-alumno internamente
        const ok = await actualizar(id, datos)
        clearTimeout(t)
        if (ok) {
          showToast(`✓ Cambios guardados`)
        } else {
          showToast('Error al guardar los cambios', 'error')
        }
        irADetalle(id)
      }
    } catch (e) {
      clearTimeout(t)
      console.error('[guardar alumno]', e)
      showToast('Error inesperado al guardar', 'error')
      if (id) irADetalle(id)
      else irALista()
    }
    setGuardando(false)
  }

  const registrarBaja = async () => {
    if (!motivoBaja) return alert('Seleccioná un motivo')
    if (motivoBaja === 'Otro' && !motivoLibre.trim()) return alert('Escribí el motivo de la baja')
    if (!sel) return
    setGuardandoBaja(true)
    const sb = createClient()
    try {
      const [bajasRes, , alumnoRes] = await Promise.all([
        sb.from('bajas_alumnos').insert({
          alumno_id: sel.id,
          alumno_nombre: sel.nombre,
          alumno_apellido: sel.apellido,
          curso_nombre: '—',
          nivel: sel.nivel,
          cuota_mensual: sel.cuota_mensual,
          motivo: motivoBaja === 'Otro' ? motivoLibre : motivoBaja,
          fecha_baja: new Date().toISOString().split('T')[0],
        }),
        sb.from('cursos_alumnos').delete().eq('alumno_id', sel.id),
        sb.from('alumnos').update({ activo: false }).eq('id', sel.id),
      ])
      if (bajasRes.error) throw new Error('Error registrando baja: ' + bajasRes.error.message)
      if (alumnoRes.error) throw new Error('Error desactivando alumno: ' + alumnoRes.error.message)
      logActivity('Dio de baja alumno', 'Alumnos', `${sel.nombre} ${sel.apellido} — ${motivoBaja === 'Otro' ? motivoLibre : motivoBaja}`)
      await recargar()
      setSelId(null)
      setVista('lista')
    } catch (e: any) {
      console.error('[registrarBaja]', e)
      showToast('Error al registrar la baja: ' + (e?.message || 'Error desconocido'), 'error')
    }
    setGuardandoBaja(false)
  }

  const eliminar = async () => {
    if (!selId) return
    setConfirmDelete(false)
    irALista()
    const sb = createClient()
    sb.from('alumnos').update({ activo: false }).eq('id', selId)
      .then(() => { recargar().catch(() => {}) })
  }

  const filtrados = alumnos.filter(a => {
    const matchBusq = !busqueda || `${a.nombre} ${a.apellido} ${a.nivel} ${a.dni||''}`.toLowerCase().includes(busqueda.toLowerCase())
    const matchSinCurso = !soloSinCurso || alumnosSinCurso.has(a.id)
    const matchSinCuota = !soloSinCuota || !a.cuota_mensual || a.cuota_mensual === 0
    const matchSinTel = !soloSinTel || (!a.telefono && !a.padre_telefono)
    const matchSinDni = !soloSinDni || (!a.dni)
    const matchSinFecha = !soloSinFecha || (!a.fecha_nacimiento)
    const matchPago = filtroPago === 'todos' ? true
      : filtroPago === 'pagaron' ? alumnosConPagoMes.has(a.id)
      : !alumnosConPagoMes.has(a.id)
    // No mostrar alumnos cuya fecha_alta sea posterior al mes visualizado
    const primerDiaMesFiltro = new Date(new Date().getFullYear(), mesFiltro, 1)
    const matchFechaAlta = !a.fecha_alta || new Date(a.fecha_alta + 'T12:00:00') <= new Date(primerDiaMesFiltro.getFullYear(), primerDiaMesFiltro.getMonth() + 1, 0)
    return matchBusq && matchSinCurso && matchSinCuota && matchSinTel && matchSinDni && matchSinFecha && matchPago && matchFechaAlta
  })

  // No bloquear con loading — mostrar contenido aunque esté cargando

  // ── LISTA ──
  if (vista === 'lista') return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <SL>{alumnos.length} alumnos</SL>
          {puedeVerPagos && (
            <span style={{padding:'2px 9px',borderRadius:'20px',fontSize:'11px',fontWeight:600,background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8'}}>
              {mesFiltroNombre}
            </span>
          )}
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          {(usuario?.rol === 'director' || usuario?.rol === 'secretaria') && (
            <button onClick={() => { setRenovacionSeleccionados(new Set()); setRenovacionResultado(null); setRenovacionMonto(''); setVista('renovacion_matricula') }} style={{padding:'9px 14px',background:'var(--white)',color:'#652f8d',border:'1.5px solid #652f8d',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M17 9V7a5 5 0 00-10 0v2M5 9h10l1 9H4L5 9z"/></svg>
              Matrícula
            </button>
          )}
          {puedeEditar && (
            <button onClick={irABajasHistoricas} style={{padding:'9px 14px',background:'var(--white)',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 10a7 7 0 1014 0A7 7 0 003 10zM10 7v3l2 2"/></svg>
              Bajas
            </button>
          )}
          {puedeEditar && <BtnP sm onClick={irAFormNuevo}>+ Nuevo alumno</BtnP>}
        </div>
      </div>
      <SearchBar value={busqueda} onChange={setBusqueda} />

      {/* Filtro por estado de pago */}
      {puedeVerPagos && (
        <div style={{marginBottom:'12px'}}>
          <div style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px',flexWrap:'wrap'}}>
            <select value={mesFiltro} onChange={e=>setMesFiltro(+e.target.value)}
              style={{padding:'6px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,border:'1.5px solid var(--border)',background:'var(--white)',color:'var(--text2)',cursor:'pointer',outline:'none'}}>
              {MESES_LISTA.map((m,i)=><option key={m} value={i}>{m}</option>)}
            </select>
            {(['todos','pagaron','no_pagaron'] as const).map(f => {
              const labels = {todos:'Todos',pagaron:'✓ Pagaron',no_pagaron:'✗ Sin pago'}
              const colors = {
                todos:{active:'var(--v)',bg:'var(--vl)',border:'var(--v)'},
                pagaron:{active:'var(--green)',bg:'var(--greenl)',border:'var(--green)'},
                no_pagaron:{active:'var(--red)',bg:'var(--redl)',border:'#f5c5c5'},
              }
              const c = colors[f]
              const activo = filtroPago === f
              return (
                <button key={f} onClick={() => setFiltroPago(f)} style={{padding:'6px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:`1.5px solid ${activo?c.border:'var(--border)'}`,background:activo?c.bg:'var(--white)',color:activo?c.active:'var(--text2)',transition:'all .15s'}}>
                  {labels[f]}
                </button>
              )
            })}
          </div>
          {filtroPago !== 'todos' && (
            <div style={{fontSize:'12px',color:'var(--text3)'}}>
              {filtrados.length} alumno{filtrados.length!==1?'s':''} · {mesFiltroNombre} {new Date().getFullYear()}
              <button onClick={() => setFiltroPago('todos')} style={{marginLeft:'8px',fontSize:'12px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer'}}>✕ Limpiar</button>
            </div>
          )}
        </div>
      )}

      {/* Filtros rapidos */}
      <div style={{display:'flex',gap:'8px',marginBottom:'14px',alignItems:'center',flexWrap:'wrap'}}>
        <button onClick={() => setSoloSinCurso(!soloSinCurso)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:soloSinCurso?'var(--amber)':'var(--border)',background:soloSinCurso?'var(--amberl)':'var(--white)',color:soloSinCurso?'var(--amber)':'var(--text2)',transition:'all .15s'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/></svg>
          Sin curso
          {alumnosSinCurso.size > 0 && <span style={{background:soloSinCurso?'var(--amber)':'var(--border)',color:soloSinCurso?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>{alumnosSinCurso.size}</span>}
        </button>
        <button onClick={() => setSoloSinCuota(!soloSinCuota)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:soloSinCuota?'var(--red)':'var(--border)',background:soloSinCuota?'var(--redl)':'var(--white)',color:soloSinCuota?'var(--red)':'var(--text2)',transition:'all .15s'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6"/></svg>
          Sin cuota
          {alumnos.filter((a:any) => !a.cuota_mensual || a.cuota_mensual === 0).length > 0 && (
            <span style={{background:soloSinCuota?'var(--red)':'var(--border)',color:soloSinCuota?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>
              {alumnos.filter((a:any) => !a.cuota_mensual || a.cuota_mensual === 0).length}
            </span>
          )}
        </button>
        <button onClick={() => setSoloSinTel(!soloSinTel)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:soloSinTel?'#1a6b8a':'var(--border)',background:soloSinTel?'#e0f0f7':'var(--white)',color:soloSinTel?'#1a6b8a':'var(--text2)',transition:'all .15s'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M3 4a1 1 0 011-1h3l1 4-2 1a11 11 0 005 5l1-2 4 1v3a1 1 0 01-1 1C7 16 4 10 3 4z"/></svg>
          Sin teléfono
          {alumnos.filter((a:any) => !a.telefono && !a.padre_telefono).length > 0 && (
            <span style={{background:soloSinTel?'#1a6b8a':'var(--border)',color:soloSinTel?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>
              {alumnos.filter((a:any) => !a.telefono && !a.padre_telefono).length}
            </span>
          )}
        </button>
        <button onClick={() => setSoloSinDni(!soloSinDni)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:soloSinDni?'#652f8d':'var(--border)',background:soloSinDni?'var(--vl)':'var(--white)',color:soloSinDni?'var(--v)':'var(--text2)',transition:'all .15s'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="2" y="4" width="16" height="12" rx="2"/><path d="M6 9h4M6 12h7"/></svg>
          Sin DNI
          {alumnos.filter((a:any) => !a.dni).length > 0 && (
            <span style={{background:soloSinDni?'var(--v)':'var(--border)',color:soloSinDni?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>
              {alumnos.filter((a:any) => !a.dni).length}
            </span>
          )}
        </button>
        <button onClick={() => setSoloSinFecha(!soloSinFecha)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:soloSinFecha?'#1a6b8a':'var(--border)',background:soloSinFecha?'#e0f0f7':'var(--white)',color:soloSinFecha?'#1a6b8a':'var(--text2)',transition:'all .15s'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><rect x="3" y="4" width="14" height="13" rx="2"/><path d="M7 2v3M13 2v3M3 9h14"/></svg>
          Sin fecha de nac.
          {alumnos.filter((a:any) => !a.fecha_nacimiento).length > 0 && (
            <span style={{background:soloSinFecha?'#1a6b8a':'var(--border)',color:soloSinFecha?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>
              {alumnos.filter((a:any) => !a.fecha_nacimiento).length}
            </span>
          )}
        </button>
        {(soloSinCurso || soloSinCuota || soloSinTel || soloSinDni || soloSinFecha) && (
          <button onClick={() => { setSoloSinCurso(false); setSoloSinCuota(false); setSoloSinTel(false); setSoloSinDni(false); setSoloSinFecha(false) }} style={{fontSize:'12px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer'}}>✕ Limpiar</button>
        )}
      </div>
      {/* Barra de exportación */}
      {filtrados.length > 0 && (
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
          <div style={{fontSize:'12px',color:'var(--text3)',fontWeight:500}}>
            {filtrados.length} alumno{filtrados.length!==1?'s':''}
          </div>
          <div style={{display:'flex',gap:'6px'}}>
            <button onClick={exportarExcel}
              style={{display:'flex',alignItems:'center',gap:'5px',padding:'7px 12px',background:'var(--white)',color:'var(--green)',border:'1.5px solid var(--green)',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
              Excel
            </button>
            <button onClick={exportarPDF}
              style={{display:'flex',alignItems:'center',gap:'5px',padding:'7px 12px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
              PDF
            </button>
          </div>
        </div>
      )}
      {filtrados.map(a => {
        const col = NIVEL_COL[a.nivel]
        const pagado = alumnosConPagoMes.has(a.id)
        const sinCurso = alumnosSinCurso.has(a.id)
        return (
          <ListItem key={a.id} onClick={() => irADetalle(a.id)}>
            <Av color={a.color} size={44}>{a.nombre[0]}{a.apellido[0]}</Av>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'15px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
              <div style={{display:'flex',gap:'5px',marginTop:'5px',flexWrap:'wrap',alignItems:'center'}}>
                <span style={{padding:'2px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:col?.bg,color:col?.text}}>{a.nivel}</span>
                {puedeVerPagos && (
                  <span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:700,
                    background: pagado ? 'var(--greenl)' : 'var(--redl)',
                    color: pagado ? 'var(--green)' : 'var(--red)',
                    border: `1px solid ${pagado ? 'var(--green)' : '#f5c5c5'}`
                  }}>
                    {pagado ? `✓ ${mesFiltroNombre}` : `✗ ${mesFiltroNombre}`}
                  </span>
                )}
                {a.es_menor && <span style={{padding:'2px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'#E0F0F7',color:'#1a6b8a'}}>Menor</span>}
                {sinCurso && <span style={{padding:'2px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)'}}>Sin curso</span>}
              </div>
            </div>
            <Chevron />
          </ListItem>
        )
      })}
      {filtrados.length === 0 && !busqueda && usuario?.rol === 'profesora' && (
        <div style={{textAlign:'center',padding:'48px 24px',color:'var(--text3)'}}>
          <div style={{fontSize:'40px',marginBottom:'12px'}}>👩‍🎓</div>
          <div style={{fontSize:'16px',fontWeight:600,color:'var(--text2)',marginBottom:'6px'}}>No hay alumnos asignados</div>
          <div style={{fontSize:'13px',lineHeight:1.5}}>Cuando te asignen alumnos a tus cursos van a aparecer acá.</div>
        </div>
      )}
      {filtrados.length === 0 && !busqueda && usuario?.rol !== 'profesora' && (
        <div style={{textAlign:'center',padding:'40px',color:'var(--text3)'}}>No hay alumnos registrados</div>
      )}
    </div>
  )

  // ── FORMULARIO MULTI-STEP ──
  if (vista === 'form') {
    const esEdicion = !!form?.id
    const STEPS_NUEVO = ['Datos básicos', 'Contacto', 'Académico', ...(form?.es_menor ? ['Tutor'] : [])]
    const STEPS_EDICION = ['Datos']
    const steps = esEdicion ? STEPS_EDICION : STEPS_NUEVO
    const totalSteps = steps.length
    const isLastStep = formStep === totalSteps - 1

    const validarStep = () => {
      if (formStep === 0 && (!form?.nombre?.trim() || !form?.apellido?.trim())) {
        alert('Nombre y apellido son obligatorios'); return false
      }
      return true
    }
    const siguiente = () => { if (!validarStep()) return; if (isLastStep) guardar(); else setFormStep(s => s+1) }
    const anterior = () => { if (formStep === 0) { esEdicion ? irADetalle(form.id) : irALista() } else setFormStep(s => s-1) }

    return (
      <div className="fade-in">
        <BtnG sm onClick={anterior} style={{marginBottom:'16px'}}>← {formStep === 0 ? 'Cancelar' : 'Anterior'}</BtnG>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px'}}>
          <div style={{fontSize:'20px',fontWeight:700}}>{esEdicion ? 'Editar alumno' : `Nuevo alumno`}</div>
          {!esEdicion && (
            <div style={{display:'flex',gap:'5px',alignItems:'center'}}>
              {steps.map((_:any, i:number) => (
                <div key={i} style={{width: i===formStep?20:8, height:8, borderRadius:4, background: i<=formStep?'var(--v)':'var(--border)', transition:'all .2s'}} />
              ))}
              <span style={{fontSize:'11px',color:'var(--text3)',marginLeft:'6px'}}>{formStep+1}/{totalSteps}</span>
            </div>
          )}
        </div>
        {!esEdicion && <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:600,textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'14px'}}>{steps[formStep]}</div>}

        <Card>
          {/* STEP 0: Datos básicos */}
          {(formStep === 0) && <>
            <Row2>
              <Field2 label="Nombre *"><Input value={form?.nombre||''} onChange={(v:string)=>setForm({...form,nombre:v})} /></Field2>
              <Field2 label="Apellido *"><Input value={form?.apellido||''} onChange={(v:string)=>setForm({...form,apellido:v})} /></Field2>
            </Row2>
            <Row2>
              <Field2 label="Fecha de nacimiento">
                <input type="date" style={IS} value={form?.fecha_nacimiento||''} onChange={(e:any)=>{
                  const fn = e.target.value
                  const edad = fn ? Math.floor((Date.now() - new Date(fn).getTime()) / (365.25*24*60*60*1000)) : 0
                  const esMenorAuto = edad < 18 && edad > 0
                  setForm({...form, fecha_nacimiento:fn, edad, es_menor: esMenorAuto})
                }} />
              </Field2>
              <Field2 label="DNI alumno"><Input value={form?.dni||''} onChange={(v:string)=>setForm({...form,dni:v})} placeholder="Sin puntos..." /></Field2>
            </Row2>
            <Field2 label="Fecha de alta">
              <input type="date" style={IS} value={form?.fecha_alta||new Date().toISOString().split('T')[0]} onChange={(e:any)=>setForm({...form,fecha_alta:e.target.value})} />
            </Field2>
            {esEdicion && <>
              <Row2>
                <Field2 label="Teléfono"><Input value={form?.telefono||''} onChange={(v:string)=>setForm({...form,telefono:v})} /></Field2>
                <Field2 label="Email"><Input type="email" value={form?.email||''} onChange={(v:string)=>setForm({...form,email:v})} /></Field2>
              </Row2>
              <Row2>
                <Field2 label="Matrícula ($)"><Input type="number" value={form?.matricula||''} onChange={(v:string)=>setForm({...form,matricula:+v})} /></Field2>
                <Field2 label="Cuota mensual ($)"><Input type="number" value={form?.cuota_mensual||''} onChange={(v:string)=>setForm({...form,cuota_mensual:+v})} /></Field2>
              </Row2>
              <Row2>
                <Field2 label="Nivel"><select style={IS} value={form?.nivel||'Básico'} onChange={(e:any)=>setForm({...form,nivel:e.target.value})}>{NIVELES.map(n=><option key={n}>{n}</option>)}</select></Field2>
                <Field2 label="¿Es menor?"><select style={IS} value={form?.es_menor?'si':'no'} onChange={(e:any)=>setForm({...form,es_menor:e.target.value==='si'})}><option value="no">No</option><option value="si">Sí</option></select></Field2>
              </Row2>
              {form?.es_menor && <>
                <Row2>
                  <Field2 label="Nombre tutor"><Input value={form?.padre_nombre||''} onChange={(v:string)=>setForm({...form,padre_nombre:v})} /></Field2>
                  <Field2 label="DNI tutor"><Input value={form?.padre_dni||''} onChange={(v:string)=>setForm({...form,padre_dni:v})} /></Field2>
                </Row2>
                <Row2>
                  <Field2 label="Tel. tutor"><Input value={form?.padre_telefono||''} onChange={(v:string)=>setForm({...form,padre_telefono:v})} /></Field2>
                  <Field2 label="Email tutor"><Input value={form?.padre_email||''} onChange={(v:string)=>setForm({...form,padre_email:v})} /></Field2>
                </Row2>
              </>}
            </>}
          </>}

          {/* STEP 1 nuevo: Contacto */}
          {!esEdicion && formStep === 1 && <>
            <Row2>
              <Field2 label="Teléfono"><Input value={form?.telefono||''} onChange={(v:string)=>setForm({...form,telefono:v})} /></Field2>
              <Field2 label="Email"><Input type="email" value={form?.email||''} onChange={(v:string)=>setForm({...form,email:v})} /></Field2>
            </Row2>
            {form?.edad && form.edad > 0 && (
              <div style={{padding:'10px 14px',background: form.es_menor?'var(--amberl)':'var(--greenl)',borderRadius:'10px',fontSize:'13px',color:form.es_menor?'var(--amber)':'var(--green)',fontWeight:500,marginBottom:'8px'}}>
                {form.es_menor ? `⚠ Alumno menor de edad (${form.edad} años) — se pedirán datos del tutor` : `✓ Mayor de edad (${form.edad} años)`}
              </div>
            )}
            {!form?.fecha_nacimiento && <Field2 label="¿Es menor de edad?"><select style={IS} value={form?.es_menor?'si':'no'} onChange={(e:any)=>setForm({...form,es_menor:e.target.value==='si'})}><option value="no">No</option><option value="si">Sí</option></select></Field2>}
          </>}

          {/* STEP 2 nuevo: Académico */}
          {!esEdicion && formStep === 2 && <>
            <Row2>
              <Field2 label="Nivel"><select style={IS} value={form?.nivel||'Básico'} onChange={(e:any)=>setForm({...form,nivel:e.target.value})}>{NIVELES.map(n=><option key={n}>{n}</option>)}</select></Field2>
              <Field2 label="Cuota mensual ($)"><Input type="number" value={form?.cuota_mensual||''} onChange={(v:string)=>setForm({...form,cuota_mensual:+v})} /></Field2>
            </Row2>
            <Field2 label="Matrícula de inscripción ($)"><Input type="number" value={form?.matricula||''} onChange={(v:string)=>setForm({...form,matricula:+v})} /></Field2>
            <div style={{padding:'10px 14px',background:'var(--vl)',borderRadius:'10px',fontSize:'12px',color:'var(--text2)',marginTop:'4px'}}>
              💡 El monto de matrícula queda registrado en el perfil del alumno. Para cobrarlo, usá el módulo de Pagos → Registrar pago → tipo Matrícula.
            </div>
          </>}

          {/* STEP 3 nuevo: Tutor (solo si es menor) */}
          {!esEdicion && formStep === 3 && form?.es_menor && <>
            <Row2>
              <Field2 label="Nombre padre/madre *"><Input value={form?.padre_nombre||''} onChange={(v:string)=>setForm({...form,padre_nombre:v})} /></Field2>
              <Field2 label="DNI tutor"><Input value={form?.padre_dni||''} onChange={(v:string)=>setForm({...form,padre_dni:v})} placeholder="Sin puntos..." /></Field2>
            </Row2>
            <Row2>
              <Field2 label="Tel. contacto *"><Input value={form?.padre_telefono||''} onChange={(v:string)=>setForm({...form,padre_telefono:v})} /></Field2>
              <Field2 label="Email contacto"><Input value={form?.padre_email||''} onChange={(v:string)=>setForm({...form,padre_email:v})} /></Field2>
            </Row2>
          </>}
        </Card>

        <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
          {formStep > 0 && <BtnG style={{flex:1}} onClick={() => setFormStep(s=>s-1)}>← Anterior</BtnG>}
          <BtnP style={{flex:2}} onClick={siguiente} disabled={guardando}>
            {guardando ? 'Guardando...' : isLastStep ? (esEdicion ? 'Guardar cambios' : 'Crear alumno') : 'Siguiente →'}
          </BtnP>
        </div>
      </div>
    )
  }

  // ── DETALLE ──
  if (vista === 'detalle') {
    if (!sel) return <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
    return (
    <AlumnoDetalle
      alumno={sel}
      puedeVerPagos={puedeVerPagos}
      puedeEditar={puedeEditar}
      tab={tab}
      setTab={setTab}
      onVolver={irALista}
      onEditar={irAFormEditar}
      onEliminar={irABaja}
      confirmDelete={false}
      onCancelDelete={() => {}}
      onConfirmDelete={() => {}}
      modalPago={modalPago}
      setModalPago={setModalPago}
      pago={pago}
      setPago={setPago}
    />
  )
  }

  // ── VISTA BAJA ──
  if (vista === 'baja') {
    if (!sel) return <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
    return (
    <div className="fade-in">
      <BtnG sm onClick={() => setVista('detalle')} style={{marginBottom:'20px'}}>← Volver</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'6px'}}>Registrar baja</div>
      <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción desactiva al alumno y queda registrada en el historial de bajas.</div>

      <div style={{background:'var(--vl)',borderRadius:'16px',padding:'16px',marginBottom:'16px',display:'flex',alignItems:'center',gap:'12px'}}>
        <Av color={sel.color} size={48}>{sel.nombre[0]}{sel.apellido[0]}</Av>
        <div>
          <div style={{fontSize:'16px',fontWeight:700}}>{sel.nombre} {sel.apellido}</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>{sel.nivel} · ${sel.cuota_mensual?.toLocaleString('es-AR')}/mes</div>
        </div>
      </div>

      <Card>
        <Field2 label="Fecha de baja">
          <input style={IS} type="text" value={new Date().toLocaleDateString('es-AR')} readOnly />
        </Field2>
        <Field2 label="Motivo de la baja *">
          <select style={IS} value={motivoBaja} onChange={e => setMotivoBaja(e.target.value)}>
            <option value="">Seleccioná un motivo...</option>
            <option>Razones económicas</option>
            <option>Cambio de institución</option>
            <option>Mudanza</option>
            <option>Finalización del curso</option>
            <option>Problemas de horario</option>
            <option>Motivos personales</option>
            <option>Inasistencias reiteradas</option>
            <option>Otro</option>
          </select>
        </Field2>
        {motivoBaja === 'Otro' && (
          <Field2 label="Especificá el motivo">
            <textarea
              style={{...IS, resize:'none'}}
              rows={3}
              value={motivoLibre}
              placeholder="Describí el motivo de la baja..."
              onChange={e => setMotivoLibre(e.target.value)}
            />
          </Field2>
        )}
        <div style={{padding:'10px 12px',borderRadius:'10px',fontSize:'12.5px',color:'var(--amber)',background:'var(--amberl)',border:'1px solid #e8d080',marginTop:'4px',lineHeight:1.5}}>
          ⚠ Esta acción no se puede deshacer. El alumno quedará en el historial de bajas.
        </div>
      </Card>

      <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
        <BtnG style={{flex:1}} onClick={() => setVista('detalle')}>Cancelar</BtnG>
        <button onClick={registrarBaja} disabled={guardandoBaja || !motivoBaja || (motivoBaja==='Otro' && !motivoLibre.trim())}
          style={{flex:2,padding:'12px',background:guardandoBaja||!motivoBaja||(motivoBaja==='Otro'&&!motivoLibre.trim())?'#aaa':'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:guardandoBaja||!motivoBaja||(motivoBaja==='Otro'&&!motivoLibre.trim())?'not-allowed':'pointer'}}>
          {guardandoBaja ? 'Registrando...' : 'Confirmar baja'}
        </button>
      </div>
    </div>
  )
  }

  // ── VISTA BAJAS HISTÓRICAS ──
  if (vista === 'bajas_historicas') return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'20px',flexWrap:'wrap',gap:'8px'}}>
        <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
          <BtnG sm onClick={irALista}>← Volver</BtnG>
          <div style={{fontSize:'18px',fontWeight:700}}>Bajas históricas</div>
        </div>
        {bajas.length > 0 && (
          <button onClick={() => {
            const win = window.open('','_blank')
            if (!win) return
            win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Bajas Históricas</title>
            <style>body{font-family:sans-serif;padding:24px;font-size:13px}h1{color:#652f8d;font-size:18px;margin-bottom:4px}
            .sub{color:#9b8eaa;font-size:12px;margin-bottom:20px}
            table{width:100%;border-collapse:collapse}th{border-bottom:2px solid #652f8d;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#652f8d;letter-spacing:.05em}
            td{padding:10px 8px;border-bottom:1px solid #f0edf5;font-size:13px}
            .logo{font-size:18px;font-weight:700;margin-bottom:4px}.logo span{color:#652f8d}
            .fecha{color:#9b8eaa;font-size:12px;margin-bottom:20px;text-align:right}
            </style></head><body>
            <div style="display:flex;justify-content:space-between;align-items:flex-start;border-bottom:2px solid #652f8d;padding-bottom:14px;margin-bottom:20px">
              <div class="logo"><span>Next</span> Ezeiza</div>
              <div class="fecha">Generado: ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
            </div>
            <h1>Bajas Históricas</h1>
            <div class="sub">${bajas.length} baja${bajas.length!==1?'s':''} registrada${bajas.length!==1?'s':''}</div>
            <table>
              <tr><th>Fecha de baja</th><th>Alumno</th><th>Curso</th><th>Nivel</th><th>Cuota</th><th>Motivo</th></tr>
              ${bajas.map(b=>`<tr>
                <td>${b.fecha_baja ? b.fecha_baja.split("-").reverse().join("/") : "—"}</td>
                <td>${b.alumno_nombre} ${b.alumno_apellido}</td>
                <td>${b.curso_nombre||'—'}</td>
                <td>${b.nivel||'—'}</td>
                <td>$${b.cuota_mensual?.toLocaleString('es-AR')||'—'}</td>
                <td>${b.motivo}</td>
              </tr>`).join('')}
            </table>
            <script>window.onload=()=>window.print()<\/script></body></html>`)
            win.document.close()
          }} style={{display:'flex',alignItems:'center',gap:'6px',padding:'9px 16px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            Exportar PDF
          </button>
        )}
      </div>

      {loadingBajas && <Loader />}

      {!loadingBajas && bajas.length === 0 && (
        <div style={{textAlign:'center',padding:'48px 24px',color:'var(--text3)',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px'}}>
          <div style={{fontSize:'36px',marginBottom:'10px'}}>📋</div>
          <div style={{fontSize:'15px',fontWeight:600,color:'var(--text2)',marginBottom:'4px'}}>Sin bajas registradas</div>
          <div style={{fontSize:'13px'}}>Cuando se registre la baja de un alumno va a aparecer acá.</div>
        </div>
      )}

      {!loadingBajas && bajas.map(b => (
        <div key={b.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px',marginBottom:'10px'}}>
          <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',marginBottom:'10px'}}>
            <div>
              <div style={{fontSize:'15px',fontWeight:700}}>{b.alumno_nombre} {b.alumno_apellido}</div>
              <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{b.curso_nombre||'—'} · {b.nivel||'—'}</div>
            </div>
            <div style={{textAlign:'right',flexShrink:0}}>
              <div style={{fontSize:'12px',fontWeight:600,color:'var(--red)',padding:'3px 10px',background:'var(--redl)',borderRadius:'20px',border:'1px solid #f5c5c5'}}>
                Baja {fmtFecha(b.fecha_baja)}
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'8px',marginTop:'8px'}}>
            <div style={{padding:'8px 10px',background:'var(--bg)',borderRadius:'8px'}}>
              <div style={{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'2px'}}>Motivo</div>
              <div style={{fontSize:'13px',color:'var(--text)'}}>{b.motivo}</div>
            </div>
            <div style={{padding:'8px 10px',background:'var(--bg)',borderRadius:'8px'}}>
              <div style={{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'2px'}}>Cuota al momento</div>
              <div style={{fontSize:'13px',color:'var(--text)',fontWeight:600}}>${b.cuota_mensual?.toLocaleString('es-AR')||'—'}</div>
            </div>
          </div>
        </div>
      ))}
    </div>
  )

  // ── VISTA RENOVACIÓN DE MATRÍCULA ──
  if (vista === 'renovacion_matricula') {
    const MESES_LISTA2 = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
    const alumnosActivos = alumnos.filter((a:any) => (a as any).activo !== false)
    const todosSeleccionados = alumnosActivos.length > 0 && renovacionSeleccionados.size === alumnosActivos.length
    const toggleTodos = () => {
      if (todosSeleccionados) setRenovacionSeleccionados(new Set())
      else setRenovacionSeleccionados(new Set(alumnosActivos.map(a => a.id)))
    }

    const aplicarRenovacion = async () => {
      const monto = parseFloat(renovacionMonto)
      if (isNaN(monto) || monto <= 0) { alert('Ingresá un monto válido'); return }
      if (renovacionSeleccionados.size === 0) { alert('Seleccioná al menos un alumno'); return }
      const mesNombre = MESES_LISTA2[renovacionMes]
      if (!window.confirm(`¿Registrar matrícula de $${monto.toLocaleString('es-AR')} a ${renovacionSeleccionados.size} alumno${renovacionSeleccionados.size!==1?'s':''}?`)) return
      setRenovacionAplicando(true)
      let ok = 0; let err = 0
      const fechaHoy = new Date().toISOString().split('T')[0]
      await Promise.all([...renovacionSeleccionados].map(async (alumno_id) => {
        try {
          const res = await fetch('/api/registrar-pago', {
            method: 'POST', headers: apiHeaders(),
            body: JSON.stringify({ alumno_id, mes: mesNombre, anio: renovacionAnio, monto, metodo: renovacionMetodo, fecha_pago: fechaHoy, tipo: 'matricula', observaciones: 'Renovación matrícula anual' })
          })
          if (res.ok) ok++; else err++
        } catch { err++ }
      }))
      setRenovacionResultado({ ok, err })
      setRenovacionAplicando(false)
      showToast(`✓ ${ok} matrículas registradas`)
      logActivity('Renovación matrícula masiva', 'Alumnos', `${ok} alumnos · $${monto.toLocaleString('es-AR')} · ${mesNombre} ${renovacionAnio}`)
    }

    return (
      <div className="fade-in">
        <BtnG sm onClick={irALista} style={{marginBottom:'20px'}}>← Volver</BtnG>
        <div style={{fontSize:'20px',fontWeight:700,marginBottom:'6px'}}>Renovación de matrícula</div>
        <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'20px'}}>Registrá la matrícula del ciclo lectivo a múltiples alumnos a la vez.</div>

        {renovacionResultado ? (
          <div style={{padding:'24px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',textAlign:'center'}}>
            <div style={{fontSize:'40px',marginBottom:'12px'}}>✓</div>
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'4px',color:'var(--green)'}}>{renovacionResultado.ok} matrículas registradas</div>
            {renovacionResultado.err > 0 && <div style={{fontSize:'13px',color:'var(--red)',marginBottom:'8px'}}>{renovacionResultado.err} errores</div>}
            <div style={{display:'flex',gap:'10px',justifyContent:'center',marginTop:'16px'}}>
              <BtnG sm onClick={() => setRenovacionResultado(null)}>Otra renovación</BtnG>
              <BtnP sm onClick={irALista}>Volver a alumnos</BtnP>
            </div>
          </div>
        ) : (
          <>
            <Card>
              <SL style={{marginBottom:'12px'}}>Configuración del pago</SL>
              <Row2>
                <Field2 label="Mes">
                  <select style={IS} value={renovacionMes} onChange={e => setRenovacionMes(+e.target.value)}>
                    {MESES_LISTA2.map((m,i) => <option key={m} value={i}>{m}</option>)}
                  </select>
                </Field2>
                <Field2 label="Año">
                  <input type="number" style={IS} value={renovacionAnio} onChange={e => setRenovacionAnio(+e.target.value)} min={2020} max={2035} />
                </Field2>
              </Row2>
              <Row2>
                <Field2 label="Monto matrícula ($)"><Input type="number" value={renovacionMonto} onChange={(v:string)=>setRenovacionMonto(v)} placeholder="Ej: 50000" /></Field2>
                <Field2 label="Método">
                  <select style={IS} value={renovacionMetodo} onChange={e => setRenovacionMetodo(e.target.value)}>
                    {['Efectivo','Transferencia','Tarjeta','MercadoPago','Otro'].map(m=><option key={m}>{m}</option>)}
                  </select>
                </Field2>
              </Row2>
            </Card>

            <Card>
              <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'12px'}}>
                <SL>Alumnos ({renovacionSeleccionados.size} seleccionados)</SL>
                <button onClick={toggleTodos} style={{fontSize:'12px',fontWeight:600,color:'var(--v)',background:'none',border:'none',cursor:'pointer'}}>
                  {todosSeleccionados ? 'Deseleccionar todos' : 'Seleccionar todos'}
                </button>
              </div>
              <div style={{maxHeight:'340px',overflowY:'auto',display:'flex',flexDirection:'column',gap:'6px'}}>
                {alumnosActivos.map((a:any) => {
                  const sel = renovacionSeleccionados.has(a.id)
                  return (
                    <div key={a.id} onClick={() => setRenovacionSeleccionados(prev => { const n = new Set(prev); sel ? n.delete(a.id) : n.add(a.id); return n })}
                      style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'12px',border:`1.5px solid ${sel?'var(--v)':'var(--border)'}`,background:sel?'var(--vl)':'var(--white)',cursor:'pointer',transition:'all .15s'}}>
                      <div style={{width:20,height:20,borderRadius:6,border:`2px solid ${sel?'var(--v)':'var(--border)'}`,background:sel?'var(--v)':'transparent',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                        {sel && <span style={{color:'#fff',fontSize:'12px',lineHeight:1}}>✓</span>}
                      </div>
                      <Av color={a.color} size={34}>{a.nombre[0]}{a.apellido[0]}</Av>
                      <div style={{flex:1,minWidth:0}}>
                        <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                        <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{a.nivel}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </Card>

            {renovacionSeleccionados.size > 0 && renovacionMonto && (
              <div style={{padding:'12px 16px',background:'var(--vl)',borderRadius:'12px',marginBottom:'14px',fontSize:'13px',color:'var(--v)',fontWeight:500}}>
                Total a registrar: <strong>${(parseFloat(renovacionMonto)||0 * renovacionSeleccionados.size).toLocaleString('es-AR')}</strong> · {renovacionSeleccionados.size} alumno{renovacionSeleccionados.size!==1?'s':''}
              </div>
            )}

            <BtnP onClick={aplicarRenovacion} disabled={renovacionAplicando || renovacionSeleccionados.size === 0 || !renovacionMonto} style={{width:'100%'}}>
              {renovacionAplicando ? 'Registrando...' : `Registrar ${renovacionSeleccionados.size} matrícula${renovacionSeleccionados.size!==1?'s':''}`}
            </BtnP>
          </>
        )}
      </div>
    )
  }


  return null
}

// Componente inline para editar fecha de nacimiento (disponible para profesoras)
function FechaNacimientoField({ alumnoId, fechaActual, puedeEditar, onActualizar }: {
  alumnoId: string; fechaActual: string; puedeEditar: boolean; onActualizar: (f: string) => void
}) {
  const [editando, setEditando] = useState(false)
  const [valor, setValor] = useState(fechaActual)
  const [guardando, setGuardando] = useState(false)

  const guardar = async (nuevaFecha: string) => {
    if (nuevaFecha === fechaActual) { setEditando(false); return }
    setGuardando(true)
    try {
      await fetch('/api/actualizar-alumno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: alumnoId, datos: { fecha_nacimiento: nuevaFecha || null } })
      })
      onActualizar(nuevaFecha)
    } catch(e) { console.error(e) }
    setGuardando(false)
    setEditando(false)
  }

  const IS_DATE = { padding:'8px 11px', border:'1.5px solid var(--v)', borderRadius:'10px', fontSize:'13px', background:'var(--white)', outline:'none', fontFamily:'inherit' } as const

  return (
    <div style={{marginBottom:'11px'}}>
      <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>
        Fecha de nacimiento
      </div>
      {!editando ? (
        <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 11px',border:'1.5px solid var(--border)',borderRadius:'10px',background:'var(--bg)'}}>
          <span style={{flex:1,fontSize:'13px',color:'var(--text2)'}}>
            {valor ? new Date(valor+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'}) : '—'}
          </span>
          {puedeEditar && (
            <button onClick={() => setEditando(true)}
              style={{padding:'3px 10px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'7px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
              {valor ? 'Editar' : '+ Cargar'}
            </button>
          )}
        </div>
      ) : (
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          <input type="date" value={valor} onChange={e => setValor(e.target.value)} style={IS_DATE} autoFocus />
          <button onClick={() => guardar(valor)} disabled={guardando}
            style={{padding:'7px 12px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
            {guardando ? '...' : '✓'}
          </button>
          <button onClick={() => { setValor(fechaActual); setEditando(false) }}
            style={{padding:'7px 10px',background:'transparent',color:'var(--text3)',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'12px',cursor:'pointer'}}>
            ✕
          </button>
        </div>
      )}
    </div>
  )
}

function AlumnoDetalle({ alumno:a, puedeVerPagos, puedeEditar, tab, setTab, onVolver, onEditar, onEliminar, confirmDelete, onCancelDelete, onConfirmDelete, modalPago, setModalPago, pago, setPago }: any) {
  const { usuario } = useAuth()
  const { pagos: _pagos, registrar } = usePagos(a.id)
  const [pagos, setPagosLocal] = useState<any[]>([])
  useEffect(() => { setPagosLocal(_pagos) }, [_pagos])
  useEffect(() => {
    const handler = async (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.alumno_id !== a.id) return
      const sb = createClient()
      const { data } = await sb.from('pagos_alumnos').select('*').eq('alumno_id', a.id).order('created_at', { ascending: false })
      if (data) setPagosLocal(data)
    }
    window.addEventListener('recargar-pagos', handler)
    return () => window.removeEventListener('recargar-pagos', handler)
  }, [a.id])
  const { historial } = useHistorialCursos(a.id)
  const { historial: histCuotas } = useCuotasHistorial(a.id)
  const [guardandoPago, setGuardandoPago] = useState(false)
  const [cursoActual, setCursoActual] = useState<any>(null)
  const { cursos: todosLosCursos } = useCursos()
  const [modalAsignarCurso, setModalAsignarCurso] = useState(false)
  const [asignando, setAsignando] = useState(false)
  const [busqCurso, setBusqCurso] = useState('')
  const col = NIVEL_COL[a.nivel]

  useEffect(() => {
    const sb = createClient()
    sb.from('cursos_alumnos')
      .select('curso_id, cursos(id, nombre, nivel, dias, hora_inicio, hora_fin)')
      .eq('alumno_id', a.id)
      .then(({ data, error }) => {
        if (error) { setCursoActual(null); return }
        if (data && data.length > 0) {
          const cursoData = (data[0] as any).cursos
          if (cursoData) {
            setCursoActual(cursoData)
          } else {
            const cursoId = data[0].curso_id
            const cursoDelStore = todosLosCursos.find((c:any) => c.id === cursoId)
            setCursoActual(cursoDelStore || null)
          }
        } else {
          setCursoActual(null)
        }
      }, () => setCursoActual(null))
  }, [a.id, todosLosCursos.length])

  const asignarCurso = async (cursoId: string) => {
    setAsignando(true)
    const nuevo = todosLosCursos.find((c:any) => c.id === cursoId)
    // Actualizar UI inmediatamente (optimistic)
    setCursoActual(nuevo || { id: cursoId })
    setModalAsignarCurso(false)
    setAsignando(false)
    // Guardar en DB en background - primero borrar curso anterior, luego insertar nuevo
    const sb = createClient()
    ;(async () => {
      try {
        const sb2 = createClient()
        const { error: delErr } = await sb2.from('cursos_alumnos').delete().eq('alumno_id', a.id)
        if (delErr) { console.error('[asignarCurso] delete:', delErr.message); return }
        const { error: insErr } = await sb2.from('cursos_alumnos').insert({
          curso_id: cursoId,
          alumno_id: a.id,
          fecha_ingreso: new Date().toISOString().split('T')[0]
        })
        if (insErr) {
          console.error('[asignarCurso] insert:', insErr.message)
          showToast('Error al asignar el curso. Recargá y verificá.', 'error')
          return
        }
        window.dispatchEvent(new CustomEvent('curso-alumno-updated'))
      } catch(e: any) { console.error('[asignarCurso]', e?.message) }
    })()
  }

  const [ultimoPago, setUltimoPago] = useState<any>(null)
  const [modalRecibo, setModalRecibo] = useState(false)
  const [pagoAEliminar, setPagoAEliminar] = useState<any>(null)
  const [eliminandoPago, setEliminandoPago] = useState(false)

  // Normalizar teléfono al formato wa.me (+54 9 11 XXXXXXXX)
  const normalizarTel = (tel: string) => {
    if (!tel) return ''
    let t = tel.replace(/\D/g, '')
    // Quitar 0 inicial de código de área
    if (t.startsWith('0')) t = t.slice(1)
    // Quitar 54 si ya lo tiene
    if (t.startsWith('54')) t = t.slice(2)
    // Quitar 9 de celular si ya lo tiene al inicio
    if (t.startsWith('9') && t.length > 10) t = t.slice(1)
    return '549' + t
  }

  const abrirWS = (tel: string, msg: string) => {
    const num = normalizarTel(tel)
    if (!num || num.length < 12) { alert('No hay teléfono cargado para este contacto'); return }
    const url = `https://wa.me/${num}?text=${encodeURIComponent(msg)}`
    window.open(url, '_blank')
  }

  const msgCuotaPendiente = () => {
    const contacto = a.es_menor ? a.padre_nombre || 'familia' : a.nombre
    const tel = a.es_menor ? a.padre_telefono : a.telefono
    const msg = `Hola ${contacto}! 👋 Te escribimos de *Next Ezeiza English Institute*.

Te recordamos que la cuota de *${pago.mes} ${pago.anio}* de *${a.nombre} ${a.apellido}* se encuentra pendiente de pago.

💰 Monto: *$${(a.cuota_mensual||0).toLocaleString('es-AR')}*
📚 Curso: *${cursoActual?.nombre || '—'}*

Podés abonar en el instituto o por transferencia. Ante cualquier consulta estamos a disposición. ¡Muchas gracias! 🙏`
    abrirWS(tel, msg)
  }

  const eliminarPago = async () => {
    if (!pagoAEliminar) return
    setEliminandoPago(true)
    try {
      const res = await fetch('/api/registrar-pago', {
        method: 'DELETE',
        headers: apiHeaders(),
        body: JSON.stringify({ id: pagoAEliminar.id })
      })
      const json = await res.json()
      if (json.ok) {
        showToast('Pago eliminado')
        logActivity('Eliminó pago', 'Pagos', `${a.nombre} ${a.apellido} — ${pagoAEliminar.mes} ${pagoAEliminar.anio} — $${pagoAEliminar.monto}`)
        window.dispatchEvent(new CustomEvent('pago-registrado', { detail: { alumno_id: a.id } }))
      } else {
        showToast('Error al eliminar: ' + (json.error || 'Error desconocido'), 'error')
      }
    } catch (e: any) {
      showToast('Error al eliminar pago', 'error')
    }
    setEliminandoPago(false)
    setPagoAEliminar(null)
  }

  const generarRecibo = (p: any) => {
    const contacto = a.es_menor ? a.padre_nombre || a.nombre : a.nombre
    const tel = a.es_menor ? a.padre_telefono : a.telefono
    const fecha = p.fecha_pago ? new Date(p.fecha_pago+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'}) : new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})
    const monto = (p.monto||0).toLocaleString('es-AR')

    // Si el pago tiene id de DB → abrir URL pública y ofrecer WS
    if (p.id) {
      const urlRecibo = `${window.location.origin}/api/recibo/${p.id}`
      window.open(urlRecibo, '_blank')
      if (tel) {
        const msgWS = `✅ *Recibo de pago — Next Ezeiza*\n\nHola ${contacto}! Confirmamos el pago de la cuota de *${p.mes} ${p.anio}* de *${a.nombre} ${a.apellido}*.\n\n💰 Monto: *$${monto}*\n📅 Fecha: ${fecha}\n💳 Método: ${p.metodo||'Efectivo'}\n\n📄 Tu recibo: ${urlRecibo}\n\n¡Gracias! 🙌`
        setUltimoPago({ tel, msg: msgWS, urlRecibo })
        setModalRecibo(true)
      }
      return
    }

    // Fallback: pago sin id todavía → HTML local con print automático
    const num = Math.floor(Math.random()*900000)+100000
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Recibo ${a.nombre} ${a.apellido}</title>
    <style>body{font-family:Arial,sans-serif;padding:0;margin:0;background:#f5f0fa}.wrap{max-width:400px;margin:20px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(101,47,141,.15)}.hdr{background:#652f8d;padding:24px;color:white}.logo{font-size:20px;font-weight:900}.logo span{opacity:.7;font-weight:400}.rec-num{font-size:12px;opacity:.7;margin-top:2px}.monto-sec{background:#f2e8f9;padding:20px;text-align:center;border-bottom:2px dashed #d4a8e8}.monto-lab{font-size:11px;color:#9b8eaa;font-weight:700;text-transform:uppercase;letter-spacing:.06em;margin-bottom:6px}.monto{font-size:44px;font-weight:900;color:#652f8d;letter-spacing:-2px}.monto-mes{font-size:13px;color:#9b8eaa;margin-top:4px}.body{padding:20px}.fila{display:flex;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0edf5}.fila:last-child{border-bottom:none}.fila-lab{font-size:11px;color:#9b8eaa;font-weight:700;text-transform:uppercase;letter-spacing:.04em}.fila-val{font-size:13px;color:#1a1020;font-weight:700;text-align:right;max-width:60%}.badge{background:#e6f4ec;color:#2d7a4f;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700}.footer{background:#faf7fd;padding:14px 20px;text-align:center;font-size:11px;color:#9b8eaa}@media print{body{background:white}.wrap{box-shadow:none;margin:0;border-radius:0}}</style></head><body>
    <div class="wrap"><div class="hdr"><div class="logo">${a.instituto_nombre || 'Instituto'}</div><div class="rec-num">Comprobante #${num} · ${fecha}</div></div>
    <div class="monto-sec"><div class="monto-lab">Total abonado</div><div class="monto">$${monto}</div><div class="monto-mes">Cuota ${p.mes} ${p.anio}</div></div>
    <div class="body"><div class="fila"><div class="fila-lab">Alumno</div><div class="fila-val">${a.nombre} ${a.apellido}</div></div><div class="fila"><div class="fila-lab">Método</div><div class="fila-val">${p.metodo||'Efectivo'}</div></div><div class="fila"><div class="fila-lab">Fecha</div><div class="fila-val">${fecha}</div></div><div class="fila"><div class="fila-lab">Estado</div><div class="fila-val"><span class="badge">✓ Pagado</span></div></div></div>
    <div class="footer">${a.instituto_nombre || 'Instituto de Inglés'}</div></div>
    <script>setTimeout(function(){window.print()},400)</script></body></html>`
    const blob = new Blob([html], {type:'text/html;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
    if (tel) {
      const msgWS = `✅ *Recibo de pago — ${a.instituto_nombre || 'Instituto de Inglés'}*\n\nHola ${contacto}! Confirmamos el pago de la cuota de *${p.mes} ${p.anio}* de *${a.nombre} ${a.apellido}*.\n\n💰 Monto: *$${monto}*\n📅 Fecha: ${fecha}\n💳 Método: ${p.metodo||'Efectivo'}\n\n¡Gracias! 🙌`
      setUltimoPago({ tel, msg: msgWS, urlRecibo: null })
      setModalRecibo(true)
    }
  }
  const guardarPago = async () => {
    setGuardandoPago(true)
    // registrar() devuelve el row de DB con el id real asignado por Supabase
    const resultado = await registrar({ ...pago, alumno_id: a.id })
    setGuardandoPago(false)
    setModalPago(false)
    if (resultado) {
      logActivity('Registró pago', 'Pagos', `${a.nombre} ${a.apellido} — ${pago.mes} ${pago.anio} — $${pago.monto}`)
      window.dispatchEvent(new CustomEvent('pago-registrado', { detail: { alumno_id: a.id, nombre: `${a.nombre} ${a.apellido}` } }))
      // Pasar resultado (con .id de DB) para que generarRecibo use la URL pública /api/recibo/[id]
      generarRecibo(resultado)
    }
  }

  const cursosFiltrados = busqCurso
    ? todosLosCursos.filter(c => c.nombre.toLowerCase().includes(busqCurso.toLowerCase()))
    : todosLosCursos

  return (
    <div className="fade-in">
      <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
        <BtnG sm onClick={onVolver}>← Volver</BtnG>
        {puedeEditar && <BtnP sm onClick={onEditar}>Editar</BtnP>}
        {puedeEditar && <BtnDanger sm onClick={onEliminar}>Dar de baja</BtnDanger>}
      </div>

      <div style={{background:'var(--vl)',borderRadius:'16px',padding:'20px',marginBottom:'16px'}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:'14px',marginBottom:'14px'}}>
          <Av color={a.color} size={64}>{a.nombre[0]}{a.apellido[0]}</Av>
          <div style={{flex:1}}>
            <div style={{fontSize:'20px',fontWeight:700}}>{a.nombre} {a.apellido}</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'3px'}}>{a.edad} años{a.telefono?' · '+a.telefono:''}</div>
            <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'8px'}}>
              <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:col?.bg,color:col?.text}}>{a.nivel}</span>
              {a.es_menor && <Badge cls="b-blue">Menor</Badge>}
              {cursoActual
                ? <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--greenl)',color:'var(--green)'}}>{cursoActual.nombre}</span>
                : <button onClick={() => setModalAsignarCurso(true)} style={{padding:'4px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)',border:'1px solid #e8d080',cursor:'pointer'}}>⚠ Sin curso asignado</button>
              }
            </div>
          </div>
        </div>
        {puedeVerPagos && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1px',background:'var(--border)',borderRadius:'12px',overflow:'hidden'}}>
            <Kpi val={`$${Math.round(pagos.reduce((s:number,p:any)=>s+p.monto,0)/1000)}k`} label="Pagado" color="var(--v)" />
            <Kpi val={pagos.length} label="Pagos" />
            <Kpi val={`$${a.cuota_mensual?.toLocaleString('es-AR')}`} label="Cuota" color="var(--v)" />
          </div>
        )}
      </div>

      <div style={{display:'flex',gap:'6px',marginBottom:'18px',overflowX:'auto'}}>
        <TabBtn active={tab==='datos'} onClick={() => setTab('datos')}>Datos</TabBtn>
        {puedeVerPagos && <TabBtn active={tab==='pagos'} onClick={() => setTab('pagos')}>Pagos ({pagos.length})</TabBtn>}
        <TabBtn active={tab==='progreso'} onClick={() => setTab('progreso')}>Progreso</TabBtn>
        <TabBtn active={tab==='notas'} onClick={() => setTab('notas')}>Notas internas</TabBtn>
      </div>

      {tab === 'datos' && <Card>
        <FieldRO label="Nombre" value={`${a.nombre} ${a.apellido}`} />
        {a.dni && <FieldRO label="DNI" value={a.dni} />}
        <FechaNacimientoField
          alumnoId={a.id}
          fechaActual={a.fecha_nacimiento || ''}
          puedeEditar={puedeEditar || usuario?.rol === 'profesora'}
          onActualizar={(fecha: string) => {
            // Actualizar localmente si hay función disponible
          }}
        />
        <FieldRO label="Edad" value={a.edad ? `${a.edad} años` : '—'} />
        {a.fecha_alta && <FieldRO label="Alumno activo desde" value={new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})} />}
        <FieldRO label="Teléfono" value={a.telefono||'—'} />
        <FieldRO label="Email" value={a.email||'—'} />
        <FieldRO label="Cuota mensual" value={`$${a.cuota_mensual?.toLocaleString('es-AR')}`} />

        {/* CURSO */}
        <div style={{marginBottom:'11px'}}>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Curso asignado</div>
          {cursoActual ? (
            <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',border:'1.5px solid var(--border)',borderRadius:'10px',background:'var(--bg)'}}>
              <div style={{flex:1}}>
                <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{cursoActual.nombre}</div>
                <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{cursoActual.dias} · {cursoActual.hora_inicio?.slice(0,5)}–{cursoActual.hora_fin?.slice(0,5)}</div>
              </div>
              {puedeEditar && <button onClick={() => setModalAsignarCurso(true)} style={{padding:'5px 10px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>Cambiar</button>}
            </div>
          ) : (
            <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',border:'1.5px solid #e8d080',borderRadius:'10px',background:'var(--amberl)'}}>
              <div style={{flex:1,fontSize:'13px',color:'var(--amber)',fontWeight:500}}>⚠ Sin curso asignado</div>
              {puedeEditar && <button onClick={() => setModalAsignarCurso(true)} style={{padding:'5px 12px',background:'var(--amber)',color:'#fff',border:'none',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>Asignar</button>}
            </div>
          )}
        </div>

        {a.es_menor && a.padre_nombre && (
          <div style={{background:'var(--vl)',borderRadius:'12px',padding:'14px',marginTop:'10px'}}>
            <SL style={{marginBottom:'8px'}}>Contacto padre/madre</SL>
            <div style={{fontSize:'14px',fontWeight:600}}>{a.padre_nombre}</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'3px'}}>{a.padre_telefono} · {a.padre_email}</div>
            {a.padre_dni && <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'3px'}}>DNI: {a.padre_dni}</div>}
          </div>
        )}

        {historial.length > 0 && (
          <div style={{marginTop:'14px'}}>
            <SL style={{marginBottom:'8px'}}>Historial de cursos</SL>
            {historial.map((h:any) => (
              <div key={h.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12.5px'}}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M5 10h10M10 5l5 5-5 5"/></svg>
                <span style={{color:'var(--text2)'}}>{h.curso_anterior_nombre}</span>
                <span style={{color:'var(--text3)'}}>→</span>
                <span style={{fontWeight:600,color:'var(--v)'}}>{h.curso_nuevo_nombre}</span>
                <span style={{marginLeft:'auto',color:'var(--text3)',fontSize:'11px'}}>{fmtFecha(h.fecha)}</span>
              </div>
            ))}
          </div>
        )}

        {histCuotas.length > 0 && (
          <div style={{marginTop:'14px'}}>
            <SL style={{marginBottom:'8px'}}>Historial de cuotas</SL>
            {histCuotas.map((h:any) => (
              <div key={h.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12.5px'}}>
                <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M12 2H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/></svg>
                <span style={{color:'var(--text2)'}}>${h.cuota_anterior?.toLocaleString('es-AR')}</span>
                <span style={{color:'var(--text3)'}}>→</span>
                <span style={{fontWeight:600,color:'var(--green)'}}>${h.cuota_nueva?.toLocaleString('es-AR')}</span>
                <span style={{marginLeft:'auto',color:'var(--text3)',fontSize:'11px'}}>{fmtFecha(h.vigente_desde)}</span>
              </div>
            ))}
          </div>
        )}
      </Card>}

      {tab === 'notas' && <NotasInternaTab alumnoId={a.id} autor={usuario?.nombre || 'Sistema'} />}

      {tab === 'pagos' && puedeVerPagos && <Card>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
          <SL>Historial de pagos</SL>
          <BtnP sm onClick={() => setModalPago(true)}>+ Registrar pago</BtnP>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(12,1fr)',gap:'3px',marginBottom:'14px'}}>
          {MESES.map((m,i) => {
            const p = pagos.find((x:any) => x.mes === m && x.anio === new Date().getFullYear())
            const futuro = i > new Date().getMonth()
            const col = futuro?'var(--border)':!p?'var(--redl)':p.monto>=a.cuota_mensual?'var(--greenl)':'var(--amberl)'
            return <div key={m} style={{height:'18px',borderRadius:'3px',background:col}} title={m} />
          })}
        </div>
        {pagos.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--text3)'}}>Sin pagos registrados</div>}
        {[...pagos].map((p:any) => {
          const ok = p.monto >= a.cuota_mensual
          const parc = p.monto > 0 && p.monto < a.cuota_mensual
          return (
            <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:'14px',fontWeight:600}}>{p.mes} {p.anio}</div>
                <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{p.metodo} · {fmtFecha(p.fecha_pago)}</div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'15px',fontWeight:700}}>${p.monto?.toLocaleString('es-AR')}</div>
                  <Badge cls={ok?'b-green':parc?'b-amber':'b-red'} style={{marginTop:'3px'}}>{ok?'Completo':parc?'Parcial':'Pendiente'}</Badge>
                </div>
                <button onClick={() => generarRecibo(p)} style={{padding:'7px 10px',background:'var(--vl)',color:'var(--v)',border:'none',borderRadius:'9px',fontSize:'11px',fontWeight:700,cursor:'pointer',flexShrink:0}}>
                  Recibo
                </button>
                {puedeEditar && (
                  <button onClick={() => setPagoAEliminar(p)}
                    style={{padding:'7px 8px',background:'var(--redl)',color:'var(--red)',border:'none',borderRadius:'9px',fontSize:'11px',fontWeight:700,cursor:'pointer',flexShrink:0}}>
                    ✕
                  </button>
                )}
              </div>
            </div>
          )
        })}
      </Card>}

      {pagoAEliminar && (
        <ModalSheet title="¿Eliminar pago?" onClose={() => setPagoAEliminar(null)}>
          <div style={{padding:'8px 0 16px'}}>
            <div style={{fontSize:'14px',color:'var(--text)',fontWeight:600,marginBottom:'6px'}}>
              {pagoAEliminar.mes} {pagoAEliminar.anio} · ${pagoAEliminar.monto?.toLocaleString('es-AR')}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'4px'}}>
              {pagoAEliminar.metodo} · {fmtFecha(pagoAEliminar.fecha_pago)}
            </div>
            {pagoAEliminar.observaciones && (
              <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'4px'}}>{pagoAEliminar.observaciones}</div>
            )}
            <div style={{marginTop:'12px',padding:'10px 12px',background:'var(--redl)',borderRadius:'10px',fontSize:'12px',color:'var(--red)',fontWeight:500}}>
              Esta acción no se puede deshacer. El pago será eliminado permanentemente.
            </div>
          </div>
          <div style={{display:'flex',gap:'10px'}}>
            <BtnG style={{flex:1}} onClick={() => setPagoAEliminar(null)}>Cancelar</BtnG>
            <button onClick={eliminarPago} disabled={eliminandoPago}
              style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:eliminandoPago?'not-allowed':'pointer'}}>
              {eliminandoPago ? 'Eliminando...' : 'Sí, eliminar pago'}
            </button>
          </div>
        </ModalSheet>
      )}

      {confirmDelete && <ModalSheet title="¿Eliminar alumno?" onClose={onCancelDelete}>
        <p style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción desactiva al alumno del sistema.</p>
        <div style={{display:'flex',gap:'10px'}}>
          <BtnG style={{flex:1}} onClick={onCancelDelete}>Cancelar</BtnG>
          <button onClick={onConfirmDelete} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
        </div>
      </ModalSheet>}

      {modalAsignarCurso && <ModalSheet title="Asignar curso" onClose={() => setModalAsignarCurso(false)}>
        <div style={{position:'relative',marginBottom:'12px'}}>
          <input type="text" value={busqCurso} onChange={e=>setBusqCurso(e.target.value)} placeholder="Buscar curso..."
            style={{width:'100%',padding:'10px 12px 10px 38px',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontFamily:'Inter,sans-serif',outline:'none',background:'var(--white)',color:'var(--text)'}} autoFocus />
          <svg style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',width:'16px',height:'16px'}} viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
        </div>
        <div style={{maxHeight:'360px',overflowY:'auto'}}>
          {cursosFiltrados.map((c:any) => {
            const esCurrent = cursoActual?.id === c.id
            return (
              <div key={c.id} onClick={() => !asignando && asignarCurso(c.id)}
                style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 12px',border:'1.5px solid',borderColor:esCurrent?'var(--v)':'var(--border)',borderRadius:'12px',marginBottom:'7px',cursor:asignando?'not-allowed':'pointer',background:esCurrent?'var(--vl)':'var(--white)'}}
                onMouseEnter={e=>{if(!esCurrent)e.currentTarget.style.borderColor='var(--v)'}}
                onMouseLeave={e=>{if(!esCurrent)e.currentTarget.style.borderColor='var(--border)'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'14px',fontWeight:600,color:esCurrent?'var(--v)':'var(--text)'}}>{c.nombre} {esCurrent&&'✓'}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{c.nivel} · {c.dias||'—'} · {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
                </div>
              </div>
            )
          })}
          {cursosFiltrados.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--text3)'}}>No se encontraron cursos</div>}
        </div>
        {asignando && <div style={{textAlign:'center',padding:'12px',color:'var(--v)',fontSize:'13px',fontWeight:600}}>Asignando...</div>}
      </ModalSheet>}

      {tab === 'progreso' && (
        <div>
          {/* Progreso académico del alumno */}
          <Card>
            <SL style={{marginBottom:'12px'}}>Nivel actual</SL>
            <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px',background:'var(--vl)',borderRadius:'12px',marginBottom:'16px'}}>
              <div style={{width:44,height:44,borderRadius:13,background:NIVEL_COL[a.nivel]?.bg||'var(--vl)',display:'flex',alignItems:'center',justifyContent:'center'}}>
                <span style={{fontSize:'11px',fontWeight:700,color:NIVEL_COL[a.nivel]?.text||'var(--v)'}}>{(a.nivel||'').slice(0,3).toUpperCase()}</span>
              </div>
              <div>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>{a.nivel||'Sin nivel'}</div>
                <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                  {a.fecha_alta ? `Desde ${new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'})}` : '—'}
                </div>
              </div>
            </div>

            {/* Historial de cursos como timeline */}
            {historial.length > 0 && <>
              <SL style={{marginBottom:'10px'}}>Historial de cursos</SL>
              <div style={{position:'relative',paddingLeft:'20px'}}>
                <div style={{position:'absolute',left:'7px',top:0,bottom:0,width:'1px',background:'var(--border)'}} />
                {historial.map((h:any,i:number) => (
                  <div key={h.id} style={{position:'relative',marginBottom:'14px'}}>
                    <div style={{position:'absolute',left:'-17px',top:'4px',width:'10px',height:'10px',borderRadius:'50%',background:'var(--v)',border:'2px solid var(--white)'}} />
                    <div style={{fontSize:'13px',fontWeight:600,color:'var(--v)'}}>{h.curso_nuevo_nombre}</div>
                    <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'2px'}}>{h.curso_anterior_nombre && `← ${h.curso_anterior_nombre} · `}{fmtFecha(h.fecha)}</div>
                  </div>
                ))}
              </div>
            </>}

            {/* Historial de cuotas */}
            {histCuotas.length > 0 && <>
              <SL style={{marginBottom:'10px',marginTop:'16px'}}>Historial de cuotas</SL>
              {histCuotas.map((h:any) => (
                <div key={h.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12.5px'}}>
                  <span style={{color:'var(--text3)'}}>$</span>
                  <span style={{textDecoration:'line-through',color:'var(--text3)'}}>${h.cuota_anterior?.toLocaleString('es-AR')}</span>
                  <span style={{color:'var(--text3)'}}>→</span>
                  <span style={{fontWeight:600,color:'var(--v)'}}>${h.cuota_nueva?.toLocaleString('es-AR')}</span>
                  <span style={{marginLeft:'auto',color:'var(--text3)',fontSize:'11px'}}>{fmtFecha(h.vigente_desde)}</span>
                </div>
              ))}
            </>}

            {historial.length === 0 && histCuotas.length === 0 && (
              <div style={{textAlign:'center',padding:'24px',color:'var(--text3)',fontSize:'13px'}}>
                <div style={{fontSize:'32px',marginBottom:'8px'}}>📊</div>
                <div>Sin historial registrado todavía</div>
                <div style={{fontSize:'12px',marginTop:'4px'}}>Los cambios de curso y cuota aparecerán aquí</div>
              </div>
            )}

            {/* Resumen de pagos */}
            {pagos.length > 0 && <>
              <SL style={{marginBottom:'10px',marginTop:'16px'}}>Resumen de pagos</SL>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px'}}>
                <div style={{background:'var(--vl)',borderRadius:'10px',padding:'10px',textAlign:'center'}}>
                  <div style={{fontSize:'18px',fontWeight:700,color:'var(--v)'}}>{pagos.length}</div>
                  <div style={{fontSize:'11px',color:'var(--text3)'}}>Pagos</div>
                </div>
                <div style={{background:'var(--greenl)',borderRadius:'10px',padding:'10px',textAlign:'center'}}>
                  <div style={{fontSize:'18px',fontWeight:700,color:'var(--green)'}}>${Math.round(pagos.reduce((s:number,p:any)=>s+(p.monto||0),0)/1000)}k</div>
                  <div style={{fontSize:'11px',color:'var(--text3)'}}>Total</div>
                </div>
                <div style={{background:'var(--amberl)',borderRadius:'10px',padding:'10px',textAlign:'center'}}>
                  <div style={{fontSize:'18px',fontWeight:700,color:'var(--amber)'}}>${a.cuota_mensual?.toLocaleString('es-AR')}</div>
                  <div style={{fontSize:'11px',color:'var(--text3)'}}>Cuota actual</div>
                </div>
              </div>
            </>}
          </Card>
        </div>
      )}

      {modalPago && <ModalSheet title="Registrar pago" onClose={() => setModalPago(false)}>
        <Field2 label="Mes">
          <select style={IS} value={pago.mes} onChange={e=>setPago({...pago,mes:e.target.value})}>
            {MESES.map(m=><option key={m}>{m}</option>)}
          </select>
        </Field2>
        <Field2 label="Monto ($)"><Input type="number" value={pago.monto||''} onChange={(v:string)=>setPago({...pago,monto:+v})} /></Field2>
        <Field2 label="Método">
          <select style={IS} value={pago.metodo} onChange={e=>setPago({...pago,metodo:e.target.value})}>
            <option>Efectivo</option><option>Transferencia</option><option>MercadoPago</option>
          </select>
        </Field2>
        <Field2 label="Fecha"><input style={IS} type="date" value={pago.fecha_pago} onChange={e=>setPago({...pago,fecha_pago:e.target.value})} /></Field2>
        <Field2 label="Observaciones"><Input value={pago.observaciones} onChange={(v:string)=>setPago({...pago,observaciones:v})} placeholder="Opcional..." /></Field2>
        <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
          <BtnG style={{flex:1}} onClick={() => setModalPago(false)}>Cancelar</BtnG>
          <BtnP style={{flex:2}} onClick={guardarPago} disabled={guardandoPago}>{guardandoPago?'Guardando...':'Registrar pago'}</BtnP>
        </div>
      </ModalSheet>}

      {modalRecibo && ultimoPago && <ModalSheet title="Pago registrado ✓" onClose={() => setModalRecibo(false)}>
        <div style={{textAlign:'center',padding:'8px 0 16px'}}>
          <div style={{fontSize:'48px',marginBottom:'8px'}}>✅</div>
          <div style={{fontSize:'15px',fontWeight:700,color:'var(--text)',marginBottom:'4px'}}>Recibo disponible</div>
          <div style={{fontSize:'13px',color:'var(--text2)'}}>¿Querés enviarle el comprobante por WhatsApp?</div>
        </div>
        <button onClick={() => { abrirWS(ultimoPago.tel, ultimoPago.msg); setModalRecibo(false) }}
          style={{width:'100%',padding:'13px',background:'#25d366',color:'white',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px',marginBottom:'8px'}}>
          <svg width="18" height="18" viewBox="0 0 24 24" fill="white"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347z"/><path d="M12 0C5.373 0 0 5.373 0 12c0 2.126.553 4.122 1.523 5.857L0 24l6.338-1.503A11.962 11.962 0 0012 24c6.627 0 12-5.373 12-12S18.627 0 12 0zm0 22c-1.891 0-3.659-.5-5.191-1.375l-.371-.219-3.865.916.977-3.77-.24-.387A9.961 9.961 0 012 12C2 6.486 6.486 2 12 2s10 4.486 10 10-4.486 10-10 10z"/></svg>
          Enviar por WhatsApp
        </button>
        <BtnG style={{width:'100%'}} onClick={() => setModalRecibo(false)}>Cerrar</BtnG>
      </ModalSheet>}
    </div>
  )
}

// ── NOTAS INTERNAS DEL ALUMNO ────────────────────────────────────────────────
function NotasInternaTab({ alumnoId, autor }: { alumnoId: string; autor: string }) {
  const [notas, setNotas] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [texto, setTexto] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [editando, setEditando] = useState<any>(null)
  const [confirmDel, setConfirmDel] = useState<string|null>(null)

  useEffect(() => { cargar() }, [alumnoId])

  const cargar = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('notas_alumnos')
      .select('*').eq('alumno_id', alumnoId).order('created_at', { ascending: false })
    setNotas(data || [])
    setLoading(false)
  }

  const guardar = async () => {
    if (!texto.trim()) return
    setGuardando(true)
    const sb = createClient()
    if (editando) {
      const { error } = await sb.from('notas_alumnos').update({ texto: texto.trim() }).eq('id', editando.id)
      if (!error) {
        setNotas(prev => prev.map(n => n.id === editando.id ? { ...n, texto: texto.trim() } : n))
        setEditando(null)
        setTexto('')
      }
    } else {
      const { data, error } = await sb.from('notas_alumnos')
        .insert({ alumno_id: alumnoId, texto: texto.trim(), autor })
        .select().single()
      if (!error && data) {
        setNotas(prev => [data, ...prev])
        setTexto('')
      }
    }
    setGuardando(false)
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('notas_alumnos').delete().eq('id', id)
    if (!error) setNotas(prev => prev.filter(n => n.id !== id))
    setConfirmDel(null)
  }

  const IS2 = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)', resize:'vertical' as const, minHeight:'80px' }

  return (
    <div>
      {/* Input nueva nota */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
        <div style={{fontSize:'10.5px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>
          {editando ? 'Editar nota' : 'Nueva nota interna'}
        </div>
        <textarea
          style={IS2}
          value={texto}
          onChange={e => setTexto(e.target.value)}
          placeholder="Escribí una observación interna sobre este alumno..."
        />
        <div style={{display:'flex',gap:'8px',marginTop:'10px'}}>
          {editando && (
            <button onClick={() => { setEditando(null); setTexto('') }}
              style={{flex:1,padding:'10px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
              Cancelar
            </button>
          )}
          <button onClick={guardar} disabled={guardando || !texto.trim()}
            style={{flex:2,padding:'10px',background:guardando||!texto.trim()?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:700,cursor:guardando||!texto.trim()?'not-allowed':'pointer'}}>
            {guardando ? 'Guardando...' : editando ? 'Guardar cambios' : 'Agregar nota'}
          </button>
        </div>
      </div>

      {/* Lista de notas */}
      {loading ? (
        <div style={{textAlign:'center',padding:'24px',color:'var(--text3)'}}>Cargando...</div>
      ) : notas.length === 0 ? (
        <div style={{textAlign:'center',padding:'40px 24px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',color:'var(--text3)'}}>
          <div style={{fontSize:'28px',marginBottom:'8px'}}>📝</div>
          <div style={{fontWeight:600,marginBottom:'4px'}}>Sin notas internas</div>
          <div style={{fontSize:'13px'}}>Las notas son visibles solo para el equipo del instituto</div>
        </div>
      ) : (
        <div style={{display:'flex',flexDirection:'column',gap:'10px'}}>
          {notas.map(n => (
            <div key={n.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px 16px'}}>
              <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                  <div style={{width:28,height:28,borderRadius:'8px',background:'var(--v)',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#fff',flexShrink:0}}>
                    {n.autor?.[0] || '?'}
                  </div>
                  <div>
                    <div style={{fontSize:'12px',fontWeight:700}}>{n.autor || 'Sistema'}</div>
                    <div style={{fontSize:'10px',color:'var(--text3)'}}>
                      {new Date(n.created_at).toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'})} · {new Date(n.created_at).toLocaleTimeString('es-AR',{hour:'2-digit',minute:'2-digit'})}
                    </div>
                  </div>
                </div>
                <div style={{display:'flex',gap:'6px'}}>
                  <button onClick={() => { setEditando(n); setTexto(n.texto) }}
                    style={{padding:'5px 10px',background:'var(--vl)',color:'var(--v)',border:'1px solid var(--v)',borderRadius:'7px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                    Editar
                  </button>
                  <button onClick={() => setConfirmDel(n.id)}
                    style={{padding:'5px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'7px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                    ✕
                  </button>
                </div>
              </div>
              <div style={{fontSize:'13.5px',color:'var(--text)',lineHeight:1.5,whiteSpace:'pre-wrap'}}>{n.texto}</div>
            </div>
          ))}
        </div>
      )}

      {/* Confirmar eliminación */}
      {confirmDel && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'center',justifyContent:'center',zIndex:300}}>
          <div style={{background:'var(--white)',borderRadius:'16px',padding:'24px',maxWidth:'320px',width:'90%',textAlign:'center'}}>
            <div style={{fontSize:'28px',marginBottom:'8px'}}>🗑️</div>
            <div style={{fontSize:'15px',fontWeight:700,marginBottom:'8px'}}>¿Eliminar esta nota?</div>
            <div style={{fontSize:'13px',color:'var(--text3)',marginBottom:'20px'}}>Esta acción no se puede deshacer</div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={() => setConfirmDel(null)} style={{flex:1,padding:'11px',background:'transparent',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} style={{flex:1,padding:'11px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:700,cursor:'pointer'}}>Eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
