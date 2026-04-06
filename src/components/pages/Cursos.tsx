'use client'
import { useState, useEffect, useRef } from 'react'
import { useCursos, useProfesoras, useAlumnos, useCursoAlumnos, useClases, useMiProfesora, useExamenes, useNotasExamen, store, storeTs } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

function hoy() { return new Date().toISOString().split('T')[0] }
function fmtFecha(f: string) { if(!f)return'—'; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}` }

const NIVELES = ['Básico','Intermedio','Advanced','Cambridge']
const NIVEL_COL: Record<string,{bg:string,text:string}> = {
  'Básico':     {bg:'#FEF3CD',text:'#b45309'},
  'Intermedio': {bg:'#E0F0F7',text:'#1a6b8a'},
  'Advanced':   {bg:'#e6f4ec',text:'#2d7a4f'},
  'Cambridge':  {bg:'#f2e8f9',text:'#652f8d'},
}
const DIAS_OPCIONES = ['Lun','Mar','Mié','Jue','Vie','Sáb']

type Vista = 'lista' | 'detalle' | 'form' | 'asistencia_rapida'

export default function Cursos() {
  const { cursos: todosCursos, loading, actualizar, agregar, recargar } = useCursos()
  const { profesoras, recargar: recargarProfs } = useProfesoras()
  const { alumnos, recargar: recargarAlumnos } = useAlumnos()
  const { usuario } = useAuth()
  const { miProfesora, loading: loadingProf } = useMiProfesora()

  // Si es profesora filtrar solo sus cursos — esperar que cargue primero
  const cursos = usuario?.rol === 'profesora'
    ? (miProfesora ? todosCursos.filter(c => c.profesora_id === miProfesora.id) : [])
    : todosCursos
  const [vista, setVista] = useState<Vista>(() => {
    if (typeof window !== 'undefined') {
      const v = sessionStorage.getItem('cursos_vista')
      if (v === 'detalle' || v === 'lista' || v === 'form' || v === 'asistencia_rapida') return v as Vista
    }
    return 'lista'
  })
  const [selId, setSelId] = useState<string|null>(() => {
    if (typeof window !== 'undefined') return sessionStorage.getItem('cursos_selId')
    return null
  })
  const [tab, setTab] = useState<'info'|'alumnos'|'planilla'|'examenes'>(() => {
    if (typeof window !== 'undefined') {
      const t = sessionStorage.getItem('cursos_tab')
      if (t === 'info' || t === 'alumnos' || t === 'planilla' || t === 'examenes') return t as any
    }
    return 'info'
  })
  const [form, setForm] = useState<any>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const puedeEditar = ['director','coordinadora'].includes(usuario?.rol||'')
  const selLive = cursos.find(c => c.id === selId)

  // selRef: mantiene el último curso válido visto
  const selRef = useRef<any>(null)
  if (selLive) selRef.current = selLive

  // selCacheRef: leer del store global de cursos (más fresco que sessionStorage)
  // Solo se inicializa una vez y solo si selId existe
  const selCacheRef = useRef<any>(null)
  if (selCacheRef.current === null && selId) {
    // Primero intentar el store global (en memoria, más fresco)
    if (typeof window !== 'undefined') {
      try {
        const raw = sessionStorage.getItem('nq_cursos')
        if (raw) {
          const { data } = JSON.parse(raw)
          const found = data?.find((c: any) => c.id === selId)
          if (found) selCacheRef.current = found
        }
      } catch {}
    }
  }

  const sel = selLive ?? selRef.current ?? selCacheRef.current
  const [filtroDia, setFiltroDia] = useState<string|null>(null)

  const DIAS_ORD: Record<string,number> = {'Lun':0,'Mar':1,'Mié':2,'Jue':3,'Vie':4,'Sáb':5,'Lunes':0,'Martes':1,'Miercoles':2,'Miércoles':2,'Jueves':3,'Viernes':4,'Sabados':5,'Sábados':5}
  const DIAS_LABELS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábados']
  const cursosFiltrados = [...cursos]
    .filter(c => !filtroDia || (c.dias||'').includes(filtroDia.slice(0,3)) || c.dias === filtroDia)
    .sort((a,b) => {
      const da = DIAS_ORD[a.dias?.split(' / ')[0]||''] ?? 99
      const db = DIAS_ORD[b.dias?.split(' / ')[0]||''] ?? 99
      return da - db
    })

  // Recargar profesoras y alumnos al montar para tener datos frescos
  useEffect(() => {
    recargarProfs()
    recargarAlumnos()
  }, [])

  const irADetalle = (id: string, tabOverride?: 'info'|'alumnos'|'planilla'|'examenes') => {
    const t = tabOverride ?? 'info'
    setSelId(id); setTab(t); setVista('detalle')
    try {
      sessionStorage.setItem('cursos_vista', 'detalle')
      sessionStorage.setItem('cursos_selId', id)
      sessionStorage.setItem('cursos_tab', t)
    } catch {}
  }
  const irALista = () => {
    setSelId(null); setVista('lista')
    try {
      sessionStorage.setItem('cursos_vista', 'lista')
      sessionStorage.removeItem('cursos_selId')
      sessionStorage.setItem('cursos_tab', 'info')
    } catch {}
  }
  const irAFormNuevo = () => {
    setForm({ nombre:'', nivel:'Básico', profesora_id: profesoras[0]?.id||'', dias:'', hora_inicio:'08:00', hora_fin:'09:30' })
    setVista('form')
  }
  const irAFormEditar = () => { if (sel) { setForm({...sel, hora_inicio: sel.hora_inicio?.slice(0,5)||'08:00', hora_fin: sel.hora_fin?.slice(0,5)||'09:30'}); setVista('form') } }

  const toggleDia = (d: string) => {
    const dias = form?.dias ? form.dias.split(' / ').filter(Boolean) : []
    const nuevos = dias.includes(d) ? dias.filter((x:string)=>x!==d) : [...dias,d]
    setForm({...form, dias: nuevos.join(' / ')})
  }

  const guardar = async () => {
    if (!form?.nombre) return alert('El nombre es obligatorio')
    setGuardando(true)
    const { id, activo, ...datos } = form
    // Timeout de 6 segundos — nunca quedar tildado
    const t = setTimeout(() => { setGuardando(false); if (id) irADetalle(id); else irALista() }, 6000)
    try {
      if (!id) {
        const sb = createClient()
        const { data: nuevo } = await sb.from('cursos').insert({...datos, activo:true}).select().single()
        clearTimeout(t)
        if (nuevo) irADetalle(nuevo.id)
        else irALista()
      } else {
        // Actualizar local inmediatamente, guardar en background
        actualizar(id, datos)
        clearTimeout(t)
        irADetalle(id)
      }
    } catch { clearTimeout(t); if (id) irADetalle(id); else irALista() }
    setGuardando(false)
  }

  const eliminar = async () => {
    if (!selId) return
    setConfirmDelete(false)
    setSelId(null)
    setVista('lista')
    // Guardar en background
    const sb = createClient()
    Promise.all([
      sb.from('cursos').update({ activo: false }).eq('id', selId),
      sb.from('horario').update({ activo: false }).eq('curso_id', selId)
    ]).then(() => {
      recargar()
      window.dispatchEvent(new Event('horario-actualizado'))
    }).catch(() => recargar())
  }

  // No bloquear con loading — mostrar contenido aunque esté cargando

  // ── LISTA ──
  if (vista === 'lista') {
    return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
        <SL>{cursos.length} cursos</SL>
        {puedeEditar && <BtnP sm onClick={irAFormNuevo}>+ Nuevo curso</BtnP>}
      </div>
      {/* Filtro por día */}
      <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'14px'}}>
        <button onClick={() => setFiltroDia(null)} style={{padding:'6px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:!filtroDia?'var(--v)':'var(--border)',background:!filtroDia?'var(--v)':'var(--white)',color:!filtroDia?'#fff':'var(--text2)'}}>Todos</button>
        {DIAS_LABELS.map(d => (
          <button key={d} onClick={() => setFiltroDia(filtroDia===d?null:d)} style={{padding:'6px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:filtroDia===d?'var(--v)':'var(--border)',background:filtroDia===d?'var(--v)':'var(--white)',color:filtroDia===d?'#fff':'var(--text2)'}}>
            {d}
          </button>
        ))}
      </div>
      {cursosFiltrados.map(c => {
        const prof = profesoras.find(p => p.id === c.profesora_id)
        const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
        return (
          <ListItem key={c.id} onClick={() => irADetalle(c.id)}>
            <div style={{width:44,height:44,borderRadius:14,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:'11px',fontWeight:700,color:col.text}}>{c.nivel.slice(0,3).toUpperCase()}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'15px',fontWeight:600}}>{c.nombre}</div>
              <div style={{fontSize:'12.5px',color:'var(--text2)',marginTop:'2px'}}>
                {prof?`${prof.nombre} ${prof.apellido}`:'Sin asignar'} · {c.dias||'Sin días'} · {c.hora_inicio?.slice(0,5)||''}
              </div>
            </div>
            <Chevron />
          </ListItem>
        )
      })}
      {cursosFiltrados.length === 0 && <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>No hay cursos para este día</div>}
    </div>
  )
  }

  // ── FORMULARIO ──
  if (vista === 'form') return (
    <div className="fade-in">
      <BtnG sm onClick={() => form?.id ? irADetalle(form.id) : irALista()} style={{marginBottom:'20px'}}>← Cancelar</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>{form?.id ? 'Editar curso' : 'Nuevo curso'}</div>
      <Card>
        <Field2 label="Nombre del curso *"><Input value={form?.nombre||''} onChange={(v:string)=>setForm({...form,nombre:v})} placeholder="Ej: Intermediate B" /></Field2>
        <Row2>
          <Field2 label="Nivel">
            <select style={IS} value={form?.nivel||'Básico'} onChange={e=>setForm({...form,nivel:e.target.value})}>
              {NIVELES.map(n=><option key={n}>{n}</option>)}
            </select>
          </Field2>
          <Field2 label="Profesora">
            <select style={IS} value={form?.profesora_id||''} onChange={e=>setForm({...form,profesora_id:e.target.value})}>
              <option value="">Sin asignar</option>
              {profesoras.map(p=><option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
            </select>
          </Field2>
        </Row2>
        <Field2 label="Días de clase">
          <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'4px'}}>
            {DIAS_OPCIONES.map(d => {
              const sel = (form?.dias||'').includes(d)
              return (
                <button key={d} type="button" onClick={() => toggleDia(d)} style={{padding:'7px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:sel?'var(--v)':'var(--border)',background:sel?'var(--v)':'var(--white)',color:sel?'#fff':'var(--text2)'}}>
                  {d}
                </button>
              )
            })}
          </div>
        </Field2>
        <Row2>
          <Field2 label="Hora inicio"><input style={IS} type="time" value={form?.hora_inicio||'08:00'} onChange={e=>setForm({...form,hora_inicio:e.target.value})} /></Field2>
          <Field2 label="Hora fin"><input style={IS} type="time" value={form?.hora_fin||'09:30'} onChange={e=>setForm({...form,hora_fin:e.target.value})} /></Field2>
        </Row2>
      </Card>
      <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
        <BtnG style={{flex:1}} onClick={() => form?.id ? irADetalle(form.id) : irALista()}>Cancelar</BtnG>
        <BtnP style={{flex:2}} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : form?.id ? 'Guardar cambios' : 'Crear curso'}
        </BtnP>
      </div>
    </div>
  )

  // ── DETALLE ──
  if (vista === 'detalle') {
    const cursoParaDetalle = sel ?? selRef.current
    if (!cursoParaDetalle) return <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
    return (
      <CursoDetalle
        curso={cursoParaDetalle}
        profesoras={profesoras}
        alumnos={alumnos}
        puedeEditar={puedeEditar}
        tab={tab}
        setTab={setTab}
        onVolver={irALista}
        onTabChange={(t: any) => { setTab(t); try { sessionStorage.setItem('cursos_tab', t) } catch {} }}
        onEditar={irAFormEditar}
        onEliminar={() => setConfirmDelete(true)}
        confirmDelete={confirmDelete}
        onCancelDelete={() => setConfirmDelete(false)}
        onConfirmDelete={eliminar}
        onAsistenciaRapida={() => {
          setVista('asistencia_rapida')
          try { sessionStorage.setItem('cursos_vista', 'asistencia_rapida') } catch {}
        }}
      />
    )
  }

  // ── ASISTENCIA RÁPIDA ──
  if (vista === 'asistencia_rapida') {
    if (!sel) return <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
    return (
      <AsistenciaRapida
        curso={sel}
        profesoras={profesoras}
        alumnos={alumnos}
        onVolver={() => {
          setVista('detalle')
          try { sessionStorage.setItem('cursos_vista', 'detalle') } catch {}
        }}
      />
    )
  }

  return null
}

function CursoDetalle({ curso:c, profesoras, alumnos, puedeEditar, tab, setTab, onVolver, onEditar, onEliminar, confirmDelete, onCancelDelete, onConfirmDelete, onAsistenciaRapida }: any) {
  const { alumnosCurso: alumnosCursoRaw, agregar: agregarAlumno, quitar: quitarAlumno, recargar: recargarAlumnos } = useCursoAlumnos(c.id)
  // Preservar datos durante refetch — evita flash de lista vacía
  const alumnosCursoRef = useRef<any[]>(alumnosCursoRaw)
  useEffect(() => { if (alumnosCursoRaw.length > 0) alumnosCursoRef.current = alumnosCursoRaw }, [alumnosCursoRaw])
  const alumnosCurso = alumnosCursoRaw.length > 0 ? alumnosCursoRaw : alumnosCursoRef.current

  // Escuchar cuando se asigna un alumno desde otro módulo
  useEffect(() => {
    const handler = () => recargarAlumnos()
    window.addEventListener('curso-alumno-updated', handler)
    return () => window.removeEventListener('curso-alumno-updated', handler)
  }, [recargarAlumnos])

  // Recargar datos al volver a la pestaña
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        recargarAlumnos()
      }
    }
    document.addEventListener('visibilitychange', handleVisibility)
    return () => document.removeEventListener('visibilitychange', handleVisibility)
  }, [recargarAlumnos])

  const { clases, setData: setClases, agregar: agregarClase, actualizar: actualizarClaseHook } = useClases(c.id)
  const [modalClase, setModalClase] = useState(false)
  const [modalAlumno, setModalAlumno] = useState(false)
  const [modalEditClase, setModalEditClase] = useState(false)
  const [claseEditando, setClaseEditando] = useState<any>(null)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [confirmDelClase, setConfirmDelClase] = useState<string|null>(null)

  const eliminarClase = async (claseId: string) => {
    const sb = createClient()
    await Promise.all([
      sb.from('asistencia_clases').delete().eq('clase_id', claseId),
      sb.from('clases').delete().eq('id', claseId)
    ])
    setClasesLocal(prev => prev.filter(cl => cl.id !== claseId))
    setConfirmDelClase(null)
  }
  const [nuevaClase, setNuevaClase] = useState({ fecha: hoy(), tema:'', descripcion:'' })
  const [guardando, setGuardando] = useState(false)
  const asistCacheKey = `asistencias_${c.id}`
  const [asistencias, setAsistencias] = useState<Record<string,Record<string,string>>>(
    store[asistCacheKey] ?? {}
  )
  // Sin clasesLocal — usamos clases del hook directamente
  // Las mutaciones (eliminar, editar) llaman setClases para optimistic updates
  const clasesLocal = clases
  const setClasesLocal = setClases

  const abrirEditClase = (cl: any) => {
    setClaseEditando({ ...cl, descripcion: cl.observacion_coordinadora || '' })
    setModalEditClase(true)
  }

  const guardarEditClase = () => {
    if (!claseEditando) return
    // Actualizar local inmediatamente
    setClasesLocal(prev => prev.map(cl => cl.id === claseEditando.id
      ? { ...cl, fecha: claseEditando.fecha, tema: claseEditando.tema, observacion_coordinadora: claseEditando.descripcion }
      : cl
    ))
    setModalEditClase(false)
    setClaseEditando(null)
    // Guardar en background
    const sb = createClient()
    sb.from('clases').update({
      fecha: claseEditando.fecha,
      tema: claseEditando.tema,
      observacion_coordinadora: claseEditando.descripcion,
    }).eq('id', claseEditando.id).catch(e => console.error('Error editando clase:', e))
  }

  const generarBoletin = async (a: any, curso: any) => {
    const sb = createClient()
    const anio = new Date().getFullYear()
    const trimestre = Math.floor(new Date().getMonth() / 3) + 1
    const mesesTrim = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
      .slice((trimestre-1)*3, trimestre*3)

    // Asistencia del trimestre
    const { data: asist } = await sb.from('asistencia_clases')
      .select('estado, clases(fecha)')
      .eq('alumno_id', a.id)
    const asistTrim = (asist||[]).filter((x:any) => {
      const m = x.clases?.fecha ? new Date(x.clases.fecha+'T12:00:00').getMonth() : -1
      return m >= (trimestre-1)*3 && m < trimestre*3
    })
    const presentes = asistTrim.filter((x:any) => x.estado==='P').length
    const ausentes = asistTrim.filter((x:any) => x.estado==='A').length
    const tardes = asistTrim.filter((x:any) => x.estado==='T').length
    const totalClases = presentes + ausentes + tardes
    const pct = totalClases > 0 ? Math.round(presentes/totalClases*100) : 0

    // Exámenes del trimestre
    const { data: notas } = await sb.from('notas_examenes')
      .select('*, examenes(nombre, fecha)')
      .eq('alumno_id', a.id)
    const notasTrim = (notas||[]).filter((n:any) => {
      const m = n.examenes?.fecha ? new Date(n.examenes.fecha+'T12:00:00').getMonth() : -1
      return m >= (trimestre-1)*3 && m < trimestre*3
    })
    const notasValidas = notasTrim.filter((n:any) => !n.ausente && n.nota !== null)
    const promedio = notasValidas.length > 0 ? Math.round(notasValidas.reduce((s:number,n:any)=>s+n.nota,0)/notasValidas.length) : null

    const prof = profesoras.find((p:any) => p.id === curso.profesora_id)
    const profNombre = prof ? `${prof.nombre} ${prof.apellido}` : '—'

    const filaExamenes = notasTrim.map((n:any) => {
      const ok = !n.ausente && n.nota >= 60
      const color = n.ausente ? '#b45309' : ok ? '#2d7a4f' : '#c0392b'
      const estado = n.ausente ? 'Ausente' : ok ? 'Aprobado' : 'Desaprobado'
      return `<tr><td>${n.examenes?.nombre||'—'}</td><td style="font-weight:700;color:${color};text-align:center">${n.ausente?'—':n.nota??'—'}</td><td style="color:${color};font-weight:600">${estado}</td></tr>`
    }).join('')

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boletín - ${a.nombre} ${a.apellido}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:32px;font-size:13px;color:#1a1020;max-width:600px;margin:0 auto}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #652f8d;padding-bottom:14px;margin-bottom:20px}
      .logo{font-size:20px;font-weight:800}.logo span{color:#652f8d}
      h1{color:#652f8d;font-size:18px;margin:0 0 4px}
      .alumno-box{background:#f9f5fd;border-radius:12px;padding:14px;margin-bottom:18px;display:flex;gap:14px;align-items:center}
      .av{width:48px;height:48px;border-radius:14px;background:${a.color||'#652f8d'};display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;color:white;flex-shrink:0}
      .kpis{display:flex;gap:10px;margin-bottom:18px}
      .kpi{flex:1;background:#f9f5fd;border-radius:10px;padding:12px;text-align:center}
      .kpi-val{font-size:22px;font-weight:800;color:#652f8d}
      .kpi-lab{font-size:10px;color:#9b8eaa;font-weight:600;text-transform:uppercase;margin-top:2px}
      .section-title{font-size:11px;font-weight:700;color:#9b8eaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f0edf5}
      table{width:100%;border-collapse:collapse;margin-bottom:18px}
      th{font-size:11px;text-transform:uppercase;color:#652f8d;border-bottom:2px solid #652f8d;padding:8px;text-align:left}
      td{padding:9px 8px;border-bottom:1px solid #f0edf5}
      .firma{display:flex;justify-content:space-around;margin-top:40px}
      .firma-box{text-align:center}
      .firma-linea{width:120px;border-top:1.5px solid #1a1020;margin:0 auto 6px}
      .firma-nombre{font-size:12px;font-weight:700}
      .firma-cargo{font-size:10px;color:#9b8eaa}
    </style></head><body>
    <div class="hd">
      <div class="logo"><span>Next</span> Ezeiza · English Institute</div>
      <div style="font-size:11px;color:#9b8eaa">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <h1>Boletín de Calificaciones</h1>
    <p style="color:#9b8eaa;font-size:12px;margin-bottom:16px">${trimestre}° Trimestre ${anio} · ${mesesTrim.join(', ')}</p>
    <div class="alumno-box">
      <div class="av">${a.nombre[0]}${a.apellido[0]}</div>
      <div>
        <div style="font-size:17px;font-weight:800">${a.nombre} ${a.apellido}</div>
        <div style="font-size:12px;color:#9b8eaa;margin-top:3px">${curso.nombre} · ${curso.dias||'—'}</div>
      </div>
    </div>
    <div class="section-title">Asistencia</div>
    <div class="kpis">
      <div class="kpi"><div class="kpi-val" style="color:#2d7a4f">${presentes}</div><div class="kpi-lab">Presentes</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#c0392b">${ausentes}</div><div class="kpi-lab">Ausentes</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#b45309">${tardes}</div><div class="kpi-lab">Tardes</div></div>
      <div class="kpi"><div class="kpi-val">${pct}%</div><div class="kpi-lab">Asistencia</div></div>
    </div>
    <div class="section-title">Evaluaciones</div>
    ${notasTrim.length === 0 ? '<p style="color:#9b8eaa;font-size:12px">Sin evaluaciones en el período</p>' : `
    <table>
      <tr><th>Evaluación</th><th style="text-align:center">Nota</th><th>Estado</th></tr>
      ${filaExamenes}
    </table>
    ${promedio !== null ? `<div style="display:flex;justify-content:space-between;padding:12px;background:#f2e8f9;border-radius:10px;font-weight:700;color:#652f8d"><span>Promedio del trimestre</span><span style="font-size:20px">${promedio}</span></div>` : ''}`}
    <div class="firma" style="justify-content:center">
      <div class="firma-box"><img src="data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAf0AAAHqCAYAAAAOH5erAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAHBLSURBVHhe7d0F2HRrWfd//6++IgKiIN25QUC6OzephGyQULqbTSMl3bClpTukG5TuDukUZEtJY7yI//MzPkvH4Z65Z9asNbPW3L/vcfyOvWc9z3PfE2uu87rO/LUQQggb43Slb5S+XTqzCyGEEELYPU5e+kLpP0u/LB1eCiGEEMKOcVjpSyUGnz5cOkEphBBCCDvEeUr/UGoM/qdKJyyFEEIIYYe4YOl7pcbgf6skrh9CCCGEHeLEpa+XGoP/i9I1SyGEEELYIY5T+mCpMfj06tL/KYUQQghhRzhW6bWlaYP/zdKJSiGEEELYEY5demlp2uD/W+mipRBCCCHsCAw+F/60wacjSyGEEELYEX639JaSpjvTBv8VpV8vhRBCCGEHOH7pA6VpY08y98X3QwghhLADaLLz0dKswf/X0jlKIYQQQtgBTlrSXW/WpU+3LoUQQghhBzh1yfCcn5V+Upo2+OL4qccPIYQQdoBTlb5W0l733aVpg/+V0m+VQgghhDByzlQyD5/Bf2RJa93G4P9L6bylEEIIIYyc85X+qfTd0lUO/Xf6lH/bUgghhBBGzgVK3yl9u2RU7jtL0wb/daXfKIUQQghhxFym9INSMxZXh71pg/+lUurxQwghhJFzeOnHpa+WTl9Sez+drf/T0vlLIYQQQhgxly8x+E7ypy39Xumzpcbg/0fpZqUQQgghjJgrlpzoP1NSoqfu/jGlxuDTc0qJ44cQQggj5nIlbvtPl07uQnHZ0r+XGoP/kdJxSiGEEEIYKZL2fljixj+FC4X++pruNAZfFv9hpRBCCCGMlIuWGPwvlk7iQmEs7jNLjcE3SOfKpRBCCCGMlAuXvl9i8A3SadCEp+m65793L/1/pRBCCCGMkHOVtNVl8E/swiFOUPpmqTnlG6RzjFIIIYQQRsgZSkeX1OGfzIVDyNZ/eqkx+BL3frcUQgghhBFiPC5j//VD/z+NDH51+Ay+TYFBOyGEEEIYITLz/76kl/5pXJhCS12jcxn8n5dsAEIIIYQwQnTW+3jJlLyzujDDU0sM/v8rXd+FEEIIIYwPDXXeXpKpf24XZtCEh1v/l6WHlpKpH0IIIYwQmfcvLP2odAkXZpCo948lp/w3lNTohxBCCGFk/GbpqJIY/REu7MFzSwy+fvtpsRtCCCGMECf2B5V007u5C3twjRKX/j+VTulCCCGEEMYFg3/P0r8d+u9eMXpNePTT/1lJZ74QQgghjAwG/qYlBv/hpXkx+leWtNj908mjEEIIIYyOa5bE8M29F9Pfi+uUZOvfe/IohBBCCKPjkqUfl15f0mxnL4zH/UnppaWU5oUQQggj5JwlnfbeXTquC3twvJIsfXPzf8uFEEIIIYyL05ZMxvtU6UQu7AFX/8tLGvScxYUQQgghjAtT8r5cMkTndC7sATf+PUrK967lQgghhBDGxQlLxt9+q8S9P4/Ll5TmPapkfG4IIYQQRoTueW8r/bB0aRfmYJoe1/87SlryhhBCCGFESMITn1eap0RvHr9demeJ0Z+dnR9CCCGEgfMbpaeVjMC9pQtz0JTnESVu/b0G7YQQQghhwIjHG32rX/4DSovq7CXs/UvpL0qJ44cQQggj4+4lnfSeUlpkyM9R+l7p1aXU44cQQggj4wYlLv1XlBYl5JmP/7HSl0ondyGEEEII40HJHVf9h0qS8+bxf0vPK/20dDEXQgghhDAezl7ST/8LpXn99DE9Xe8Ohx6HEEIIYSQos9NPn07swgLOXXLCf1HJiT+EEEIII+EEJe11f1Q6nwsLOH7p8yXDdPy7EEIIIYwEcfs3lbjqr+rCAtTtG5OrHv/8LoQQQghhHGiq84ySWvzblxbF5v3ZnUuy+m/uQgghhBDGg2Y6DL5uevs11blwiTfgxSWbhRBCCCGMhKYW/5Ul8+8X8fulfyjJ6j+uCyGEEEIYBxco/aSksc6i0jyI47+xZD6+7nshhBBCGAlK875T+lrpRC4sQBz/fiXteG/kQgghhBDGASOv1E4t/tlc2Icrl8T8nzt5FEIIIYRRcJzSG0qa6hzuwj78QUkI4COlY7oQQgghhOEjLv+E0r+XblXar22uDcKnS98vCQeEEEIIYQQoxbt3icG/f2m/cjsbhJeVlOddwYUQQgghDB8n+uuVTM17VmnRmFz4+wboSNx7oAshhBBCGAf66P+g9I7SsV3YByd7HoHXlDJIJ4QQQhgJpyhpqPP3pf1K83Cqkqz+r5QM1QkhhBDCCNA17+Olo0tndWEfNOj5YMks/bO4EEIIIYTho6Wu/vg/L13ehX0Qxz+q9IvSjV0IIYQQwvCRqf/okp7613dhCfw9Bv9Jpf2G7oQQQghhINyxxIA/oLRfLT7OWZLo9+HSfj34QwghhDAQLluSef/80jKjbyXrSdqTvHdKF0IIIYQwfCTrieG/u7RMqZ24/8tLJuelAU8IIYQwEk5akqX/2dIys+65/YUBmgY8y4QBQgghhLBlfq/0oRIXvTr7ZbhUiVfAjPzfciGEEEIIw4Yb/9Wln5V03lsGTXq+WdK054QuhBBCCGH4PLZkKM41Jo/257dL2vEarXt2F0IIIYQwfG5ekql/+9IyMXl/5z4lcXz/JoQQQggj4ColWfe66C3bTOfKJQ17lPNlkE4IIYQwAi5Q0h/fvPtljfepS/9U+nQpg3RCCCGEEXCG0rdK7yktm3V/nNJHSt8tndmFEEIIIQybk5SMyFWLv8yYXOjK9+SSUMARLoQQQghh2Gi483clLvo/dGFJblSSuPeQUgbphBBCCAPnGKUXlAzFuYwLS3Luktj/m0vHdCGEEEIIw+U3Sg8vab7zp6Vl2+X+TunLpa+XTuBCCCGEEIYLd/ydStrlHnno8TKI47++ZKNwURdCCCGEMFyc6K9eYvCfXlqlrv6epV+WDNQJIYQQwsC5WEkM/zWlY7mwJJcv6dL3vFIS90IIIYSBc/rSP5Y+Wvp9F5bkZKXvlz5X0mM/hBBCCANG0p1GOl8racSzLIy88brfK53OhRBCCCEMF278t5Z+VLqQC0vCjf+4kr76V3MhhBBCCMNF4t4zS+Lxf+LCClyv9IvSA0vLlvSFEEIIYUs8qMRw3660iuE+S0lpnm59mZwXQgghDJwblLTKfWppFYP/e6UvlMT/V0n4CyGEEMIWuHSJwX9LaZUSO536nlNSx39hF0IIIYQwXM5a+peSGferltjdptSEA0IIIYQwYE5V+nbJbPxlx+Q2nKckjq8Bj5a7IYQQQhgov1v6VMkEvHO4sAJi94bo+PdpwBNCCCEMmN8qvamkNO+KLqyAEbuvLv1z6YwuhBBCCGGY/Gbp+SWx+Ju4sAKy+g3S+deSEbshhBBCGChi7w8uMfgPKK3aROfw0k9LDy0ljh9CCCEMFAb+5iVtcp9bWtVon7Yk4U9ZX+L4IQybY5ZWTc4NIewIDP6VStzyYvmrds07bukdpS+VTu5CCGGQCN+ZmfG+0g9dCCEcPC5VMkDHBDxZ+6ugAc9jS7L8VxnAE0LYHJpqnav0hpLNve/6xUohhAOGvvjc8l8tncaFFeAhuG5JPf7tDz0OIQwH30mht2eV5Nt8rnSNkgqdEMIB48QltfTfL2mmsypnLinNe1Epi0gIw8L3+6jSD0o29keWzMIIIRxAxOHfWXJKv7wLKyIMwEX4sdIJXQghDALfbZ43ht6m/JElG4AQwgFFA52XlP6tJGN/Vbe8OP4zShYUccIQwvbxvb526csl8zJeXDp1KWG3EA4wSvEeVlKa96hDj1fBAnLrkmQgC0wIYbvYhF+u9ImSjbxKmj8spVdGCAccBvuGJe11xeGdDFbl/KWflJ5SWmXMbgihW3yfz1t6e8l3+uMloTpleSGE8GuXKHH7va10bBdWRBLQF0ri+MdxIYSwFc5UsnHncVN5c6NSkmlDCP/N2UrfK322dDIXVkTDHnkA4viy9kMIm0fS7MNLNu+y8rW8/p1SCCH8NycofbqkNE9dfhvuUfpl6WqTRyGETXKs0p1LQmtc+c8unbSUJL0Qwv9Ckg93/s9LbTtwXaT0H6XHl7LIhLA5JOOZdmnDbtOtTfbZS/kehhB+BQuDE4FMfaV5bRAK0KL3g6UkCIWwOXTOU37H2H+gdNlSjH0IYS4adFgwHj15tDqMvAY+3ymdyoUQQu9IuNX4ynf3iyWtrmPsQwgLuUypcQdy8bfhMSVeAjXAIYR+kW/zupLvrSQ9m/aUxYYQ9kVjDk06NOtom9l7REkc/76TRyGEvjCOWofLX5S0xX5wKeV3IYSlOGVJz21qO9teSZ6SIGM4c9IIoXu463+/9IiS75p6+yeX0iM/hLA0GuboyuW0cE4XWnD8klp+TXgsSiGEbuF9u3tJRj5j/9xS21LaEMIBRdLda0vc+ld0oQXa8r689MNSm1G7IYT5/HZJG+yvlNTa/23pQqUk6YUQVkItrxp6SXe3c6EFFp77l2wa/tyFEEIn2JBLhv1wSdxeG+srldom2IYQDjCM9c1Kku6U5rU9NVyhxNX4hFLi+CGsj++iMNsbSzbkau6vV2oz6CqEECZcucRVaHZ22+Y5hnf8U8lIzmO6EEJYC30tnlWSpOe7dWTJwKoQQmiNuLtkIN262pbm/W6J21G2/6ldCCG0RvLrA0rfLcmN4X1rM+AqhBD+Fycpfan0D6W2i4qYovpg2f5afIYQ2qFyxnhb30d5Ma8unbEUQghrYxb+u0u6dp3DhRaIN96yZIG6Vylx/BBWx8b58JIyV0l62lbzwEmuDSGEtRG3V9crVvjHpbaJexcuGdP5NyWz8kMIy9Mk6b21JKfmcyXfx7Z5NSGE8CtYaO5Zcjq/y6HHbTCHWyaxGftpwBPCapyipMrlpyW5MHcoce+HEEKnGLWprO6oUlv3oZ7eby4Zl3suF0IIS8GwC4lJnv1x6VGlZOSHEHrh/CUxfAlCbcvqxO31+uYpUC/c1lMQwkHCBluXy8+UfHdeWtIjP9+fEEIvcCd+vcQdfwIXWnK1kiYhTy2lG1gI+2NiZdNc572li5WS9BpC6I1jlTTNUfd7Bhdaonzo26UPltrW9IdwUDhe6TElJ/uvlW5c2rmE17gqQhgWFpmnla5ZckoXi2+DjcPbSqcrXbBkgt4uw4shQdFoYc2HtD1txFVrrWtyIrQv9viXpf8sKbvyXyc7cVuPf35Iqh1UTfivjG3/JuwW7gsG/kElA3IeWRISk7S3c8TohzAcuBBvXbLo3LX0uFIb/JwnlW5Q+pPSa0pj57DS2UsM+3FLFyj9QUnow0LduF+tadPr2jJrHIM/y/S15v+bDYLNAIMgwVK7VXkXvDL+X0c2f675kceu23B5HIYH173v2dlKLyvdsXR0aWeJ0Q9hGPgumsL1kpKa/JuX2mJi3jNLMo2V+Y0Jpy4GXT30mUveE90Hm9M6GF6G9qulT5X+ueSUztgysh7/Y4mhdUJnnJvTOsNtg+DnkcoGP5engFdAwqSNhesaItlQuCaLWz1285j8v79r43H8Eg+DMIp/63dMbxx4CRgT09a0QP5m6f2lXffADJVTlv6yJLn1QyWz7oXUpj+zEELoDbF7ButNpXUmcp27xMiZ282oDR3G9o9K9y19pMR4W3iJoTZjgOfjbiXZ1AzxGLAZ0KXtiJLnzsBoimSjMv0abUR4Yu5UOn0p9IvN2l+UfEd830yrTIJrCGGjWIhk6X++tM6gDvXDevM7RYptD43mRC3HwMLLoDu1i7FLntLhjIHn5VC9sKt4H2SI36YkDPONko2AfAH3gGZMTqJNyCKsjw3wdUq+G+61h5Z4ZkIIYaNI3HtdSZY9Q9AWi5r2oE4w2u0OBS5x7u/blZ5f4pZn3LjebXTuU9LK1MbnIGPa4e1LKi18hjZDysYuXUrL5Pb4Xly0JKQixCJuf5pSCCFsHCc5WcJcvJd3oSVOjg8pMaYMxzbxXMS/ubYfXhLDZsC46p2yHlv601K6ms1HguL9SjaCPlODli5Riht6eXy3zlR6cYmxf1/JexhCCFuBcbxFyYJ0KxfWQIY+4/CcyaPNwxiJYYtfS0LUm5yh17r0XSWJhW0nAx5kVCmo5rBZEgJ5VUkVg3sn7I335oQlm2CVFF8p2WQedE9SCGHLXKHk9Ovkuw7K2JSPyUCWNb4pJBueqsRt/4aSvv7c0pqaPL105ZLFN6wPr4hRyE3/d/kQY0lo3CR6U9y0ZL6994q3JB6lEMLWURPsFPL60jpjOSUiSdz7XmkTiW/K0eQdcNtzlzLyjP3HS/cona+UE1V/SO7jrpb099HSOjkgu4Sch8uWbHzliryolEqIEMIgOEmJy1ESm7afbbFZsGlgeA93oQcaV+nFS88uya6X+azeXKdAbnutfsdQGrgrCKVwV2v84zR7w9JBff/dn0pdJefp0aAaRLOd3I8hhEEgwU1DFgv2OicRi51mIuK83L5d4tR02tL1S3oGaHLD0PMoiNdfpnSiUuLK20Vpp02fU/+TSwdttrtmSNrmasSk94H7NV6mEMJgYEyVrMnUd3JeB4l7FnsnnC5ONQyG3ACxYg1yuOzlCXAhS4gSjjhoRmUMMHKa/jjl2kzKsdh15K2ot2folX/qOrnOFMoQQugchllSkUx9rtl14E53uhEeaNtcxCldmEGZ4PNKku+ECWTdS8q7bkn8eJ18g7AZ3Fs+R3kdPsch9WjoGjkjNjfuVZUM2jTH4xRCGByMKIP/4NI6i5QSrs+UnHBWbTAiFnzWkm537ymJB6sekIT3lNJ5S1ymYZwwgDaC7g332y5187MBVY4qSc/9f6lSGhaFEAbJhUpc+q8orbNQ+bfPKnHrX9uFJVDWJbGJC/SLJW5gVQNG7soJ0Kp3k2V+oV+4uV9XchLWpGnszXxUi2hJ7J7lyTA8SlleCCEMEsl6+qrrSrduXfVtSxre6E2/6BQnyU6NvHi/0zwPg2Q8pV7XKqkYSGe33YVR1CfB5/6w0hhDNO5vrZm/XuKNekaJlyuu/BDCYBFv525lcE/swhrwFkise0tpr5O5tq2aknDb+3s2B58tHVUSBzUCNgvmwYFX6P4lBvOlpTGdjk2JNEPCPfyu0llKuxSqCCHsIAyzMaqy4C1i62DD4MQjya7pcOekzpgb2armX0mdk50kpweUDG9JEt7BxibPrHghHUZUm+Qh4/k9piQ0ITNfhn7i9iGEwWOxNUSHIda8Zh2UZGmCY+E2LEQC06NL3yk5CUlsUkuvP7t2o2lKEqZxL16xJKdEwuYQxxVr58xLZba956n2PnkmIYTRYAFz6lait65b0s8wSKdZEDXj8V9ldjcoOc3HbR/2Q7te95CSPpPnhoD7VtjKyFvJqUrw0jo3hDAqLlISUxdHdYJpg9O6YTySlxj5/ywpw5K5f9VSkvBCG4R8DKLRDVLp5jYRpnI/81YpweONSNw+hDAqtK7Vk54bddXudc2p5wklJ3mGnmT+X62U+HzoAidp+SHm9EuQ2zQ2wvJQTAq0Ofb/bTfHIYSwNcTTZcvL1F+2aQ5Dr22qLGubBUa+6TTGFSsJ8FylELpEoxsnfobf6X8TOMVfuvSJktO9GQ7rVrSEEMJWUA736hIjrRHOIix+Go5onKKvvXi9hL+3l0xL82cSmSyMtyqF0Acm09lYatjUVIT0gY2tjcXLS+L2+lVcsBRCCKNEfF0tvBO61qfzkIUvTq9BDiNPny/doaQrXoOYvSTAp5aSiR/6xIAloSSJdH2Ej9zzBjj5HcpNb1mKKz+EMFqcYhhtRpqL3uNpGO2TlpzcZU1LylNqp6PeBUqzCAv4cx6AtoN0QlgFCXTuX9MfZ+/ftthAHFH6QklJqbG/ukSGEMJosUBqE6p+/pml6RMMdz8X5itLOqJZ+N5bkpDHfb8XWvR+sMTop2wpbBKjk4WZNPJZB5vcc5TMdeDKf2fpnKUQQhg9Sp70tWfM9QSHnvY3KZlH71QvOe9xJQvfolOUP3t8ictfb/wQNokQ1ftKxjW3je9r+qPEVJhLh8irl9JNL4SwE5hkxl2vVejJDum+JaVQTjjqjm9U8veWQbtRiXvc/iFsA7MbbDq5+VeBh0pSKg+VTYMwl0qWEELYCSxy7y5pliNu+cSSBc8J5+9K2uSu0kJUdzSLpZ8p8SmEbaG9M8N/tsmjxfAOSExVgufel6B6ulIIIewMFjrxe/FPXc0YfpnJYveG6qzaKc8GQiMfmwa10yFsEwNv5J/olLcI5X5K8GwQGH1lql0lAYYQwmAwva7plPfDkg2ApLs27UP9G1nNwgESAkMYAjxXuuXtFdtXUXLP0vdKNqq3Ldm4hhDCTqErnuY7kvMYezX0SvHWOd3cvOTnPXDyKIRhcJ4ST5ahUQ08WFcp6SvBlf/CksS9nO5DCDuFyWSMvbI8p3vdxLroXmYT4We+pZQM5zAk3I8SUpXd4bDS60pc+TL8laKuGsYKIYRBI5FJzFKNvax6Bv9LpS4a5vgZWp9+89D/hzA0lJnyaMnE5+rXo//Wpcy4DyHsFLKPlSwx9jLqJTQZoOP/z1xaF3F8rlEuUln+IQwNLvtHlGx0ne7lrZykFEIIO4ORuOL0MpedbJ5U4sbnfrfwKU3qAnFScfy7TB6FMCxsel9Rarxbtyu1SVINIYRBIhlPbbL4utnejbF32vH/EpoMCekCw014EF5fyiCdMCRk4N+7xANlUuTdS0pSddgLIYTRo12uRU6NPUPcDARpspEtek7kTyh1cdIRuzd8xAzz47gQwkA4vCSEZYP7opKNsEQ9yXufKoUQwmgx7ObIkhi9yWLPK5lsN116ZOoYl/47Sl1l1ouLOkWdf/IohO0jpNWUoX62dMnS9PfARvgb//W/IYQwLoz6NAjHiUa8Utxyr1ajkvWc/mXXd5WpfOOS3ymOP72ohrANTIM0J8LGVg7LnUp7ebP0jzBQ6sSTRyGEMBJM+3KS4b6UmKf5yF6I5TvZfLekzWgXNJsIcfzUNodtw5WvBt93QRXJop4ThkDJddFTIoQQBo2Ti4z7D5W4LzUVuURpHubf/23J6edyLnSAcbv66ltkl522F0IfnKr0NyXfhb8vLXOPGx2tRXRKS0MIg8Vp2iIlHm+BMwzkSqVFyKSXqe/va0DSBX6mEkAVARd2IYQtIIflPiVufFn5XPnL5qkcvyQspf1uCCEMCsb+IiWndacTxt7Y2/1K43gExNr9G7PsuyilE7e/XkninqTBEDaN7wNXvl75Ela58iWsroKZ+EJTclJCCGEQWNwuVFJeZHHjumTsl42fO8WIW7651NUse/365QW8qiSBMIRNYcNp6iNXfvN9uHypTdmp0lIlpn85eRRCCFuEUZeQJ0FOnf2nS9cqrVJi9wclI0J5Bbgyu8DpSB7B50pmk4ewKbjyjb1Vjmrs7R1LclXaIsv//aWXTh6FEMIW4H7X2c4wHPFyxv66pVVnep+8pFmOoTeMfxfYcIjja+N7ARe2hFJD7VS9xrD72AA7zWukIxHVKd/nvy68A7xVH5g8CiGEDWIBUv72khKjqo7+hqVVjT2cft5UktzUVaY+t6oSJ16Hux56vGlsiM5RUqmgbzovhs6DYXc5WellJa78z5TauvLn8eySzXEIIWwExpOxf0HJqM/G2HOjt4Fh/KuSRfLmpa6M81lKepW/ssQtummOVdIyWEIig09yFdJYZTex2b1ziRu/GYGrRLRrHlYS109uSgihVxhjbUKV0lnUvlZSTrfOydXPZOgZfD932WS//bAAv7NkQ7INI+t9em+pMfak+codSmG3cA8rSRXWUmKq2VRXjaT2wpQ9GwtzKUIIoRc0EnlsSULS0aV7lbpItLtgiUv/baWuMvW5Us0eF3LQu3yT8Fr8WYkbf9rg01dLXbp5w/aRoyGpTtzeJvhqpb5P4Fcuube7ynsJIYT/xqLGgP6gpOc312JXJ4xTlPTdV7fc5Wlc4x+1zFytmzSyNi0PKTEAswbfKf+apbAb+KxvVrK5c6/5jpjauAlOWXKP2TCHEEInMOwGgDjZO1WITXdpmMXY31WyYHa5eNmkyP7nYu1qGt8yWPCd+MTs9zL6jyqF3UAPisaVL4SkBr+rPJRl8D10j1168iiEENaA8bp9Scxe1vszSrKRu17UnlbSTlR2fVdwrWsIJMnJaWhTKMXSA8CpjxGYNfgyuJN0NX4Y26eUdHW0sRTG2cbnamaE7+efTh6FEEILdPq6TYkL3ynixSXGrI8TzG1LTklcol2637XXtSAb6rMpnLZ0+vtK6RYlG6Vpg8+TcVgpjBceIwZe8pzvhoTTPrLyl8XG3MCoe08ehRDCCjSxSQuak7cmImcq9RULv2hJCdvflZzMu+L8Ja71h5c24Wr1/tykJAnxgyXlgfITpg0+KWUM40WPhfeUbFI/fOjxJl35e+E7+5HScyePQghhCZxeuAe/XGLsNcZhOPtMfBNvlxAoy7ltTf9eOHX5mVrtbiJxTz7CQ0s2LzwivCTcvrMGX4OWTTyf0D0+0weVeG7csybhDSVEo6zVpplCCGEhjJCSH0M/ZJR/tKQDXt/GScc9JyUnYzPBu0T7Xwvz2SaP+oVrVRtUBp/hZwjkJdg4TRt8m6nE8ceH74HqD+WVPlPJmWLoQ4Kn4TUl390QQpiLMbcSzRh7ZXLXL3XVDGc/uCL9XtP2uuRWJT9Xr/++keOgl7owgvg9AyG5S2hk2uAzFt7rMC5OUuK5cT/xHDH+23blz0MYToJoCCH8CqcuObGIS367pKPXJsvZTBazkHY9DvRcJYlVepH3zWVKjLsM/Yu7UHDzv7s0bfDpPqUwHhh2nSV5odxPelEYkDRkXlSycQ8hhP/GWE8Z8jLanU65o8UqN8mFS1rsmo3f5alJm11DRz5b6nMD4zlfr+Q1KMub7oLGyzBr8CX1bXJDFdZDYp6JdT47G7g/LI2B55W+VNqUpy6EMGAsBDcuKb9jrLjWN1m33uB3KmdjLNtM3psHQ/ysknI4i3ZfeB8lc/FSaPZzwlKDboKzbn3PR0+DMHzcj48r+WzVvN+0NCZ8p5WJDt0jEULoEUbq8JK4s7iyUqNtzZA3Yc44WQl2JvJ1iTI4r8/Gpi88f9P5hESeWZqeCyCWL6Y6bfD9vbEZjoMIL4y8EtMXmw3x9GZuLDjpM/rbmB4ZQtgyjJDaet3omiQkfd67rINfBb/36SWL6h+50CFnL/20JKbZV5KV5DyZ0eK7WhHPVjZcsTSbrS9nIq7W4eIzVDXy9pIN2idKekaMlReW4t4P4QCiRl1DGvXE3JS6dG06bj8NQ3zLEoPPYHZpmH+/xItBXdb5T2NT4QQlqUsXtln8XrkE0wZfoxSegTBMjH7mypfbIuSlI+TYT8jKVJPIF8IBQg24UzQDZTGz81dStm20pWUwuz75+llcmn627nd94LnLzqeLuTCDDcz9S9MGn5uYlyUMD9+Rq5aa74j75zSlseM+fHUpJXshHBBOW3p9iZvSF78pIds2FtRvlLhOu+xNbpETL+c9UFrVpfeggXEQNjCsZ14OwhlKvCmNwVcRoZRvDHBv85Rss2f8pnB/cOWrGBGGaVz5fdw320B+iUZXcmZCCDuMTF2ucxnxxt2qB1eWNwR03BMvldHedeLeuUs/Konjd52nwBBoUuQk+PHSvCoHnoZXlBqDbwMikXAMhsQ9YkiMDY1Kik0OJNo0OiaquPD94LG5W2k6CXMXOH7J98ykyhDCjuLkopuek4v/qhcfisFhEM3bd/LVxaxLLOJi5jwaXcfxG4MvYU+lg5PwPKaT9/z3IaUxJFGpO/f+NZsVcvLdtV4CPovLl2xqfJ4qL8y530UkmroHJeuGEHYMCUeawCh9k4TEvT2kJKTpk7J492ym+zpYyNXjO7Wdz4UO8bwl6jEQavAXbSh4MT5dYjBVR8ifGHpffZ+DGQvumWmDT7s2359xl9jG+8Loy80Yw4asLUJRjP5eeSchhBEjRv6GkuEubysN8eRyzhLDwvXd9UJrCiCjbE5+l14NP+vPS362hKhF1Q7+7u1LjcF8Y8kmYMjYFNqAeX3Txp5UedygtAv4HO5e+ueSxkgPLB2EnIUnl7j3TzR5FEIYPYzn1Uv65FvM7lIaYomRUqhPlpyCu25wIi9A7oJpYl2fSjX34ZmwUdmvU+BJS54HgylnYSg5FPOQ99HMWZg1+IzjpUpdbqC2geev6ZRJkTbEEvZUUIz9dS2D78K7Sr53IYQdQAz7qSWLmT7uytOGuJhZfBhNYQeJdl3CEMtOlnjWZVtb7+O1S067xuPuV1vv7z+jxGCKi9vkDBkblL0GAJHKhEuUxo7T7V+XbNq+WbpW6SDNOnAPeu16YIQQRo4+8uKtYpNHlYbaV1u8WOWAxecmpS43JbLzvXaGuesscwaC8dNCd5lmOk6TYqfixEPvqS8JsRkcMytu/rFUGszDPedes8m0IZa5boN80BCWsj4MpUw3hNACi7Evs+x3zV4Yuy4T4rpGbTqjzDh3/TxlydtMGG/apZFSVSBU8tbSMi56mwJZ7voOHObCgPFchR72MvgSD5WwDfl+2g8jlD9U8lp4gCR1jvn1tMVrNu/fPblLiZghHCgkkak/d6L8uxIX7ZA5VelbJXHFrhPazP33s5XPddnW1nhfNduSIpeNyXMh24RJVBwyPCNmLuxl8MkMhLFmsnNlC3U52cpHULmyy1n5+yHspZLFZjuEMEIkq32xxOA/oLStATnLosmJE+U/lnQF7BI/26aHce7yZ5+3JNP5HaVlM7vNz3eq7HOKX1c8vjRr6D13/1Vp0OXmaVM40Uq21P1QQuKzSwfRlT+LunwboLF0gQwhTNHUiMvQl2A19Hir58flzvVufG+X+Nl3LVnQuiwnk9H99ZJY97JJeBInPQ8Z8EP/TG5eagx8I2EXhpK3pK+hRH2imRAXvtdlsNIlS0P/HDaB9+AFJcmLB9nbEcLocPJycrGocZGPpdb2KiXGRAJf19j0MFYy5btCT4MvlyRGLvse8wR8tuTfDL00T2OW6bI8GxXjgG3KGE2tWseE9/tRJUl6Tvh6Iwzd87VJhNIkoT508iiEMArOWHJ64c7XPGUsJxj96C3Ery11fcqw2BsR+tVSV4bq5CWG+2uH/n9ZnO5tPrQ4HjIqCcwiaAy+16mESw6C+0ub1rHAlc/rJaxjIyxRbWwblk3AA8YzqKIkhDBwGPcjSgzn0aUxxeQkD2kE4tTcdZ26k5yWtoxVV4uZJkEG5wibrDJq+HYlJ+cbTR4NF6V5DDtjz0hKAtVuV4KXJkknKY0FOS3yOLwOjXZ2oXFQX9hwZ35+CCNAgpps2yY7f2ynMKEIp18JcV3j9MLQ3mPyaH0kewmZyPRe5bR+oRK3+DNLQzY6QhbCDwy+sq0/Kp2npA2y5kFjMfg+p0eUnFxthO9QOkgNdlbF5yp8Y2MaQhgwStBkjTMoDNsQW+kuwhhfmxVNUbpG7TsX9ZtKXSz4GhmZT8CIrOI1UCKpTPBjpaH21LcRsTHxPBl8XffkKZy9pDKBZ2PozYPg/jecyYbFd+K5paGXqA4B+Q023quEqkIIG4TbWpMZi7Rs28uVxua2lCgmqepxk0fdYvFnqIQ6ujBWDL7NAxe393pZeGEYUPHkoY5h5W1RquW1cYMbEOT9073R+6cyYejeI/c+j4SR0Dw7Eg5l5Yf98d4J5+jFEEIYIAyQWet25mranfbHhgY8St2EI7ru/GUR+6sSd6WKgHXxfjOE3u9ruLAkjOkTS1zMf+zCAJE0eeeS94rH5QmHrjnh65XwvpIY/5Dx/HzePh+blFuUhtpeeojY3NnsaSEdQhgYpygZ5CIxTWnNGFtlStwTkuCh6OMEKaHRIvbYyaP1YDxke3MVr5qAZ/AOY6r3gA3A0HCa9x4x9l6fEbI2TFrSMp6GMZ2gNFSESvQR8Fx/VnpKKa781ZH7IAyWtrshDAiLscxjGe6MpQSrIRqS/RCWMKvbpkUMuWvOUGqSztaNnzOKMv8ZbrkHq+D0JPavY90QE8g01TEUiCucwdQh0D3mhM+Ico8P1eDzRBgG4zl6/poEdT2F8aDg3pSzoZVyCGEg+GJyWZr+ZSiILnBjRetT7u7bTB51CyMv/iw2zfivg1MP17xTsE5+q6CkT3mYsb1DTIziXWEoeUPkGjT5IAy+HBFleUM1+Eokebrkgnh/1d/bnIV2+Owlbl5k8iiEsHWcyHSRczJ+UolrfKycv2QKnbK1Ptp8PrzEkK3bz95z87MY/Hu7sAI2C68o2Xj04clYF4bdhsRCL6fibCU0Ln0jfofYwVEzHbMjbHy5oh9YGnquwRjQg0HTqjF6DUPYOWR7O9lb6MQux1xnLNZq8M/7S31sXCTsOf2ZmLbOAubf6mTI4DP8q/wsf/cuJeGAJj4+FDwXp7qmJM991SSANln6GrPIGRkSTvFXL+kIyEOkgcwYE1eHiJbQkh9tpkIIW8bAGXPvnbyckIdkQFZF2ZrFWkOb07jQMdzV4pLeq3U3FHcsMfg2D6t6I2w8LKJOT314MtpiMyIzm5eFwX9LSQgCTvjusy+UhnTCd79fsCRc4/NQUmZ+Qnrld4dQm/d2aBu9EA4UjAWXMne+uvChD2XZD4u31yM7vI+yNe70t5a8X+smc92q5JTOaK9a8uX0qcSN63xIfd3dTzYyTslCH5rVNKNwvV8MvlN012OM18EchqZLo/fU5zLmsNZQ0cdCD4kQwpbQClODDIbnfqVdKKG5Usni3VfZ2t1KjNmqyXazaE7jeToFr5r1z4iqZxeGMbZ1KAgHKckT9iAT5pp7qnHpS4YbSmtdHiEJnqovmhyWDMbpB/epU/6tJ49CCBtH0pcFmAv8T0p9GMhNIyfBUBoncQt615yvxDjYKK3jTjdMxkhRdemrela4mx9fslFryt6GAE/Fy0o2RLwsTvuNa7wx+FrVapK0bdzrly8JMTBENl6mRY45pDV0bMLd87twsAhhVFjwDLngfuVuG5KbdR2OU1Irz3XcR892A1W+VJKYtk4Wt42DjZYkw1UbBTFK1y01OQBD2ah5b3Q6FL+3sOvp0BhQBt9GjNucYd02puDJ9+CJkEio4+GQ8iF2ERtC9/zzJo9CCBuDYRS71GDkOaUxZ+dP40SpO5pT+KVd6BjG1c9nbGV2t4XRE9NmANvU0yt3Uz7Gte+zHAJc9ZrWMPjfLU2XDZ615ITvNfeRULkK3PZaSfNCaGL0l6WhDiPaNXSK5AGSGBlC2BCajMhI1g1NXG0X3PkNppxxd9+r1Mfrchp0MuRWb/vz9T+Q7S9+zBiuinInI2gZ1lVm6veJcIqOjQz+V0rTr0sMl1dElYPT9bawIeQd8b77DCVNjmVc765gKBHPViohQtgQktuUT1mEL+rCDsF9LKHtNaU+hp6IQXNNMrhNFvqqyARXCmbDJZ6/KtzPLy85pV7WhQHAwHvfGXwjfJuSPDStdRn8P3BhS5iqyAvhlKlPwHlLidtvFt9PG/L7TB6FEHpF0gw3phOOJjVDH1e6Kk6/Wrjq8NVHG1eNWsSqbZjaGi+fgdOlz0DDo1VhpMweF5J5sAsDQF6CygMG/12l6fI2mwGbS+12LfjbQJ6KoUWMvXyCG5Ri7LcD75iwW0ogQ+gZ7uRXlizMyqh2JX7f4PVIDBLj7su43KnEcMhEbwN3pm57fsaDSm1CAwa9yCV4fWkI7tHLlJzc3Fey9afhxjeciWdkG6WE8hzE7W2wJKp6z/uo4gjLIYwisdOmN5uuEHrEaUus1RfuJqVdit/DAqICweK+6jS6ZTlnyQnfSN62YQPvvRO65Mk2my6thLnJeTK23b3Oe37Fkg2ITcyjS9Mw8hIUnfA3bfB5U3hRbDY8P5uRdH3bPncouf/PMnkUQugcC/N1Sk6/SteGOIClC0zosqF5fqmPcqvjlcTwGbHpWPUqaGvMBf72Upsuh16XOn55AGLk28R9pSeATRbNNlixyfReSTK0WdoUPB/6+wvxMPYSxrSQDtvHPS+nQ3gsCXwh9IDTKFcyt6bFb4iTy7qAEebF6Kv9rAXKiFsu7Ku50AJZ7RY8df1t8ih4Zp5Vckr6cxe2iOfiFM2ois3OtjZuxuMqy2sm6PWNz4g3QfKmTYiqiOneAIvwenxXYoj6xcbQ/XvJyaMQQqcwfk2yGIO1q/XHFus3l5Rf9VUGZoiNjRP3dRvDIJfiMyUJZGdyoQUWTDHzv5o82h4M5J1L7iuZ+rMLuIS+pg5/EwafUdcn36hknxHvgg3JsuEXp09NjT5ckg+SUbn9YD1yT7y3tGu5RCFsHTXbnyhxA0s829XuYhZ88wGcwGVj9wGDwpBwF+sytyrNpkToQZvXNmhg4jUafrTNBdN9ZGwvg69ds+l403Cjc+d7v9publZBdYZKFHF70tZ1FaPt/nlEyWaqUZtqirA/R5Z4hi41eRRC6ASL2IVLsqXtqpd1b44VSWQM0FGTR90jGexVJcl73tdV8d6bh2+xk2TYBj0B9KcXvuijBHFZGHyTCr3fNkDCFdPIFeHJcO/N/lnXyMg39c7Gw8ZWJ8kzlFZFUqTwxLTRNzwpdIvpjzZl5hns6gEkhK3AyHO5ihtvKpa6LWRiMzLcsm0b5CyCweZSZ+TaGoImhtm2a5/SMk1uflza5ufJu8Cj4r3Q7nd2joGGN8IrXy/1OTzH85CkZz4Ez4eESKN527y3Pl9u/WmDr9GR8EToDp+N0IsE1mTsh9Ahtyg5tXyyNISpZX3CyDP2Tg9OEX0gP0A/9reVlo0PT6N23ULHJd/m3zsRPaHUZ+hiGTwPyaAMvkmFs96GxuCbTtfHUKMGSXr6EjDMQleSB9eZzua+kQMwbfR5ddpsIMJ89JTwmQ1pGFQIo8YX6S9KFmX145LGdhkntCeXuMyPcKEHGGkJR0IkbVzVDIradL3F2+QBgPual0DMelshGidrLn0bDy1/Z1+L9r82XpIU++pdbwPLYHDjc+fftLRuJzffEdUs0wZfSes25wHsIsIwZnsIT20zNBXCziCTXMxYYxSnlIPQ1tKizxhK2uoDBrZxZbcpjZMNztvCS9B2CI5ZCBL/dE/cVuJec8J3Gn5uabb6Q0KW1+jU3ceC7mfet2RTIWSlq14XmfUmGeq5P23wfX/uWgrd4XvkMGLDaDhVCGFNGAPlWxYs3d30hN91xLWd+JzS1nHtLuICJYZOB7dVk45swl5Y8u9na9eXRbWAZDh15uYIbAOv+54lblnjg2c3HkYVM8RCLF3PbrBxlQvByyI8Ih7cZuTwXkj206Bq2uCTTUCbEEyYj0FGNq6vKK36PQohzOBLJDmMwefq7ssADgkuWa1nGYM+GvBAroDYNMOw6qlSmOXuJV4IZW1tcJqWnMagbmsSnY0Llz6D+9DS7IKt7NAJ34TALkNJNhY2SpIBhW7E7w8rdRUHVn3hfZ01+JJB/Z7QHb5HNlIaNHW1YQvhwGIRfGSJwXcKOwi7aK/5pSWuQglyffGkEoOjGc+qGI/r+T2t1MZQMbY2crwE13ZhC3gONi4MvrGnHk8jaY/hNJ2xbSviWfwODX54Dbz32gwLHcz+7nW4cclrkug6nbzn8VDGEu8K3PqGGnmfr+5CCGE9xDYPksGHMbJesxhhX3BZO6V7X1dNnBO7F3t2umkbZpE/YNNgwdxG4p6Nyr1KXPre51mjyxB7jQx+2+TEWZqMfK9bmen1S12GqXw/jB6WnyGpcjqW73cqcQ3dwqNiM6V3QldemhAOLOrFGaYXlLaV4LVp1GE7pf1tqa9Njri0sjOGZ9Wxqwzg50sylNvONjhPictc3/htxJYtzg8oOZ2J5c8u1squVCMo2WszKGgWPRaEpRgH4RpdI7sedytUwvDYLEqIlP/SGHwy7S10i3CPoVS+R115gkI4sKjVdmJxMjoIMXyIq0tq09a1q9PlXjC2Tn6rzuC3CXlJScJS2+mFXqOkvXXK+9bBif4xJfcWgz/rZWDwbYjeVVo3sVAJ1z1Kmg15z1Se9FFx4j3lkRAuUIFgyqT/bwy+5LJteFN2GfeR0JZEW8mwIYQ1sPA6FYl7HpQsY6fNZmBQ2571y3DDktNgm+Q7CW+Myc1KbYyIzZtNg1P+tjruaWHMe+S1zL4Gi7dEN6NQ1zH4vFJKLSV28SbwVGmB2wdq7SV82lgoFTtjiaeoMfgSNQ9CpcumMX3Sd0GZZQhhDWQWMwpcZts4CW6L25YYIzXzfZ3KNN5hEN5TWvV3WOQYMF3z2sQu/T6nXh4GG49N05zMGMK9GgBpR2t4jvLItln63hfzEYw89lnqbiiU0dfnqb+B56wCgPHnWeBBaQw+78K2qiJ2GY2ZeON8j1L6GMIaiBErHxP33PXWutM49Vqg313qK5Th5zJoToSrlhVJ3BPjlmfQ9tR4eMlrfOzk0WZh8DXcYQj3misgj8IJ3/vfdqN5zpLyQ14U8wOuUOqT65UMRlJKeLySDcfzS43BJ27+0C3uJTkTOhq2GXoUQjhEU7PNMBitelBwqnQ6s9Hpq7UrZKozSKt23WNQdKHTEraty1u3OScjRrWPYUGLsEnRUtdrN+50Fsb6OyWZ7m064GkupEGRny8fo++5AYyOXARhoGeVmpOm0kPPoTH4Egf78jAcZLSL5tb/s8mjEEIrLGQWKQvZNly/28LrfkbJ625TK78sEva45p1QVnHNS9xzelS6puNYGxh5SXFc0LLYN4mkudeWuNrlIczC4Iu7yx1ZpQESY6oC4nEl76v3x4ai74RT7nuG3u98YKmpaLlIybXG4Juj0CYEExZzphLviu9ECKElFlBJZQyf5KqDslh53TcpiXHrBNfX62b4lNgxuqu4rpvPRUKljVibUyOj9OiSHA2NbjYJr8QbS+4rSXWznL/EpW9uwCqtdXlm9I4QJiF9Brrs1DcPJWE2T37nzUvN/cLFPN15j7eh61bB4b88KhopyTXqq0NmCAeCJtYrc/2glOZBghVjaF57Xy5vhqHpereK0WXgeR4YGCVgPBKr4mcYfyxxUG/5TcJNL1TkdWuAM7th4fkQbpBwt2x+g1M2t7pQgNOeKoBN5Z2Yy27jdnRpOldADwGGqDH43uuUj3WP+8fG3P2U9zeENZBx7LRl4TpImfri5J8u9Z2wKJOcJ8Fpe5WT+tlL3N7qu9tmJ3M529QI22zSe+OUq2adAVTCNvu6dcXz2rz/y4QbmoE4XynZnGqAs6mRtJ678k3G3u+fLnMUenleqTH44sw3KoXu8T3y/toAhxBa4jQmy5nb2Tz2g4JTs7I3p4a2k+mWQVIgV68EtVW6v3Ej+1wYxbZua5+tjn28GJtwfTecrGQDqWGKlrN7GXybTKfm/TZbEkuvVTIf3QZCkygeglU2T+vg90gKlCUu58Bra/BntysxRI3R/+tSG49MWIx72ffoLaWD0hU0hM7hxtewxEnwIGXq45olBl+b1L7a7FqcXlXinucaXhan+r8pMYyrdutrsMF4U8np9LQubAin9o+WnMaFJmaNs6Q9r8uJeZFL3715uZJSOH351drrPrhJb4X7Qja++0Qi4mwMWb93r7Mx+AzSQQqNbQrfI90r9ULos7ImhJ3G4ik2akGTyHaQUO8uJuzkJkbcB4ydxDvvr9PgsidTn4vGQE7JpoUt++9meVRJ8p8pfJvCKbgx+Fyxs89dHb5NiB4QSuz2wimZcdeNj7HnMTCUaNPG1KZJvoBTvNn6s217ecWUTzYGX15CEvf6wfdHIuh1J49CCK3gdmUUjHXt66Q7RJyinch4NxihvlBW5GTihLisO5KR5Mpm8PeaOLcsYsqMlU3dpmDwP1KSXLeXwT9XSe4Eg79XGMlmh9vfic7rZ0SFXboeiLMMKg6UVSoxVBUw2whJyIHnoTH4Giat4skJy+M76n54ammTXp4QdgruXicund36GDwyVCwazchThrHtKXo/bCwYBW7seSfaveDKV2uuiU3bjnsS92zm9NbfVOxT0x9u+HknfAmJDL6T8WwM39/Vlthp2r/Xv14pXBdT9drgtM4D5B65Y2nW0NggS4psGvDY5HDzh+7hhbP5M7fgIK1TIXSKUwyX6SIX665ywZJkMNnwfRpEc/i5pmWtL4tEJVPvdN1TVdAGJ2glcJLeNlWFIUHwXSWnsauWZg2+kkgGX6a+sMo0DOwjSurbPe87l9q+9i5Qay+h1Wu5cWmvTeG1SyoxGHybqyNKfW0eDzLeU15I77F5DCGEFji1PLtkUdt0k5Ztw5h8ueQk2WfslRtbprf3edmwSZOoxE3cdjCLk7ETqp8xa1z7wu9Uh28jtVfjICV1PEo0/Zx8FnctCX/wbChl3HY83IbQKF/Ss2IvhGw8Xwaf4TcbPy7nfpAE6j2+z+RRCKEVtymJ9e7VCnWXYYy02ZVUdxkXesLpWiKbUjRDi5blYSULnMS9NthcGGTj9cl43wTCDyoMeDRuWZo1fkJITvcMO2MJzY/U2kuitPFU327U7bZPyhLEuOmFH+aNGuZeVvrI4PsOCRONoTTPcxzbxuQ0JZtXMyLahrlCOPA4yYhTqiM+aKcTLlhJWTLa+8J7+sgSYyauviyeGyOih3tb4ydhT4xZedkm4JkQg3c/STicvZ8s2mqqLdyMqBwHHfmElGxMdH20Kdj2fej3e89suPRDmDdrn+G0aWwMvs956Abfa7PB4mWx8dKVcdubq2Vg5OUauXcOWvgxhM5Q2+qLr0PaNrKht4mscu52meV9VilcqsTgO7Uvu7g2A3jU07c1IvIGGF8n/U0YIsbEHHzGTzx+1nBbqMXFucEluInzy1XwHN9QsgnYtrEH4/LEks2gao5FLZiNz/X3bKyeVtpUguQ6uB+b3AOSVDqGXvXyOtxbmZ4XQkuaUbl9j4wdIoxgE3Oe57btAm59WcZi6stmGTOOktcYxLaLsTIxGe86922ijt1mRmjIomzK3Kzxc1I2CIWr/AElz4uxl+in9Goop2Oflw0II25C3yIXsvvGxszf5aEYg8H3nbfJbQw+ef7LzjfYFryRNs7e56F7UkIYLE2rWTv/gwa3twVPzLkvLE5qiBm6Zev+ubvFK3kg2ibuMbA2DdzoMv83gSEzDD6DOWv8lO0prWJcuJQZe5sgOQZDWsBVOHy25Dtx29Iir4PNgU2Ze+h1pTEYfM/xsaVpg09CKyp3horkTl0aJdoO+XmGMGi4yLgljWY9aMiiZ6C4zvuMZV62xI26SjzdRsxz4/pugxDNO0vKmS7qwgbwfjqFKfecdYUr2+PpaAyM+LgmQ0M7rV2yJIlQvHi/ToWeu9JOr+cdJRu1ocPb85SSjVfzWTTiNh8q3uunlySFbup+DmHnOG/Jl0iTljEk8HSJUjLleUIafZ4a/B4Z3+8pLWsUNJ6xEWtbiuRkqn7Zwu5nbQJ5ETwKTouzpXVnLDHyDIv3wsz8oZ2IvWfCEsI8Tu7LlDTeo+Q1GZQ0hpOn9/z5pWlD38jQpW32P9gPbcBtgoWEDtpaFUInWKS5fi3GYzihdI3MckZxXr11FzAkSs60821K0vbj/KUmca9tMtuRJZsG8/nb/oxVEDrgtvc6p0fZmgIoHs6QcuU/pDTEJFHx+seUvGdO7svkT6i+cP98srSp0Mk6+I67p7xG3phZoz/kUbQ8SO4tnquDlmQcQic0rl8uzMNcOGBcrWTxMz2vT7jmGTtx4WUQS+Z5UMPftsWsTQwjy928ifplxqQZfGMIDsS5eSnkIzAoNjG3Kg0RvRLeXBJ+YfiW8UCYEui703cTp67wHIVc3BdyWDz3aYMva3+or4P3wffBAWVeuWQIYQFOfk6AFrkruXDA0NddS1eZy31mszMmzTCdZX4P97AQgG5vbRP3/DtlcNzTfU0GnEac9cUl95LuaKoSdKATE7cJsOFpGvMMDS5ip3XhCO/5su2QJSN+pqQCYb85/0NA9YbnytBfvPTnpWmDz1tx79IQcTh5dYlnQl5MCGFFLHRaoVqk73vo8UFCDb5Tqdn1fXo4GMM3lpzal+m65++/sORE3DbcoNTSicjvXDaUsA42jw8vMexO8Zq8OPkqD9QPQNKek+WmcgpWwX1gmBJPhOqBZd8vm5q3lmwS5CkMGZ8PT5PX6JSv0ZH7zCZ02uj7nNp6lfrE89fRkEfOUKMQQgtkvdo1v7TUZxOaIWKDI3uekXLa6RPDdPyeZebUe14Swvz9ux16vCqMkU2Gz/byLvSM59gkGxr+4yTpd8tfMPiEYWTwh+jSV58ufs8DIa9j2QQ8YQy14f7d0LPHeZZ0b5T4xhPTvEbucfdZY/BVdjQhmSHh/tId0HP1GY2hDDKEwSFerAuaxCMx14NGMz3PIthncptGLX6P0arLYMysv992zK3Tm9wECyQ3eptNw6r8UYlB4Rpm7F9V8rptPnSu83os2kND61/jfZ1+bUiWvQ9skNW188QMvQucz8C8A8/VnP/p0JJ2yI3Bd78MsUTP/es7wWMk72gMVREhDA6xMb2quSXP6sIBoxlJK8O8zzaj4ugfL2nsskxMXQxe3F9+QZsYPKPFeAnXyNPo23uj9l54yAmRYecqllkNz/9tJdeH5tL3PtmoyDX4YkmFxLIwQvIUvMf3OvR4qHDhu5eEr2Y3JxLihH4YfBu2h5ZsGIcGT5G8FHkT8idCCCviiy32audvoMlBgyHU1IOhctrvE33mGb3zTB4txuZDPFnm9HSZ2ypcoqTLH2PrhNcXjL1ENy1zne4tyHo8NAZQTPhdJa9drHxIcOcrFeSW1yVw1QEtf1LyuvTT79NDtC6SEvVAsLGZvc99TjpCNqd8YYpNVHasitwKGxNd92xgQggtEOO14HE3D3Fn3zcm1DmlrTOhbhm0kvV7lum6x+X68hJjIuu9DVzVGqqsOqJ3FcSx/7jk9Oh0yGD4fdOlU7wo7y1x8/edK7EqnmeTX6Cpy6r9KCRVOjXzaAy1PtxGxD2ujp2Haa8NpMz35vPT/niIpW/Cj5o7Kc0zZCqE0AJfbiVJTpSbKOEaGjKsuc/Fmfssz1PjLHNdZcB+LnaLtIQ9MVWlUm1Ojz5LdfhKDy/gQsc4BdosMvY2jJ8qOUEKD52h1MBbITNc/HXZkrdN0Zx8uYqd1lflnCWnTt+dPkNC6+Beu13JZ8TTstewLJ4OYa3Gra/r4NBQ+mid4vVaJfQSQphCUpgsfe7fg7hzttjJY7Bw91lPzXvifWaAnVb2o2me46TfNnFP73Thmmu70CE2RioOGDqGRNIbg+m5MuzTA5kYQu5+J8xlqhQ2hfeUIXRC122yTehE8x0VCTZy/n+I8FoI2zHk7r95CW9i941bXx+IoWXCc+M73duc9x1+C2Gn0XXuoNbje70ykxnG67rQIxKmvM/LZHXrDfCtEjdsG5e813WbEi+BxbyrGDNDwKBz03vPnPA1bpInoJzQNbH65j5iCJ3+naKHNJlRboEeAd4ffQ8M+VkV/8amxyZuqEmvXufLSl6nGQvzwhZ/WHJvMvg2mk3S5VDgNeJBcsKXIxJCaImFy0lFDXWfCV5DxQKiLOvZpT6TryxaOp29oLTf7/E5OGk5GXMdt4HHRkIiD0YX4QpeA0b7XSUne/eL+LD4NQMvRs/gP7LUvD4hI4l8XP19hBba4sTIWHt/bFTanGi9bsl+8hPkaAxxsyyj3chln4uSvHnhJPeHSpLmlC+nZUj4Dvju8MS17UAZQigsVJKWLArGhB40uDn1ItBprM+pYeLesuad3PfraGZhXtcl77WIUctsXjdxjwF3bzjZOwlyg/9paTpZzZ9zkb+y1GR6C1+IvUoGG9LJjFeC8WBEGOs2Gz1G8q9LPiPelCEa/NOXeFhsSjSAWvQ671pqDL7+HLOjjreJ5kY2v+7lZaYZhhAWYLIZl9k6U9rGitf7qJI8BvW+fdIkUC3TAc/ceLFXRqXNZ+JEzvhy0a57umYUGXuuYQleNyjNuocZF5nUDEwzQY5Xg8G38RjKycxp/i4lhtrGpW1rZZ+JxjU+I2WXQ/zeSHDz3vNgqfhYtClR2eHebIy+Coyh0DTe4S0y6TOEsCZcfoxD30ZviDBoDICe3X2e1NThW7ieUNrPQBh44u8ytG3LvppOam0H13iOTTY+wyZBzaZlr1ptXgsJejaOTa202DCDo0TQhmAI6CppI6QVsA50bTu3uU80HPK+yAfos8qjDZ6fZEobWRuxZeLyWjI3Bl+S31C8FioHbEbeX0qnvRA6wIJtYeB2HsoXfVMom+Mu1LpT5n5feI+dUnT42y9fgktVXFXCW9tTqMloDJu+9qt+psIKDIZTsJ+hG532uPMMm+sSxMTFm6lmNjhc518uDWX8qgQ7/QJs8CSq7lcmuQgnT4bo7aWh5b94Xco6eWWURi5ThSIPQwMlBp9XoM8Q1yrcqeR1mJo3xMZAIYwSC7wvVrNgHxS4eZ1olP302cnLidmwFjHV/eqJGWidz3weKinawE1rw+DkvcpC6e9ep8TIMwDc+LLvFxlHz9fCbHNgrjy8RgbfJqdNJnzXeI7ucfFg74vWuutsboVKGMbZhkNDwElYqaTPw729zIbEa+BVak75Q5gT4J4TMuFJ0SBsaCWDIYwWcd9XlLhgV+08NmYs+jcuOfX13Wb4MiWnQiGU/bDgMrhyDNrgM3xfiYFb1qXOs6AXv7pnv9sJX+Kge2M/Ll3yHrqH/H3NbZq5AEM4LfJCGHrDCErUnG4S1AabQyEL5WJ9bhTbILnNa5RkqfR0WU+GTWZj8FV4rLMh6gLhLCEwBl9y8TL3YQhhSXRpE8tXv32Q4PJknNRl97moSGjj4mYE94vNc+VbsMUu27qeeRQs3tzP++EUqP2v069/Y7OgQ96yCWka7TCAsrwlgsrcV5KnlG8IExl9xh8qMfhGra7rhue10CtBnHxotesqEWz05FSsUn1zhRLj6vP3uvbqzrdJbEBNjvQ9kD8yxOTIEEZN02Peie2g4PQnf4F3o6/+87CZUPOvhM1QkEVwrTthc7O2TXrjtmbgJCQuwvAY0/WEG5zstQEW2lnlhGdTIvHLhtFsdfePxjSu7VeKuAlsXjwfz49HZ13cM5IqeWwkfg4F983jSoy2ToirhBtsYoRh/FtSkbFNhCZUD9l8XNOFEEL3HFXiqjwoMTOGTS3yJhZvhofr+7aTR/PxnJxEGeCru9ACrt3mlL3X6YiR1q7UKUq+gNf//BJ3fBtuXbLBUCGgFEyM+/WlbRt8huMZJUZM0yBVEOvi/XxNyeb4Ji4MBJ4hht5J/WGlVb1DNoeNwTdnYpunat0aeVF4KkyBDCH0AEMvm9zu+qAgyczpz+moTzSk0YDHe7tfrkQTx7cBawO3NWMvjDA7S1xFgsxsIQO/gyufgVhnrsDZSzYNTvXaFfNOvLi0zSx2XhWbOMmHjLM4fttSx2n8XCEghvVIFwaA52RDKTwltCJnZFV0afQ9YPB14dzWZs2G98Il3xVVNMo8Qwg94VRkMWtbxz02xJltcsSu+yzPY+SdDLlO9xum0xhQRrtNHN/pjKveAn4xFwo/x++1sbGYOtnbEOgYt242PTe3ZDFd7LRoVaYnhLHNzm3uY7XyPA8+37bei1kY1yYJUEvhIeC1PqfEg6TfwOwmbxmEBHgIGHz3nk5328C9q6Oj8NdHS6pOQgg9ovEKg3AQ4vlOFDrbcUN34fKdh9/jRGhR3q91rpOxtr/c8m1P3k0Iwe9k0P1OJ3Cfq9iobGyfc1eu20eXbBTfXPJ7hSW6OFG3webGpD4lhjYfDHNXz8X7db8S74hMchuAbeL52MzwZNhwib+719ogedPrspkxb6Dtz1kHGw+hIZtV3rA2m5cQworcs2SXPaT+2n0hMcgi1/dccO5JRvxZpUUnd0bEJoQrWky8Deb++11O3k7bEhMZZG1v71Xquu2tTG/voYXapuKvShbvTcNInbzU9DNQGdFlJ0kGVgmj18qDsG2DbyPzlyVhFGGadab4uSdsfJ3yX1faRi6PUIJ7371q06iCKISwAYzXZCB2HcbR6UgSW1cn3r0QMnhHiSt9v6oAffUZFSfnVU9aXoPXpBzN4u3Uxvi/tWT6XR+xdQuzTUVzQtRHoE04Yl2ETpxyhU5k56tH73LT6rOwMWSQ5ClsY1PT4Lkw0u4plRZq1tfxZHjvVK24Z3hHmvkIm0TliFCWzZpEwjTdCWFDWFCMFNW9a5exaFtkGKw+m8UwxFq7ipFyOS/izCU11Z7Xsot4c7oVA7VwO/VZOLXrvXlpv9yBdfDaxJEZC8bwIaVNn369/rOVlBc2SYQ2Pl3idwiX8GRo+7pND5j7VoKnZD0JbquWVO5Fs5nh3VPJsWkk7GkAJezEk7JtD0oIBwoLOcPDxb/LiBuKPfc9LlitutPYU0uLFjNG3mZLFv1+cXyLvIlipp05xfNWWLSFBPzXpLhNLJxa8zrd+53ul00v1tzBWvxySzOAekv0cUIUvmCQnKy3WXoovs0r5b61+ehiqpwkOd4Rn6GmN+tuIFbB/WJj6vuhJK+LDUwIYUW4orlq9VbfVQydYSDFQ/uEgTBOVub4oux4Gy3Gy3NiSOehK5o4vyQ8Jz0GlztW/bmWwU5q2t7uVwrYBbwLNiies34DmzYWPkPeDMZYKKQvl7TKB69TzFynwW3g/pBUq6e/DY7QRRebGz9Dpj9PzQsOPd4U3ku5F+5hdfjrtkEOIbRErNCuf5l2rWOE4VTDbBFXZtYXjKCENtnj4umLcJLkmuYNsMBP49RvKIypbU5DFkn10xLJzlmysRBXNzWNUdjE5DrhENUF7pPblzZp8DUbMiGQq/09JVP7Zt+zrpB86T3XEXFbWeQ24Vphe70SM33mXb3fGj4JBWlWtMk4/rlL8ltsNl5bGkJr5hAOLBLJnN52cefthGhWupMb49EnDH2TlLRokZbYJ6+AYWHAGTA1+maym4Yn1MLQM+gy8TVPmXYxS5pTM+7E21Ud+iI8X8/Lgq0ccFMGn9E1FtZnJ/4r9ttnTwVub5srkmS2DWTj25xy5z+9tG4vhWlsDr9akujpntoEPFDKAt2rXpOQUJ8b7xDCEojrOXVuMzu5LzQbcjrVLa5PnIQZJiezRe8jd6p5805xGuQIN1iIm9I3Wfi8BRLT9koeY3CvWrKA+rd9G2AxZK5YBt/mqa8T9jRyHXxuTdxZgmnfw18MCRKS+WZpG41hbORuUWIcvW4b8S7zJfysp5Vs7iWAbmLj5hCh+ZXQoe+G5L0QwgCwE5dYs2sYbGMRVW7Vt7HiemeIF83IZ7j0+mfImmQ4oQCJeT4DMc/9TkEW0qNLsvb7PPVCmKFxyZqg13cNtQ0RY2cT1JQe6m/fd9yZF0VXOnMnuu5nsAy8Clze7gcVCXrPdw0vlI295kJ9l1fa9PII+e75HOWc6B4YQhgIDA7js0uoT5f0pfdA37PcGSqL230mj/4HGw0d/25aYlSU1vl7Mu8NuJF5zuAse6LjKjUMRUJf3/PblRLaXDD4NjNyEPrEOFjZ+DZDfqcT4ibCTbwp3lMbjAu4sGGuV2IceXruVOpjg+P+F0p6d6nvjZtNr0TWZtNmqmGXHosQQgfYlTsFbDKTt08Y20eULKSHu9AjTu8y6G0wLG4Ms6xrbVudWLlTue21TPUecx+vMvK0wWuS7c8A9z1qlPFrKgUY4AeV+vCUOHFKLJMg2Pwun5m47yaa/fisdIHz+e2XeNk1Nm36C3jdes1LIOzD5e47zQslT2S/kc7rICnwiSX3Z3O6FzIJIQwQ8W7GScOTXUDtLwMr2a1vt76+89478XXlSAyIhdx/lUY5vclU1sTGc2o7wlfCnn/PSPUZjxV3dUJz+pRA59S2Tue3vfCZaDZjA8RAMPakGsGI2E0gjCJ3QliLp2ZTMMJ3LPksbXD0jujzJGz+gk2n/JE+8HqU+rpXfIY8azxYfX/vQghr4ARg8VX3PXacLmTGK0nq2lg1WNDOW3pKqTFY3j8LntOOoTZOqo1xVl8ufMLItFkMm4mAEuq6zOaexanbZkX8XiMYz7nLLG+udBn4YufTxt7pUHOhTRkKn00z4EWjmE2h1NAmymvmaj99qU94ExhjQ2y69py4t5u+CT5L76V2zNvsXBhCWBKLrXjzUEaGtsWJScMRhqtrV6YcAW1ZDQeZNlrK6rijnVD3MlqMNNf+Z0ptkpn8TO5Zi2qfY0/1sPc7vB6lgwyxcbldIASiV7x7rDH0jdTdb7JU1Pt5t5LTr3DJJhBTN9tCop6wCS9H3xsc3wV5Ee5VTZW6ROKhvgm+A7xaXPl955iEEDrErv2lJYlbY0660dnOYi5HoQsYI41oZFQzgoyU98gJ34AXRmxReZfTlb/LVd42dKJ3v8XVKaoPGB+lYt63Zo55U6u+TtKXe0ooQ5lfE6+flvfR59VnqGIWv4ungfE9qtS34fX5+33uFe/vk0ubymLnVfI7eZ26QlY+DwkPkM+Q56nvltYhhJ64WsnivKgl7JDReEdWvFK2Nv0GGATxSQldDKxWt94P8XqxZrPGGW5/T9kdQywzeRHc5f69f9sGJ2QnQ7X/fTQ0scFz6vVadP9zInUi97hNsqD3xs8wyleoY9bQk4Qym7Ku3c374bnxYPg85EX02ZPC75LF3tSoe2/PVdoU5jP4vbo9doHXo0OkHAyfoZwPbZj73jSFEHrEIiw+p2xqbC0yZWHrTa996iquTK9ZlzK14IaaMEhOR98qmYEvIWn2vdAS1alfzHvRoqepDcMnQ7uNgfGzX1fictetr2u8Zw8vMQ5CIsIXXLROpWbS+/NlYBDkTkgY4+bd61TvmoYzjH2fxnYenqN8FZ/tC0t95Xr4PT53rm+bC9UbNk+ubwpVAE7iPsN132v3oJwO+Qc+Rz/3MaW00A1hR7hMqVkYN30Sa4sFVUzdIrufl8LJlnE7X4nBa9qdygFwmpdp78/mlS76txKxxEkX9WV3Kn9Nyd/bb3rePCSYMchtvQSL8Dq43bm5NWthHCzwqg/8Tqe6/WA4nV65rA2EmTX0ZMPitOtz2eb9pAOd16oBTl+JZtz2WgbbODoJ+9yW3Th1hXvSpt3nsU7Lad8p960W0N433xEbur7bWIcQNgyj+LASw8812HfHty6QEc1oz5sY5jXocKZBjnauDLENgv/a3DBIesvvB6PI7W8RNPVuHhZMs8qVZPEUtEESolOVJLeucywYp3eWPD+ufXjfml4N3hteDFP8xG+dXCUj2iiI8fOkqNtvWvPOyvvDU2L+QB8eilXwWWh+4zkprewjns6wu4cka8rx8L710VFvP2w05Z74/PSJaIvPWbMuHh/vm9HPm+5hEELYIAyA0x/DLz6uLekiN/Y20bZWpzELbtN1j5F04rFQKZ9TuseYWZDF6WWkSz5aNUlNeZITD9ftoveDwbZgyvJvg8W76d7Xdc2605sqAomFQhoNNkQW+L2MOHk9Sga15N3r7/EOKA17VUni4RA2iz4j3hKhBTH1rl3S7rMLlhha99cbSkI/28BzeXzJa+X1aoPvvVwA1Rs+T4mcqlW63nSGEAaIBYCr2wmaq9CpnzEb0smfu5hrmQvZidrz4151opPQZwEU439XyclbrLPtAmZDYcOwX0tfLm8GW4e5tmNLm8Q6Wd9dImyhf4H3RvOiaRisWUO+jDS2kQfiNN02jNEHPmfNaNwD5hp0afB5DwxD4vrmjTF98I9K2wxfaI7jnpGHsio2vzbBvjc2dEITEjE3VWUQQhgIFjcnF4loFjduQwuccZ8WOQsft/heLvU+8byc8MWdnbydiJsTqBOXEwpXPxen7Hd/fx0YEC5bv2s/N6fMd4bwYpNHq6PfvU2MBL4ukUwm1qzpzl6lgzwiexn1vcSQ2tSIWdtIDQ0nfKEKz9P72JXx8nMltQkJ2QxLTFTqyB2+TXig3DPvLS27KXdP2yTry8HzY8PAs+d7k3r7EA44FgixWXW/XH8WGIu/TYDYrSxhJ8WHlixABsyo9bbYrmtw4edwc4vdyzd4R8mJm5G3WFl8ZRdrbep5dp2oxeXptWqussitLwnSpkPP/TZw60smZJy7ign77JqWr2Kz83r+O+1xD/t8ufG9p17ztLH3M4RKbCA2vdFbFq9XZz8GXwvkLgyyE7zui00lhfdFT4ttjN+dxabWyFqldKpQ9sPfV5orp8NGvvlsefN4wxbd3yGEA4iThBOCITaPK4n5OymI+VpoLSBODBYR5Uo8AwyycjjGUIzQMBeLKCPeyGPyZzrDcdv72TYUzax5P5uR555m8J2o1cF3cZqfh5/tdOw1moY3DxsTC6/YcduM7TuUvIdd9Uj3PJRXea9M9Fv0/BuEJ/w7BsTmzcm2ES/EUI09GCwJaF4vo7xuKMomjNvb/cvL4/77ekkSp83FtvE5+Y7wdC2aDigcZW6DTYvk1cbQN7KBFvrp6zsUQtgxLK5Opk7j3P42A0ICSrW42pssYAZ7erHxuNH09ebPnCydYmSwyybXDMSGo2mhyr3c50LlhGcOvxORDck8GACbGq9TpnsbvHcWbyVlXRgUmxDvmfeJB4YB22Uag2/T9JzSOnX4jORVSxoiuW/dj+4BIZBF+RybxH1vwJPP93aHHk/jO3mhkryD2aFGjbxXPHRdt+gNIRxQLMROl07Lpy6JFTKeYvEMuDp5LmWbBLHFW5ec3J0ouU719xa7n17QGFUn/Q+V+m7ywithUTWid5HbUxKbBdSkwjYwyJINZb97r9bF+8aVbxMhe33XXbbuDzF8nxUj1/a+cI9KYLPRbIyk/9p0brv0cJYrlmyKVZI0CYTuIyd6+ScSNhvP216Sk3Dn0jYaJYUQwlJY3DW8Ycy4m/uE8bVwOu0tcovbnHg++5XxLULpnAVaUti6aJYjHKJq4RIu7DjuCTkLDD5jt2poxWdmIyr+P9tgSF6DrPihGUabOs9Nkyj9EyRm2qw40TeeiXlynwkJ8JjNegdCCGFQ3LJk0bLI94m4te5jcgbkG8yjiamqHFgmXr4XRqtK3BNvXbfki0taiEFpIcNwEDD7wInXFMJVjLMSPm2DJS428fpGHqtQaVty2ScSLuUYCDeYEMjwN/kui8RjIUn0WqVdD/WEEHYAcUcLnba5fddDc+s7Mem+t+g0pDzPCbPtidrmQg05t/462fpOq7wF3h+bkGW6C+4CQkFe88tKy8TwfZZKUIWTbLRm49w+c82F5FcM7RTsXtFKWNjG8240/fz3ktfkHlNqGmMfQhgFEtveVHKi67suXM6AmK4T1KLTu2xnJ0Lx/rY07WHXces73XoONh9Op331lR8ayiO54xn8/bL0eWRs5DQRmi1DJO+dpMchd570ehfF6GfF1a8CxmZ5CJUGIYSwNNz5FjIdAvuEB8EQGjH6RZsLmfFc6IxI2xI29fJG5r6l1PZnMPAaxdh83KfU9ueMDY2PdI3bb3iOEztvjKS1vU7F3OLCAkIsQ0925MmZff6z8nrcD3pl5FQfQhglFmRGTflf3y5XMXGnKSVui9BTX+/6s04erY6Tl1JAVQhtY+8SDXVgs0GRbDZ0o9UVet1734R59vLEeB9Uh7yr5AS/l3F0CjYwSBLcWJLZVA8IZcy+Fver3hDyXRj6sbyeEELYE0lL3Pp993U3oIcxMLxnURe3K5W4iHkd2i6wTYc/C3UbxKUlDx5dYgQPCioTNJfRLGk6b0E8/8IlfRtULex1qndNiMiMhrFukMTljyrJO7DxVKdv0xhDH0LYCXSms1j37dZvTt5OUud3YQ661In3a2HaNpnwhCWlgE5nq5aCeZ7i/073xtq2bQQ0NrzvGtAoU2PAneCdcBu5R/Yy9CQMIOfBpi7GMYQQBop4LLc+N27fi7UugoyGBkHzYOS1suVa1sSlDYy2kcWy9VcdaiIHQPyfIXPKPyhd1HSVk/swa8wXyUbAaVi4JoY+hBAGDgPrJKxOvu+hJpLymt76i+br/3nJCdNQkrZcoSRUcfvJo+Xgiva7bTYYNI13hjTCtk8kJroPZo36PNkkmu/QRVfDEEIIG8Iceac1A2j6xClQ9ras50WxccmEjK7ysLZufe2EzSEQV17Wre80b4ZBY9RsTrQoPih4nwxcmjbse8lmTH+CRY2UQgghDBDtQcWsnfD6TriSUMetb1zvPCSJGeVrulrbpjc2Ck8rcVOfwYV9kIWt05wGMo1h82/bVguMFZuye5dmW8v6zHhMxOt1TlTDHkIIYWRw5yq10kq2b7e+hDqZ4Hrrz+vmxugYSsLA6P7WFqNYJQkuk61vU/B3pWkjx7hpBnQQcdpXo87jwStjM6SVrH75aToTQggjxkQ4rtqbTh71Bw+CbH0x4EUjczXo0djFqNZ1svW59XkLFg2D8Wdi/er/Zw2+UrUQQghhZ3DC5c52omtrYJfFSZGL+IGTR3sjqU/zGwZbyVgbvA711DwXJqHNQ5ze+NbZsjMu/b7bDocQQggbRQybS9uptm+3PgPu90gQm5dQxxNgQyDB73AXWnLJktCAuPRe6BmvB8Hs6Z70A1i1rC+EEEIYPNrIcut3MU9+EYy5wSpKARdlwYuf+ztPKrWNGysF1EDH6FbtXmdR66+18Ozpnj5XOiiNd0IIIRwgNOFx8n5dqe+BMerdGdm7Th7tjX7uHy39fcnM9TZIANTbXatdFQLTeI16wzfd5Wb1+tIQ57iHEEIIa8Gtr8vcOoNnlsXJWWxd7Hze5oInQPket/46ZWBCFDwFXtt0foLnYHMzW4JG+hKY877MXPgQQghhdNyg5DQsa7/Pdqlc9K8pycQ/nQtz0KBHad0TS217BPh3ascZ/XO4UPj9TvxKBGeNPdn0KOfr8z0IIYQQtoYkNUZQtn7fbv0/KzlJHzl5tDeS6j5W+kpJmV1bJP75XU+ePPovV/0LSnIW9jL4Ehj11Q8hhBB2Em59J+91htcsiz71SgG1aZ23uXDCNkNf3f5lXWiJny8JT44CQ37xkk5+exl7HoX7lrwXIYQQws5yndI68+SXpXHri+Uvan/LDc/gP6/U1q2Pu5QkCt69ZGKf17iXwVf7byZ+3PkhhBB2GslsBse8ubTqPPlVkTMgaW7RPH6Jdmr2v1VaZzobj4LTu1j+J0p7GXsufmWAi6b5hRBCCDsBA2smPff3ooS6Lmjc+jYXi3IGxPltDK45edQOdfim5+1l6BvZVFy5lNN9CCGEAwGjtym3viY8NheLcgaU1nHrK6NrY4x5LST/zUvSI0l9LykdrxRCCCEcCE5Q0p1uE259vfWd3m89eTQfmfPG+PIKtOHlpb0MfaMfleQv5HQfQgjhwCA5zjx5dfKL2t92gdO3qgAGfVFmPG8Dw3yryaN26Nw3a+gb2dy03UyEEEIIo0V3O270RXXyXSB2/6qSbP1Fbn3d/yTdfXDyqD1mBcz2zjdg526lEEII4cChrexnStrf9u3WN4dfzsDNJo/2hqtdQyB/rwuvwxVL9yzdo3TD0qKZ+SGEEMLOwsCqV+fW73suPFe6Dn8G1izaXBxRcjq/3+RRCCGEEDrhYiVudM1q+oSR14TH5LpTuDAHLXFl9Mu4nx6EE0IIIYQ14ObWkpZbv8/JcbwJ5vHLGbieC3OQTKhHALf+uV0IIYQQwvowsNz6yuH6ztY/Y+nokvK5Rdn6Vyo142tDCCGE0BFXKTl5GyjTJ7wJGut8o6RUbx6/U/paSc970/RCCCGE0AGmy3239MlS3279G5f+pXR1F+bg7z2spFnPOhP0QgghhDCFOnnlcAys2vw+0UL3O6UXlxb11r9QidfhhaV1JuiFEEIIYQqjZTWoee7kUX8w8krzuPUXZevzNJh4x/OgDXAIIYQQOkB5nhO1bnjHd6EnuOtvXtL5To/9RdymJHlP57wQQgghdIBT9DdLTvm3d6FHjOTVW/95pUXueu5/G5C3lxZl9YcQQghhSYyxfVGJwf9Qqc+mN0753Po2GBIG5+E5+HtKBhf14A8hhBDCCnCdc6GbKX9OF3rkBiW/x1z+RfxJSTKhVrs2CiGEEEJYk8NKTtNO+U8o9Wlg9db/5xKvwqLfI9Qgwc+Qn2O7EEIIIYT10OTm0yUGX3b8cUt98taSznv7ZeHbfEjyU6oXQgghhA54cInBJyNt++SWJb/nCpNH87lgyYCfZ5RSkx9CCCF0gD72BtcwxO8r9Zm8p7e+0bzPmjyaz7FKHy/9Yyk1+SGEEEIHnLBkbj2DL1nurKU+eUdJjH6/8MGdShIKrzt5FEIIIYS1UR/fuPW1tu0zee+2JYb80pNH85Hkp3Zf3D81+SGEEEIHHFFyumfwGdk+O+8ZyfuT0jMnj+ajJe+rSxrxCAWEEEIIYU1OUvpWicH/ZelWpb5gyDX6+WJpP7d+U5N/98mjEEIIIayFTPgXlBq3/gdLZtn3xb1KmvBcZPJoPvIL/qH0kVJq8kMIIYQOuGKJEWbwza8/d6kvzlMyuOeo0qJ8Ae1/n1YSAji/CyGEEEJYD+VvXys1p/ynlPpK3jtO6WMlTX9+x4UFSO6zOdAvIIQQQghrwq3vxN0YfK70vpL3bCQeWvpZSZOdRYjzf670qZKNQgghhBDWpOlwx+BLlpO93xcXL/ldDyst8iT4M3/H3/VvQgghhLAmxyy9t9Sc8vusgf/dkgE5Hy7prLcI+QTyCvaL+YcQQghhSfS7V5rH4P+odJZSHwghPL4kIU8S3yJUDMjUX6aUL4QQQghLcPKSyXkMPsP/gFJfXK7k5P7A0n4n96aUTzVBCCGEENbEyfvZpcat/9nSfpn0bZEU+OWSuv/96ux12zMy9zmluPVDCCGEDpC819TkK4m7TKkPTOYzOY9b/1wuLMDfNc3P4J3juRBCCCGE9ThGyam7OeW/otTXXPo/Ljm537e038n9niVhBv8mhBBCCB1w61Jj8P+5dPpSH/x+6aulZbL1DyuZ3W+6X9z6IYQQQgecqPTDEoNvnK359H3AVW8kr4qAs7mwAIN3eB7+qZRs/RBCCKEjppP3dLpjcPuAi97J/f6l/U7udy5x61958iiEEEIIa3OhUlOTL3lvv+l2bTEV7+slY3N/24UFyNaPWz+EEELoEMZVVnxzylcS1wfc+gy4bP1zuLAAXob3l8zv76tcMIQQQjhQnLX041Jj8H9aEtvvAy56uQLLNPrh1tfrX+OeEEIIIayJzPym616jvy71gd76svU/UdovW//MJR360oQnhBBC6IBmNO20wScn7K759dJzS0bmns+FBRjy867SF0px64cQQghr4vT8otKswZfId4ZS11yzxK3/kMmjxWjU02cXwBBCCOFAccmSePms0RfP75oTlI4uacKzX7b+OUtm5D+m1FcXwBBCCOHAwNX+sdKswacnlrqE4X5ZiVvfDPxFiPmL9+sPsN/gnRBCCCEsgZG0e53y6WqlLrluScjgPpNH8xFueHBJFcF5XQghhBDCehim4yS9l8H/WqlLTlzSu59Xwe9dxAVKaveV8sWtH0IIIXSAmncJdXsZ/duWuoLhfn3JBL2zu7AAHfo+U3p36bdcCCGEEML6XKW0l8H/h9JvlrriZiU/9y8mj+Yjv0AewfdLavNDCCGE0BGXLu110r9DqStOU+Kq10J3P7e+KgJJfrcqpQlPCCGE0CH62b+i1AzWoVeVupqmp7f+O0oMuRn4ixDz/1Lpb0v7bQ5CCCGE0AJufF3xHlW62KHHXXGbkg3FkZNH87E5eH7pOyXDfkIIIYQwIpzsNfd5X2mR54Ab/+olvfVveehxCCGEEEYCI8/Yi+Wf0oUFnKwkcfANJYl8IYQQQhgRty9x60vIWwS3/otL3PqndSGEEEII44HxdsJ/T4lRX8S1S/9euvHkUQghhBBGQ+PW1z53v5P7iUrfLL221GXyYAghhBA2QJOtf8fJo/nwADD23yvtV8oXQgghhIHhZO+Er33ufnX+1y8Z8nODyaMQQgghjAYn97eXxPJP5cICTlIyeOeNpWTrhxBCCCPjpiXtfO80ebQYg3d+VDrD5FEIIYQQRoPe+gbk6K2/31S8G5VsDvw3hBBCCCNC1v1rSj8o7efWP31Jhz4n/RBCCCGMjJuU/l/pdpNH85HYp27f5kAHvhBCCCGMCG79b5dM0Vvk1tdL/+4lbn3NeEIIIYQwIpzcX12ShX8WFxZwwdK/lkzRCyGEEMLI+LOS9rl3mDyaz3FKnyt9q3Q8F0IIIYQwHkzNO7r0ztIxXZgDt/4jSmL+V3MhhBBCCOOBW/9FpWXc+pctMfhPKGVGfgghhDAyrlH6t5Le+osM+fFL3yh9qXRsF0IIIYQwHk5a+npJ6d1+bv2nlWwOLuRCCCGEEMaDHvnPKumtf04XFnBEiVv/UaW49UMIIYSRcXhJtv5+I3PNyP9O6ZOlRd6AEEIIIQwQZXdi8x8oHcOFOZi097rSz0vnciGEEEII4+KxJYb8vJNH87lhSde9e00ehRBCCGFU6Kb3i9LDJ4/mc7qSMr4Pl/abtBdCCCGEgWGCnm56f3/o/+chdv++0o9Lh7kQQgghhHFx/xJ3/UUmj+Zz19IvS/u15A0hhBDCAPnDEkN+1OTRfPw9ZXxvLi3yBoQQQghhgMjQ/0hJxr7M/Xkct8T1b7zuyV0IIYQQwri4W0lznYtPHu3N/ykZpiPJLzPyQwghhBFyjtK/lPZz61+xZEb+M0s2ACGEEEIYEZrrfKz02dKisrsTl/Tg/3zJYJ0QQgghjAg98u9ZMiRHbf48JOu9rKQ8b9HfCyGEEMJAMUTnZ6VFQ3Jcv31JvF+ZXgghhBBGRpOt/4nS77gwBxuDH5X+tpRhOiGEEMLIcHp3ape8t6gJj82ATcE3S6dwIYQQQgjjwjQ8p3dDdeZl4bsum1+2/lVdCCGEEMK44KJ/f0mDnUVu/WuUxPEfXZoX7w8hhBDCgDmyxK1/icmjvTlZ6Qcl0/MSxw8hhBBGyNlKPyw9rfTrLuyB8ry3l4zMzfS8EEIIYYQ4sb+39OXS77kwh0eWDN257uRRCCGEEEbHnUqa8Fxm8mhvLl/SV//ppcTxQwghhBFyxtL3Sy8szcvWP1WJ6/+Tpf/rQgghhBDGhRj9W0rfKumfvxeMvOY7jL4NQgghhBBGyA1KSu+uM3m0Nw8o/UfpWpNHIYQQQhgduuh9u/Tm0jyXvXG54vgy+hPHDyGEEEYII/+aklj+GVzYg5OUvlcyWnfRWN0QQgghDJgjSlz2d548+lVsCt5UUo9/ShdCCCGEMD6OVzIkxxS933ZhD+5TEuvXbjeEEEIII0SnvWeUzMk/twt7cOmSmv0nluaV8IUQQghh4DDoTvCPmjz6VdTjS+77QGmeFyCEEEIIA8fUvM8f0l6tdrXi1Vdfzf5pXAghhBDC+FBu9+CS+fdXcGEGbvyHlLj9tdsNIYQQwkg5V4nBf+7k0a9y9dLPS/cqJY4fQgghjJRjlD5UOrp0IhdmOEvpO6XXl1KPH0IIIYwYtfhq8m84efS/OU7pPaXPlOb13g8hhBDCCJCN/9PSO0rK9ab5jdJRpR+XzutCCCGEEMaJ2PxbS2L1p3NhCol9f1aSuHebQ49DCCGEMFJuVPrP0l0mj/43h5d+UnppyXjdEEIIIYwU8Xl98z9dmp2gd9aSpD6teNNXP4QQQhg5zyoZiXuByaP/4eSlz5b2m6EfQgghhBFwqZJs/b+aPPofjl/6YInL/yWleTP0QwghhDACjl36WunrpelYvT76kvoYfG79U5RCCCGEMGLuV/plabrVrtK8vykx+KbnXaUUQgghhBHzByVG/eWl6RK8F5QYfHpyKeV5IYQQwohRk29Cnoz9E7hwiOeUGoMvgS9tdkMIIYSRc+OS5L2bTR79F88sNQb/30sXLYUQQghhxBii872SHvri95g2+GL8dy2FEEIIYcSIz6vJ1073jIceTxt8Mj0vhBBCCCPnciXJe/cvOeXPGvxPlpTrhRBCCGHE/F7py6WPlNTnP6/Eld8YfDPyT10KIYQQwojhxn9oyQS985eU5U0bfMN0zlEKIYQQwsg5d0kc3zz82RO+jcBFSiGEEEIYOWL0euh/sfSq0qzB/+NSCCGEEEYOt/7tS5L3PlRSm98Y/H8t3bAUQgghhB3gsJKa/B+Xpg2+TcAtSmmxG0IIIewARuG+ttQY+kZm4x9ZisEPIYQQdoTrlxj4aYP/i5LJenrvhxBCCGEHOGnpG6Vpgy+B79GlGPwQQghhR/jN0vR43EZPKjW99kMIIYSwA1y9xI0/bfBfWDpGKYQQQgg7gja62ulOG/w3lI5TCiGEEMKOIFv/jaVpg/+x0vFLIYQQQtghZOtPd9v7aunkpRBCCCHsEGbj663fGPyPl05XCiGEEMIO8eulD5Qag//OUlz6IYQQwg5yz1Jj8N9aOm4phBBCCDuIcjwG/1OlnPBDCCGEneTXfu3/BxH7OHOZmfvgAAAAAElFTkSuQmCC" style="width:100px;height:50px;object-fit:contain;display:block;margin:0 auto 4px" /><div class="firma-nombre">Patricio Manganella</div><div class="firma-cargo">Director</div></div>
    </div>
    <script>setTimeout(function(){window.print()},400)</script>
    </body></html>`

    const blob = new Blob([html], {type:'text/html;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) { const el = document.createElement('a'); el.href=url; el.download=`boletin-${a.nombre}-${a.apellido}.html`; el.click() }
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  const generarCertificado = async (a: any, curso: any) => {
    const sb = createClient()
    const anio = new Date().getFullYear()

    // Asistencia total
    const { data: asist } = await sb.from('asistencia_clases').select('estado').eq('alumno_id', a.id)
    const presentes = (asist||[]).filter((x:any) => x.estado==='P').length
    const total = (asist||[]).length
    const pct = total > 0 ? Math.round(presentes/total*100) : 0

    // Antigüedad
    const fechaAlta = a.fecha_alta ? new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR',{month:'long',year:'numeric'}) : `${anio}`

    // Horario del curso
    const horario = curso.hora_inicio && curso.hora_fin
      ? `${curso.hora_inicio.slice(0,5)} a ${curso.hora_fin.slice(0,5)} hs`
      : '—'

    const destinatario = window.prompt('¿A quién va dirigido el certificado? (dejá vacío para "A quien corresponda")', '') || 'A quien corresponda'

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificado - ${a.nombre} ${a.apellido}</title>
    <style>
      body{font-family:Arial,sans-serif;padding:40px;font-size:13px;color:#1a1020;max-width:600px;margin:0 auto}
      .hd{display:flex;justify-content:space-between;border-bottom:3px solid #652f8d;padding-bottom:14px;margin-bottom:24px}
      .logo{font-size:20px;font-weight:800}.logo span{color:#652f8d}
      .titulo{font-size:13px;font-weight:700;color:#9b8eaa;text-transform:uppercase;letter-spacing:.1em;text-align:center;margin-bottom:6px}
      .destinatario{font-size:13px;text-align:right;color:#1a1020;margin-bottom:20px;font-style:italic}
      .nombre{font-size:28px;font-weight:900;color:#1a1020;text-align:center;font-style:italic;margin-bottom:10px}
      .decreto{font-size:14px;line-height:1.8;text-align:center;max-width:440px;margin:0 auto 24px}
      .datos{display:flex;justify-content:center;gap:32px;background:#f9f5fd;border-radius:14px;padding:16px;margin-bottom:24px}
      .dato{text-align:center}
      .dato-val{font-size:20px;font-weight:800;color:#652f8d}
      .dato-lab{font-size:10px;color:#9b8eaa;font-weight:600;text-transform:uppercase;margin-top:2px}
      .firma{display:flex;justify-content:center;margin-top:40px}
      .firma-box{text-align:center}
      .firma-nombre{font-size:12px;font-weight:700;margin-top:4px}
      .firma-cargo{font-size:10px;color:#9b8eaa}
      .sello{width:64px;height:64px;border-radius:50%;border:3px solid #652f8d;display:flex;align-items:center;justify-content:center;margin:0 auto}
      .sello-txt{font-size:8px;font-weight:700;color:#652f8d;text-align:center;line-height:1.3}
    </style></head><body>
    <div class="hd">
      <div class="logo"><span>Next</span> Ezeiza · English Institute</div>
      <div style="font-size:11px;color:#9b8eaa">Ezeiza, ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <div class="destinatario">${destinatario}</div>
    <div class="titulo">Certificado de Asistencia</div>
    <p style="text-align:center;color:#9b8eaa;font-size:12px;margin-bottom:16px">La dirección del instituto certifica que</p>
    <div class="nombre">${a.nombre} ${a.apellido}</div>
    <p class="decreto">
      es alumno/a regular del curso de inglés <strong>${curso.nombre}</strong>,
      los días <strong>${curso.dias||'—'}</strong> en el horario de <strong>${horario}</strong>,
      con una asistencia del <strong>${pct}%</strong> desde <strong>${fechaAlta}</strong>.
    </p>
    <div class="datos">
      <div class="dato"><div class="dato-val">${pct}%</div><div class="dato-lab">Asistencia</div></div>
      <div class="dato"><div class="dato-val">${curso.dias||'—'}</div><div class="dato-lab">Días</div></div>
      <div class="dato"><div class="dato-val">${horario}</div><div class="dato-lab">Horario</div></div>
    </div>
    <div class="firma">
      <div class="firma-box">
        <img src="data:image/png;base64,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" style="width:120px;height:60px;object-fit:contain;display:block;margin:0 auto" />
        <div class="firma-nombre">Patricio Manganella</div>
        <div class="firma-cargo">Director</div>
      </div>
    </div>
    <script>setTimeout(function(){window.print()},400)</script>
    </body></html>`

    const blob = new Blob([html], {type:'text/html;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) { const el = document.createElement('a'); el.href=url; el.download=`certificado-${a.nombre}-${a.apellido}.html`; el.click() }
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }


  const generarReporte = () => {
    const sorted = [...clasesLocal].sort((a,b) => a.fecha.localeCompare(b.fecha))
    const prof = profesoras.find((p:any) => p.id === c.profesora_id)
    const _html = `<!DOCTYPE html><html><head><meta charset="UTF-8">
    <title>Reporte — ${c.nombre}</title>
    <style>
      body{font-family:sans-serif;padding:24px;font-size:13px;color:#1a1020}
      h1{color:#652f8d;font-size:20px;margin:0 0 4px}
      .meta{font-size:13px;color:#9b8eaa;margin-bottom:24px}
      .clase{border:1px solid #e8dff2;border-radius:10px;padding:14px;margin-bottom:12px;page-break-inside:avoid}
      .clase-header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:8px}
      .fecha{font-size:14px;font-weight:700;color:#652f8d}
      .tema{font-size:13px;font-weight:600;color:#1a1020;margin-top:2px}
      .desc-label{font-size:10px;font-weight:700;color:#9b8eaa;text-transform:uppercase;letter-spacing:.05em;margin-bottom:4px}
      .desc{font-size:13px;color:#1a1020;line-height:1.5;background:#f2e8f9;padding:8px 10px;border-radius:6px}
      .sin-desc{font-size:12px;color:#9b8eaa;font-style:italic}
      .asist{display:flex;gap:8px;margin-top:8px}
      .badge{padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
      .bp{background:#e6f4ec;color:#2d7a4f}
      .ba{background:#fdeaea;color:#c0392b}
      .bt{background:#fef3cd;color:#b45309}
      .header-doc{display:flex;justify-content:space-between;padding-bottom:16px;border-bottom:2px solid #652f8d;margin-bottom:20px}
      .logo{font-size:20px;font-weight:700;color:#1a1020}.logo span{color:#652f8d}
    </style>
    </head><body>
    <div class="header-doc">
      <div class="logo"><span>Next</span> Ezeiza</div>
      <div style="font-size:12px;color:#9b8eaa">Generado: ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <h1>${c.nombre}</h1>
    <div class="meta">
      ${prof ? prof.nombre+' '+prof.apellido+' · ' : ''}${c.nivel} · ${c.dias||'—'} · ${c.hora_inicio?.slice(0,5)||'—'}–${c.hora_fin?.slice(0,5)||'—'}<br>
      ${sorted.length} clase${sorted.length!==1?'s':''} registrada${sorted.length!==1?'s':''}
    </div>
    ${sorted.map((cl:any, idx:number) => {
      const asis = asistencias[cl.id] || {}
      const p = Object.values(asis).filter(e=>e==='P').length
      const aus = Object.values(asis).filter(e=>e==='A').length
      const tarde = Object.values(asis).filter(e=>e==='T').length
      return `<div class="clase">
        <div class="clase-header">
          <div>
            <div class="fecha">Clase ${idx+1} — ${cl.fecha}</div>
            <div class="tema">${cl.tema||'Sin tema'}</div>
          </div>
          <div class="asist">
            ${p>0?`<span class="badge bp">${p} Presentes</span>`:''}
            ${aus>0?`<span class="badge ba">${aus} Ausentes</span>`:''}
            ${tarde>0?`<span class="badge bt">${tarde} Tarde</span>`:''}
          </div>
        </div>
        <div class="desc-label">Temas vistos</div>
        ${cl.observacion_coordinadora
          ? `<div class="desc">${cl.observacion_coordinadora}</div>`
          : `<div class="sin-desc">Sin descripción cargada</div>`}
      </div>`
    }).join('')}
    <script>window.onload=()=>window.print()<\/script>
    </body></html>`
    const _blob = new Blob([_html], {type:'text/html;charset=utf-8'})
    const _url = URL.createObjectURL(_blob)
    const _win = window.open(_url, '_blank')
    if (!_win) { const a = document.createElement('a'); a.href=_url; a.download=`reporte-${c.nombre}.html`; a.click() }
    setTimeout(() => URL.revokeObjectURL(_url), 10000)
  }

  const prof = profesoras.find((p:any) => p.id === c.profesora_id)
  const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
  const alumnosDisponibles = alumnos.filter((a:any) => !alumnosCurso.find((ac:any) => ac.id === a.id))

  useEffect(() => {
    // Mostrar cache inmediatamente si existe
    if (store[asistCacheKey]) setAsistencias(store[asistCacheKey])
    if (!clases.length) return
    const sb = createClient()
    const claseIds = clases.slice(0, 10).map((cl:any) => cl.id)
    sb.from('asistencia_clases').select('clase_id, alumno_id, estado').in('clase_id', claseIds)
      .then(({data}) => {
        if (!data) return
        const map: Record<string,Record<string,string>> = {}
        data.forEach((a:any) => { if (!map[a.clase_id]) map[a.clase_id]={}; map[a.clase_id][a.alumno_id]=a.estado })
        store[asistCacheKey] = map
        storeTs[asistCacheKey] = Date.now()
        setAsistencias(map)
      })
  }, [clases.length])

  const guardarClase = async () => {
    if (!nuevaClase.fecha) return alert('La fecha es obligatoria')
    if (!nuevaClase.descripcion.trim()) {
      const continuar = window.confirm('⚠️ No completaste la descripción de los temas vistos.\n\n¿Querés guardar igual? Podés editarla después.')
      if (!continuar) return
    }
    // Cerrar modal inmediatamente - guardar en background
    setModalClase(false)
    setNuevaClase({ fecha: hoy(), tema:'', descripcion:'' })
    agregarClase({
      curso_id: c.id,
      fecha: nuevaClase.fecha,
      tema: nuevaClase.tema,
      observacion_coordinadora: nuevaClase.descripcion
    }).catch(e => console.error('Error guardando clase:', e))
  }

  const toggleAsist = async (claseId: string, alumnoId: string, est: 'P'|'A'|'T') => {
    const sb = createClient()
    const actual = asistencias[claseId]?.[alumnoId]
    const nuevo = actual === est ? '' : est
    const nuevaAsist = { ...asistencias, [claseId]: { ...asistencias[claseId], [alumnoId]: nuevo } }
    store[asistCacheKey] = nuevaAsist as any
    storeTs[asistCacheKey] = Date.now()
    setAsistencias(nuevaAsist)
    if (nuevo) {
      await sb.from('asistencia_clases').upsert({ clase_id: claseId, alumno_id: alumnoId, estado: nuevo }, { onConflict: 'clase_id,alumno_id' })
    } else {
      await sb.from('asistencia_clases').delete().eq('clase_id', claseId).eq('alumno_id', alumnoId)
    }
  }

  return (
    <div className="fade-in">
      <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
        <BtnG sm onClick={onVolver}>← Volver</BtnG>
        {puedeEditar && <BtnP sm onClick={onEditar}>Editar</BtnP>}
        {puedeEditar && <BtnDanger sm onClick={onEliminar}>Eliminar</BtnDanger>}
        <button onClick={onAsistenciaRapida} style={{padding:'9px 14px',background:'var(--green)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
          <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 12l2 2 4-4"/><path d="M5 7h10M5 11h4M5 15h3"/></svg>
          Asistencia
        </button>
      </div>

      <div style={{background:'var(--vl)',borderRadius:'16px',padding:'20px',marginBottom:'16px'}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:'14px',marginBottom:'14px'}}>
          <div style={{width:64,height:64,borderRadius:20,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
            <span style={{fontSize:'14px',fontWeight:700,color:col.text}}>{c.nivel.slice(0,3).toUpperCase()}</span>
          </div>
          <div style={{flex:1}}>
            <div style={{fontSize:'20px',fontWeight:700}}>{c.nombre}</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'3px'}}>{c.dias||'—'} · {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
            <div style={{marginTop:'8px'}}><span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:col.bg,color:col.text}}>{c.nivel}</span></div>
          </div>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1px',background:'var(--border)',borderRadius:'12px',overflow:'hidden'}}>
          <Kpi val={alumnosCurso.length} label="Alumnos" />
          <Kpi val={clases.length} label="Clases" color="var(--v)" />
          <Kpi val={prof?prof.nombre.split(' ')[0]:'—'} label="Docente" color="var(--v)" />
        </div>
      </div>

      <div style={{display:'flex',gap:'6px',marginBottom:'18px',overflowX:'auto'}}>
        <TabBtn active={tab==='info'} onClick={() => setTab('info')}>Información</TabBtn>
        <TabBtn active={tab==='alumnos'} onClick={() => setTab('alumnos')}>Alumnos ({alumnosCurso.length})</TabBtn>
        <TabBtn active={tab==='planilla'} onClick={() => setTab('planilla')}>Planilla</TabBtn>
        <TabBtn active={tab==='examenes'} onClick={() => setTab('examenes')}>Exámenes</TabBtn>
      </div>

      {/* RESUMEN RÁPIDO — última clase */}
      {clasesLocal.length > 0 && (() => {
        const ultima = [...clasesLocal].sort((a:any,b:any)=>b.fecha.localeCompare(a.fecha))[0]
        const asisUltima = asistencias[ultima.id] || {}
        const ausentes = alumnosCurso.filter((al:any) => asisUltima[al.id] === 'A')
        const tardes = alumnosCurso.filter((al:any) => asisUltima[al.id] === 'T')
        const presentes = alumnosCurso.filter((al:any) => asisUltima[al.id] === 'P')
        return (
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px 16px',marginBottom:'14px'}}>
            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
              <SL>Última clase · {fmtFecha(ultima.fecha)}</SL>
              <span style={{fontSize:'12px',color:'var(--text2)'}}>{ultima.tema||'Sin tema'}</span>
            </div>
            <div style={{display:'flex',gap:'8px',flexWrap:'wrap'}}>
              <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--greenl)',color:'var(--green)'}}>✓ {presentes.length} presentes</span>
              {ausentes.length > 0 && (
                <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--redl)',color:'var(--red)'}}>
                  ✗ {ausentes.length} ausente{ausentes.length!==1?'s':''}: {ausentes.map((a:any)=>a.nombre).join(', ')}
                </span>
              )}
              {tardes.length > 0 && (
                <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)'}}>
                  ⏱ {tardes.length} tarde{tardes.length!==1?'s':''}
                </span>
              )}
              {Object.keys(asisUltima).length === 0 && (
                <span style={{fontSize:'12px',color:'var(--text3)'}}>Sin asistencia registrada aún</span>
              )}
            </div>
          </div>
        )
      })()}

      {tab === 'info' && <Card>
        <SL style={{marginBottom:'14px'}}>Equipo docente</SL>
        <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
          <Av color={prof?.color||'#888'} size={36}>{prof?.initials||`${prof?.nombre?.[0]||'?'}`}</Av>
          <div style={{flex:1}}>
            <div style={{fontWeight:600}}>{prof?`${prof.nombre} ${prof.apellido}`:'Sin asignar'}</div>
            <div style={{fontSize:'12px',color:'var(--text2)'}}>Profesora a cargo</div>
          </div>
        </div>
        <div style={{marginTop:'14px'}}>
          <FieldRO label="Nombre" value={c.nombre} />
          <FieldRO label="Nivel" value={c.nivel} />
          <FieldRO label="Días" value={c.dias||'—'} />
          <Row2>
            <FieldRO label="Inicio" value={c.hora_inicio?.slice(0,5)||'—'} />
            <FieldRO label="Fin" value={c.hora_fin?.slice(0,5)||'—'} />
          </Row2>
        </div>
      </Card>}

      {tab === 'alumnos' && <div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'12px',flexWrap:'wrap',gap:'8px'}}>
          <button onClick={() => {
            const _rhtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Alumnos - ${c.nombre}</title>
            <style>body{font-family:sans-serif;padding:24px;font-size:13px}h1{color:#652f8d;font-size:18px}
            table{width:100%;border-collapse:collapse;margin:16px 0}
            th{border-bottom:2px solid #652f8d;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#652f8d;letter-spacing:.05em}
            td{padding:9px 8px;border-bottom:1px solid #f0edf5}
            .logo{font-size:18px;font-weight:700}.logo span{color:#652f8d}
            </style></head><body>
            <div style="display:flex;justify-content:space-between;border-bottom:2px solid #652f8d;padding-bottom:12px;margin-bottom:18px">
              <div class="logo"><span>Next</span> Ezeiza</div>
              <div style="font-size:12px;color:#9b8eaa">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
            </div>
            <h1>${c.nombre}</h1>
            <p style="color:#9b8eaa;font-size:12px">${c.nivel} · ${c.dias||'—'} · ${c.hora_inicio?.slice(0,5)||'—'}–${c.hora_fin?.slice(0,5)||'—'} · ${alumnosCurso.length} alumnos</p>
            <table>
              <tr><th>#</th><th>Nombre</th><th>Apellido</th><th>Nivel</th><th>Cuota</th></tr>
              ${alumnosCurso.map((a:any,i:number)=>`<tr><td>${i+1}</td><td>${a.nombre}</td><td>${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')||'—'}</td></tr>`).join('')}
            </table>
            <script>window.onload=()=>window.print()<\/script></body></html>`
            const _rb = new Blob([_rhtml], {type:'text/html;charset=utf-8'})
            const _ru = URL.createObjectURL(_rb)
            const _rw = window.open(_ru, '_blank')
            if (!_rw) { const _a = document.createElement('a'); _a.href=_ru; _a.download='alumnos-'+c.nombre+'.html'; _a.click() }
            setTimeout(() => URL.revokeObjectURL(_ru), 10000)
          }} style={{padding:'8px 14px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'10px',fontSize:'12px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            Descargar lista
          </button>
          {puedeEditar && alumnosDisponibles.length > 0 && (
            <BtnP sm onClick={() => setModalAlumno(true)}>+ Agregar alumno</BtnP>
          )}
        </div>
        <Card>
          <SL style={{marginBottom:'14px'}}>Alumnos inscriptos ({alumnosCurso.length})</SL>
          {alumnosCurso.length === 0 && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Sin alumnos asignados</div>}
          {alumnosCurso.map((a:any) => (
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',flex:1}}>
                <Av color={a.color} size={36}>{a.nombre[0]}{a.apellido[0]}</Av>
                <div style={{flex:1,fontWeight:600}}>{a.nombre} {a.apellido}</div>
                {puedeEditar && <button onClick={() => quitarAlumno(a.id)} style={{padding:'4px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'7px',fontSize:'12px',cursor:'pointer'}}>Quitar</button>}
              </div>

            </div>
          ))}
        </Card>
      </div>}

      {tab === 'planilla' && <div>
        <div style={{display:'flex',gap:'8px',marginBottom:'16px'}}>
          <button onClick={() => setModalClase(true)} style={{flex:2,padding:'13px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
            + Registrar nueva clase
          </button>
          <button onClick={generarReporte} style={{flex:1,padding:'13px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'12px',fontSize:'13px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px'}}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            Reporte
          </button>
        </div>
        {clasesLocal.length === 0 && <Card><div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Sin clases registradas.</div></Card>}
        {[...clasesLocal].sort((a:any,b:any)=>b.fecha.localeCompare(a.fecha)).map((cl:any) => {
          const asis = asistencias[cl.id] || {}
          const p = Object.values(asis).filter(e=>e==='P').length
          const aus = Object.values(asis).filter(e=>e==='A').length
          const tarde = Object.values(asis).filter(e=>e==='T').length
          return (
            <div key={cl.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'10px',overflow:'hidden'}}>
              <div style={{padding:'14px 16px',background:'var(--bg)',display:'flex',alignItems:'center',justifyContent:'space-between'}}>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',fontWeight:700}}>{fmtFecha(cl.fecha)}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{cl.tema||'Sin tema'}</div>
                </div>
                <div style={{display:'flex',gap:'5px',alignItems:'center',flexShrink:0}}>
                  {p>0&&<span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:600,background:'var(--greenl)',color:'var(--green)'}}>{p}P</span>}
                  {aus>0&&<span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:600,background:'var(--redl)',color:'var(--red)'}}>{aus}A</span>}
                  {tarde>0&&<span style={{padding:'2px 8px',borderRadius:'10px',fontSize:'10px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)'}}>{tarde}T</span>}
                  <button onClick={() => abrirEditClase(cl)} style={{marginLeft:'4px',padding:'5px 10px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                    Editar
                  </button>
                  <button onClick={() => setConfirmDelClase(cl.id)} style={{marginLeft:'4px',padding:'5px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                    Eliminar
                  </button>
                </div>
              </div>
              <div style={{padding:'0 16px 12px'}}>
                {cl.observacion_coordinadora ? (
                  <div style={{padding:'8px 12px',background:'var(--vl)',borderRadius:'8px',fontSize:'13px',color:'var(--v)',margin:'8px 0 10px',border:'1px solid #d4a8e8'}}>
                    <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'3px'}}>Temas vistos</div>
                    {cl.observacion_coordinadora}
                  </div>
                ) : (
                  <div style={{padding:'7px 10px',background:'var(--amberl)',borderRadius:'8px',fontSize:'12px',color:'var(--amber)',margin:'8px 0 10px',display:'flex',alignItems:'center',gap:'5px'}}>
                    <svg width="12" height="12" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/></svg>
                    Sin descripción — hacé clic en Editar para completar
                  </div>
                )}
                {alumnosCurso.length === 0 && <div style={{padding:'12px 0',color:'var(--text3)',fontSize:'13px',textAlign:'center'}}>Agregar alumnos para registrar asistencia</div>}
                {alumnosCurso.map((al:any) => {
                  const est = asis[al.id] || ''
                  return (
                    <div key={al.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                      <Av color={al.color} size={28}>{al.nombre[0]}{al.apellido[0]}</Av>
                      <div style={{flex:1,fontSize:'13.5px',fontWeight:500}}>{al.nombre} {al.apellido}</div>
                      <div style={{display:'flex',gap:'4px'}}>
                        {(['P','A','T'] as const).map(e => (
                          <button key={e} onClick={() => toggleAsist(cl.id, al.id, e)} style={{padding:'5px 12px',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1.5px solid',
                            borderColor:est===e?(e==='P'?'#a8d8b4':e==='A'?'#f5c5c5':'#e8d080'):'var(--border)',
                            background:est===e?(e==='P'?'var(--greenl)':e==='A'?'var(--redl)':'var(--amberl)'):'var(--white)',
                            color:est===e?(e==='P'?'var(--green)':e==='A'?'var(--red)':'var(--amber)'):'var(--text3)'}}>
                            {e}
                          </button>
                        ))}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )
        })}
        <div style={{fontSize:'12px',color:'var(--text3)',textAlign:'center',marginTop:'6px'}}>P = Presente · A = Ausente · T = Tarde</div>
      </div>}

      {tab === 'examenes' && <ExamenesTab cursoId={c.id} alumnosCurso={alumnosCurso} puedeEditar={puedeEditar} puedeCrearExamen={true} />}

      {confirmDelete && <ModalSheet title="¿Eliminar curso?" onClose={onCancelDelete}>
        <p style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción desactiva el curso y lo elimina del horario.</p>
        <div style={{display:'flex',gap:'10px'}}>
          <BtnG style={{flex:1}} onClick={onCancelDelete}>Cancelar</BtnG>
          <button onClick={onConfirmDelete} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
        </div>
      </ModalSheet>}

      {confirmDelClase && <ModalSheet title="¿Eliminar clase?" onClose={() => setConfirmDelClase(null)}>
        <p style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Se eliminarán la clase y todos los registros de asistencia asociados.</p>
        <div style={{display:'flex',gap:'10px'}}>
          <BtnG style={{flex:1}} onClick={() => setConfirmDelClase(null)}>Cancelar</BtnG>
          <button onClick={() => eliminarClase(confirmDelClase)} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
        </div>
      </ModalSheet>}

      {modalEditClase && claseEditando && <ModalSheet title="Editar clase" onClose={() => setModalEditClase(false)}>
        <Field2 label="Fecha"><input style={IS} type="date" value={claseEditando.fecha} onChange={e=>setClaseEditando({...claseEditando,fecha:e.target.value})} /></Field2>
        <Field2 label="Tema"><Input value={claseEditando.tema||''} onChange={(v:string)=>setClaseEditando({...claseEditando,tema:v})} placeholder="Ej: Unit 5 — Reading comprehension" /></Field2>
        <Field2 label="Descripción de los temas vistos">
          <textarea
            value={claseEditando.descripcion||''}
            onChange={e=>setClaseEditando({...claseEditando,descripcion:e.target.value})}
            placeholder="Describí los temas trabajados en la clase..."
            rows={4}
            style={{...IS, resize:'none', lineHeight:1.5}}
          />
        </Field2>
        <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
          <BtnG style={{flex:1}} onClick={() => setModalEditClase(false)}>Cancelar</BtnG>
          <BtnP style={{flex:2}} onClick={guardarEditClase} disabled={guardandoEdit}>{guardandoEdit?'Guardando...':'Guardar cambios'}</BtnP>
        </div>
      </ModalSheet>}

      {modalClase && <ModalSheet title="Nueva clase" onClose={() => setModalClase(false)}>
        <Field2 label="Fecha"><input style={IS} type="date" value={nuevaClase.fecha} onChange={e=>setNuevaClase({...nuevaClase,fecha:e.target.value})} /></Field2>
        <Field2 label="Tema"><Input value={nuevaClase.tema} onChange={(v:string)=>setNuevaClase({...nuevaClase,tema:v})} placeholder="Ej: Unit 5 — Reading comprehension" /></Field2>
        <Field2 label="Descripción de los temas vistos">
          <textarea
            value={nuevaClase.descripcion}
            onChange={e=>setNuevaClase({...nuevaClase,descripcion:e.target.value})}
            placeholder="Describí los temas trabajados en la clase..."
            rows={4}
            style={{...IS, resize:'none', lineHeight:1.5}}
          />
          {!nuevaClase.descripcion.trim() && (
            <div style={{display:'flex',alignItems:'center',gap:'5px',marginTop:'5px',fontSize:'12px',color:'var(--amber)'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/></svg>
              Recomendado completar antes de guardar
            </div>
          )}
        </Field2>
        <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
          <BtnG style={{flex:1}} onClick={() => setModalClase(false)}>Cancelar</BtnG>
          <BtnP style={{flex:2}} onClick={guardarClase} disabled={guardando}>{guardando?'Guardando...':'Crear clase'}</BtnP>
        </div>
      </ModalSheet>}

      {modalAlumno && <ModalSheet title="Agregar alumno al curso" onClose={() => setModalAlumno(false)}>
        <BuscadorModal alumnos={alumnosDisponibles} onSelect={(a:any) => { agregarAlumno(a.id); setModalAlumno(false) }} />
        {alumnosDisponibles.length === 0 && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Todos los alumnos ya están inscriptos</div>}
      </ModalSheet>}
    </div>
  )
}

// ── EXAMENES TAB ──
function ExamenesTab({ cursoId, alumnosCurso, puedeEditar, puedeCrearExamen }: any) {
  const sb = createClient()
  const { examenes, agregar, eliminar, recargar } = useExamenes(cursoId)
  const [selExamen, setSelExamen] = useState<any|null>(null)
  const [confirmDelExamen, setConfirmDelExamen] = useState<string|null>(null)
  const [creando, setCreando] = useState(false)

  // Auto-crear Midterm y Final si no existen
  useEffect(() => {
    if (!cursoId || examenes.length === 0) return
    // ya se crean manualmente
  }, [cursoId])

  const crearPredefinido = async (tipo: 'midterm' | 'final') => {
    setCreando(true)
    const nombre = tipo === 'midterm' ? 'Midterm Exam' : 'Final Exam'
    const row = await agregar({ curso_id: cursoId, nombre, fecha: hoy(), nota_maxima: 100, tipo })
    setCreando(false)
    if (row) setSelExamen(row)
  }

  const crearLibre = async () => {
    const nombre = prompt('Nombre del examen:')
    if (!nombre) return
    setCreando(true)
    const row = await agregar({ curso_id: cursoId, nombre, fecha: hoy(), nota_maxima: 100, tipo: 'libre' })
    setCreando(false)
    if (row) setSelExamen(row)
  }

  if (selExamen) {
    return (
      <ExamenNotas
        examen={selExamen}
        alumnosCurso={alumnosCurso}
        puedeEditar={puedeEditar}
        onVolver={() => { setSelExamen(null); recargar() }}
        onEliminar={() => { setConfirmDelExamen(selExamen.id); setSelExamen(null) }}
      />
    )
  }

  const midterm = examenes.find(e => e.tipo === 'midterm' || e.nombre === 'Midterm Exam')
  const final   = examenes.find(e => e.tipo === 'final'   || e.nombre === 'Final Exam')
  const libres  = examenes.filter(e => e.tipo === 'libre' && e.nombre !== 'Midterm Exam' && e.nombre !== 'Final Exam')

  return (
    <div>
      {/* EXÁMENES PREDEFINIDOS */}
      <SL style={{marginBottom:'10px'}}>Exámenes oficiales</SL>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'20px'}}>
        {/* MIDTERM */}
        <div onClick={() => midterm ? setSelExamen(midterm) : (puedeCrearExamen ? crearPredefinido('midterm') : null)}
          style={{background:midterm?'var(--vl)':'var(--white)',border:`1.5px solid ${midterm?'var(--v)':'var(--border)'}`,borderRadius:'16px',padding:'16px',cursor:'pointer',transition:'all .15s'}}
          onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')}
          onMouseLeave={e=>(e.currentTarget.style.borderColor=midterm?'var(--v)':'var(--border)')}>
          <div style={{fontSize:'24px',marginBottom:'6px'}}>📝</div>
          <div style={{fontSize:'15px',fontWeight:700,color:midterm?'var(--v)':'var(--text)'}}>Midterm Exam</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'3px'}}>
            {midterm ? fmtFecha(midterm.fecha) : 'No creado aún · Tocá para crear'}
          </div>
          {midterm && (
            <div style={{marginTop:'8px',padding:'5px 10px',background:'var(--greenl)',borderRadius:'8px',fontSize:'11px',fontWeight:600,color:'var(--green)',display:'inline-block'}}>
              ✓ Creado
            </div>
          )}
          {!midterm && (
            <div style={{marginTop:'8px',padding:'5px 10px',background:'var(--amberl)',borderRadius:'8px',fontSize:'11px',fontWeight:600,color:'var(--amber)',display:'inline-block'}}>
              + Crear
            </div>
          )}
        </div>

        {/* FINAL */}
        <div onClick={() => final ? setSelExamen(final) : (puedeCrearExamen ? crearPredefinido('final') : null)}
          style={{background:final?'var(--vl)':'var(--white)',border:`1.5px solid ${final?'var(--v)':'var(--border)'}`,borderRadius:'16px',padding:'16px',cursor:'pointer',transition:'all .15s'}}
          onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')}
          onMouseLeave={e=>(e.currentTarget.style.borderColor=final?'var(--v)':'var(--border)')}>
          <div style={{fontSize:'24px',marginBottom:'6px'}}>🎓</div>
          <div style={{fontSize:'15px',fontWeight:700,color:final?'var(--v)':'var(--text)'}}>Final Exam</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'3px'}}>
            {final ? fmtFecha(final.fecha) : 'No creado aún · Tocá para crear'}
          </div>
          {final && (
            <div style={{marginTop:'8px',padding:'5px 10px',background:'var(--greenl)',borderRadius:'8px',fontSize:'11px',fontWeight:600,color:'var(--green)',display:'inline-block'}}>
              ✓ Creado
            </div>
          )}
          {!final && (
            <div style={{marginTop:'8px',padding:'5px 10px',background:'var(--amberl)',borderRadius:'8px',fontSize:'11px',fontWeight:600,color:'var(--amber)',display:'inline-block'}}>
              + Crear
            </div>
          )}
        </div>
      </div>

      {/* EXÁMENES LIBRES */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
        <SL>Otros exámenes / Tests</SL>
        {puedeCrearExamen && <BtnP sm onClick={crearLibre} disabled={creando}>+ Nuevo test</BtnP>}
      </div>
      {libres.length === 0 && (
        <div style={{textAlign:'center',padding:'20px',color:'var(--text3)',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',fontSize:'13px'}}>
          Sin tests adicionales registrados
        </div>
      )}
      {libres.map(ex => (
        <div key={ex.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'14px 16px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'8px'}}
          onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')}
          onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
          <div style={{fontSize:'20px'}}>📄</div>
          <div style={{flex:1,cursor:'pointer'}} onClick={() => setSelExamen(ex)}>
            <div style={{fontSize:'15px',fontWeight:600}}>{ex.nombre}</div>
            <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{fmtFecha(ex.fecha)}</div>
          </div>
          {puedeCrearExamen && (
            <div style={{display:'flex',gap:'6px',flexShrink:0}}>
              <button onClick={async () => {
                const nuevoNombre = prompt('Nuevo nombre del test:', ex.nombre)
                if (!nuevoNombre || nuevoNombre === ex.nombre) return
                await sb.from('examenes').update({ nombre: nuevoNombre }).eq('id', ex.id)
                recargar()
              }} style={{padding:'5px 10px',background:'var(--vl)',color:'var(--v)',border:'1px solid var(--v)',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                Editar
              </button>
              <button onClick={() => setConfirmDelExamen(ex.id)}
                style={{padding:'5px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'7px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                Eliminar
              </button>
            </div>
          )}
          {!puedeCrearExamen && <Chevron />}
        </div>
      ))}

      {confirmDelExamen && <ModalSheet title="¿Eliminar examen?" onClose={() => setConfirmDelExamen(null)}>
        <p style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Se eliminarán el examen y todas las notas.</p>
        <div style={{display:'flex',gap:'10px'}}>
          <BtnG style={{flex:1}} onClick={() => setConfirmDelExamen(null)}>Cancelar</BtnG>
          <button onClick={async () => { await eliminar(confirmDelExamen!); setConfirmDelExamen(null) }}
            style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Eliminar</button>
        </div>
      </ModalSheet>}
    </div>
  )
}

function ExamenNotas({ examen, alumnosCurso, puedeEditar, onVolver, onEliminar }: any) {
  const { notas, guardarNota } = useNotasExamen(examen.id)
  const [editando, setEditando] = useState<Record<string,{escrito:string,oral:string,listening:string,ausente:boolean,obs:string}>>({})
  const [guardando, setGuardando] = useState<Record<string,boolean>>({})
  const [saved, setSaved] = useState<Record<string,boolean>>({})

  const esMidFinal = examen.tipo === 'midterm' || examen.tipo === 'final' || examen.nombre === 'Midterm Exam' || examen.nombre === 'Final Exam'

  const getEdit = (alumnoId: string) => {
    if (editando[alumnoId]) return editando[alumnoId]
    const n = notas.find((x:any) => x.alumno_id === alumnoId)
    return {
      escrito: n?.escrito?.toString() || '',
      oral: n?.oral?.toString() || '',
      listening: n?.listening?.toString() || '',
      ausente: n?.ausente || false,
      obs: n?.observacion || ''
    }
  }

  const setEdit = (alumnoId: string, campo: string, valor: any) => {
    setEditando(prev => ({ ...prev, [alumnoId]: { ...getEdit(alumnoId), [campo]: valor } }))
    setSaved(prev => ({ ...prev, [alumnoId]: false }))
  }

  const calcPromedio = (e: any) => {
    if (e.ausente) return null
    const vals = [e.escrito, e.oral, e.listening].map(v => parseFloat(v)).filter(v => !isNaN(v) && v > 0)
    if (!vals.length) return null
    return Math.round((vals.reduce((s,v)=>s+v,0) / vals.length) * 10) / 10
  }

  const guardar = async (alumnoId: string) => {
    const e = getEdit(alumnoId)
    const promedio = calcPromedio(e)
    setGuardando(prev => ({ ...prev, [alumnoId]: true }))
    await guardarNota(alumnoId, {
      escrito: e.ausente ? null : parseFloat(e.escrito)||null,
      oral: e.ausente ? null : parseFloat(e.oral)||null,
      listening: e.ausente ? null : parseFloat(e.listening)||null,
      nota: promedio,
      ausente: e.ausente,
      observacion: e.obs
    })
    setGuardando(prev => ({ ...prev, [alumnoId]: false }))
    setSaved(prev => ({ ...prev, [alumnoId]: true }))
    setTimeout(() => setSaved(prev => ({ ...prev, [alumnoId]: false })), 2000)
  }

  const promedioGeneral = () => {
    const vals = notas.filter((n:any) => !n.ausente && n.nota !== null).map((n:any) => n.nota)
    if (!vals.length) return null
    return (vals.reduce((s:number,v:number)=>s+v,0)/vals.length).toFixed(1)
  }

  const aprobados = notas.filter((n:any) => !n.ausente && n.nota !== null && n.nota >= 60).length
  const ausentes = notas.filter((n:any) => n.ausente).length
  const prom = promedioGeneral()

  const exportarPDF = () => {
    const _rhtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${examen.nombre}</title>
    <style>body{font-family:sans-serif;padding:24px;font-size:13px}h1{color:#652f8d;font-size:18px}
    .logo{font-size:18px;font-weight:700}.logo span{color:#652f8d}
    .hd{display:flex;justify-content:space-between;border-bottom:2px solid #652f8d;padding-bottom:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse}th{border-bottom:2px solid #652f8d;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#652f8d;letter-spacing:.05em}
    td{padding:9px 8px;border-bottom:1px solid #f0edf5}
    .ap{color:#2d7a4f;font-weight:700}.de{color:#c0392b;font-weight:700}.aus{color:#b45309}
    .stats{display:flex;gap:20px;background:#f2e8f9;padding:12px;border-radius:8px;margin-bottom:16px}
    .stat{text-align:center}.sv{font-size:18px;font-weight:700;color:#652f8d}.sl{font-size:11px;color:#9b8eaa}
    </style></head><body>
    <div class="hd"><div class="logo"><span>Next</span> Ezeiza</div>
    <div style="font-size:12px;color:#9b8eaa">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div></div>
    <h1>${examen.nombre}</h1>
    <p style="color:#9b8eaa;font-size:12px">Fecha: ${fmtFecha(examen.fecha)} · Base: 100</p>
    <div class="stats">
      <div class="stat"><div class="sv">${prom||'—'}</div><div class="sl">Promedio</div></div>
      <div class="stat"><div class="sv">${aprobados}</div><div class="sl">Aprobados</div></div>
      <div class="stat"><div class="sv">${ausentes}</div><div class="sl">Ausentes</div></div>
    </div>
    <table>
      <tr><th>#</th><th>Alumno</th>${esMidFinal?'<th>Escrito</th><th>Oral</th><th>Listening</th>':''}<th>Promedio</th><th>Estado</th></tr>
      ${alumnosCurso.map((al:any,i:number) => {
        const n = notas.find((x:any) => x.alumno_id === al.id)
        const prom = n?.nota
        const ok = prom !== null && prom !== undefined && prom >= 60
        const cls = n?.ausente?'aus':ok?'ap':'de'
        const estado = n?.ausente?'Ausente':prom!==null&&prom!==undefined?(ok?'Aprobado':'Desaprobado'):'Sin nota'
        return `<tr>
          <td>${i+1}</td>
          <td>${al.nombre} ${al.apellido}</td>
          ${esMidFinal?`<td class="${cls}">${n?.ausente?'—':n?.escrito??'—'}</td><td class="${cls}">${n?.ausente?'—':n?.oral??'—'}</td><td class="${cls}">${n?.ausente?'—':n?.listening??'—'}</td>`:''}
          <td class="${cls}">${n?.ausente?'—':prom??'—'}</td>
          <td class="${cls}">${estado}</td>
        </tr>`
      }).join('')}
    </table>
    <script>window.onload=()=>window.print()<\/script></body></html>`
    const _rb = new Blob([_rhtml], {type:'text/html;charset=utf-8'})
    const _ru = URL.createObjectURL(_rb)
    const _rw = window.open(_ru, '_blank')
    if (!_rw) { const _a = document.createElement('a'); _a.href=_ru; _a.download='reporte.html'; _a.click() }
    setTimeout(() => URL.revokeObjectURL(_ru), 10000)
  }

  return (
    <div className="fade-in">
      <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
        <BtnG sm onClick={onVolver}>← Volver</BtnG>
        <button onClick={exportarPDF} style={{padding:'9px 14px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
          PDF
        </button>
        {puedeEditar && <button onClick={onEliminar} style={{padding:'9px 14px',background:'var(--redl)',color:'var(--red)',border:'1.5px solid #f5c5c5',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>Eliminar</button>}
      </div>

      <div style={{background:'var(--vl)',borderRadius:'16px',padding:'18px',marginBottom:'16px'}}>
        <div style={{fontSize:'20px',fontWeight:700,marginBottom:'4px'}}>{examen.nombre}</div>
        <div style={{fontSize:'13px',color:'var(--text2)'}}>Fecha: {fmtFecha(examen.fecha)} · Base: 100</div>
        {esMidFinal && <div style={{marginTop:'8px',fontSize:'12px',color:'var(--v)',fontWeight:500}}>Escrito + Oral + Listening → Promedio automático</div>}
        {notas.length > 0 && (
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1px',background:'var(--border)',borderRadius:'12px',overflow:'hidden',marginTop:'12px'}}>
            <div style={{background:'var(--white)',padding:'10px',textAlign:'center'}}><div style={{fontSize:'18px',fontWeight:700,color:'var(--v)'}}>{prom||'—'}</div><div style={{fontSize:'10px',color:'var(--text3)'}}>Promedio</div></div>
            <div style={{background:'var(--white)',padding:'10px',textAlign:'center'}}><div style={{fontSize:'18px',fontWeight:700,color:'var(--green)'}}>{aprobados}</div><div style={{fontSize:'10px',color:'var(--text3)'}}>Aprobados</div></div>
            <div style={{background:'var(--white)',padding:'10px',textAlign:'center'}}><div style={{fontSize:'18px',fontWeight:700,color:'var(--amber)'}}>{ausentes}</div><div style={{fontSize:'10px',color:'var(--text3)'}}>Ausentes</div></div>
          </div>
        )}
      </div>

      {alumnosCurso.length === 0 && <Card><div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Sin alumnos en este curso</div></Card>}

      {alumnosCurso.map((al:any) => {
        const e = getEdit(al.id)
        const prom = calcPromedio(e)
        const aprobado = prom !== null && prom >= 60

        return (
          <div key={al.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'14px 16px',marginBottom:'10px'}}>
            <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
              <Av color={al.color} size={36}>{al.nombre[0]}{al.apellido[0]}</Av>
              <div style={{flex:1}}>
                <div style={{fontSize:'14px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                {prom !== null && (
                  <span style={{fontSize:'12px',fontWeight:700,padding:'2px 8px',borderRadius:'10px',
                    background:aprobado?'var(--greenl)':'var(--redl)',
                    color:aprobado?'var(--green)':'var(--red)'}}>
                    Promedio: {prom} {aprobado?'✓':'✗'}
                  </span>
                )}
              </div>
              <button onClick={() => setEdit(al.id,'ausente',!e.ausente)} style={{padding:'6px 12px',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1.5px solid',
                borderColor:e.ausente?'#e8d080':'var(--border)',
                background:e.ausente?'var(--amberl)':'var(--white)',
                color:e.ausente?'var(--amber)':'var(--text3)'}}>
                Ausente
              </button>
            </div>

            {!e.ausente && esMidFinal && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'8px',marginBottom:'10px'}}>
                {(['escrito','oral','listening'] as const).map(campo => {
                  const val = e[campo]
                  const num = parseFloat(val)
                  const color = !val?'var(--border)':num>=60?'#a8d8b4':'#f5c5c5'
                  return (
                    <div key={campo}>
                      <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',marginBottom:'4px'}}>{campo}</div>
                      <input type="number" min="0" max="100" step="0.5"
                        value={val} onChange={ev => setEdit(al.id, campo, ev.target.value)}
                        placeholder="0–100"
                        style={{width:'100%',padding:'8px 10px',border:`1.5px solid ${color}`,borderRadius:'8px',fontSize:'14px',fontWeight:600,textAlign:'center',fontFamily:'Inter,sans-serif',outline:'none',color:!val?'var(--text3)':num>=60?'var(--green)':'var(--red)',background:'var(--white)'}} />
                    </div>
                  )
                })}
              </div>
            )}

            {!e.ausente && !esMidFinal && (
              <div style={{marginBottom:'10px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',marginBottom:'4px'}}>Nota (0–100)</div>
                <input type="number" min="0" max="100" step="0.5"
                  value={e.escrito} onChange={ev => setEdit(al.id,'escrito',ev.target.value)}
                  placeholder="0–100"
                  style={{width:'100%',padding:'8px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'15px',fontWeight:600,textAlign:'center',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}} />
              </div>
            )}

            {!e.ausente && prom !== null && (
              <div style={{padding:'8px 12px',borderRadius:'8px',background:aprobado?'var(--greenl)':'var(--redl)',marginBottom:'10px',display:'flex',justifyContent:'space-between',alignItems:'center'}}>
                <span style={{fontSize:'12px',fontWeight:600,color:aprobado?'var(--green)':'var(--red)'}}>Promedio calculado</span>
                <span style={{fontSize:'18px',fontWeight:700,color:aprobado?'var(--green)':'var(--red)'}}>{prom}</span>
              </div>
            )}

            <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
              <input type="text" value={e.obs} onChange={ev => setEdit(al.id,'obs',ev.target.value)}
                placeholder="Observación opcional..." style={{...IS,flex:1,fontSize:'12px'}} />
              <button onClick={() => guardar(al.id)} disabled={guardando[al.id]} style={{padding:'8px 16px',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:guardando[al.id]?'not-allowed':'pointer',border:'none',flexShrink:0,
                background:saved[al.id]?'var(--greenl)':guardando[al.id]?'#aaa':'var(--v)',
                color:saved[al.id]?'var(--green)':'#fff',transition:'all .2s'}}>
                {saved[al.id]?'✓':guardando[al.id]?'...':'Guardar'}
              </button>
            </div>
          </div>
        )
      })}
    </div>
  )
}


function AsistenciaRapida({ curso: c, profesoras, alumnos, onVolver }: any) {
  const { alumnosCurso } = useCursoAlumnos(c.id)
  const { agregar: agregarClase } = useClases(c.id)
  const [fecha, setFecha] = useState(hoy())
  const [tema, setTema] = useState('')
  const [estados, setEstados] = useState<Record<string,string>>({})
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const prof = profesoras.find((p:any) => p.id === c.profesora_id)

  const toggleEstado = (alumnoId: string, est: 'P'|'A'|'T') => {
    setEstados(prev => ({ ...prev, [alumnoId]: prev[alumnoId] === est ? 'P' : est }))
  }

  // Pre-marcar todos como presentes
  useEffect(() => {
    if (alumnosCurso.length > 0) {
      const inicial: Record<string,string> = {}
      alumnosCurso.forEach((a:any) => { inicial[a.id] = 'P' })
      setEstados(inicial)
    }
  }, [alumnosCurso.length])

  const guardar = async () => {
    setGuardando(true)
    const sb = createClient()
    // Crear clase
    const { data: clase } = await sb.from('clases').insert({
      curso_id: c.id, fecha, tema, observacion_coordinadora: ''
    }).select().single()
    if (clase) {
      // Guardar asistencias
      const inserts = alumnosCurso.map((a:any) => ({
        clase_id: clase.id, alumno_id: a.id, estado: estados[a.id] || 'P'
      }))
      await sb.from('asistencia_clases').insert(inserts)
    }
    setGuardando(false)
    setGuardado(true)
    setTimeout(() => { setGuardado(false); onVolver() }, 1500)
  }

  const presentes = Object.values(estados).filter(e => e==='P').length
  const ausentes = Object.values(estados).filter(e => e==='A').length
  const tardes = Object.values(estados).filter(e => e==='T').length

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
        <BtnG sm onClick={onVolver}>← Volver</BtnG>
        <div>
          <div style={{fontSize:'18px',fontWeight:700}}>{c.nombre}</div>
          <div style={{fontSize:'12px',color:'var(--text2)'}}>{prof?prof.nombre:''} · Toma de asistencia</div>
        </div>
      </div>

      {/* Fecha y tema */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px',marginBottom:'14px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'8px'}}>
          <div>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Fecha</div>
            <input type="date" value={fecha} onChange={e=>setFecha(e.target.value)} style={IS} />
          </div>
          <div>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Tema (opcional)</div>
            <input value={tema} onChange={e=>setTema(e.target.value)} placeholder="Ej: Unit 3..." style={IS} />
          </div>
        </div>
        {/* Resumen */}
        <div style={{display:'flex',gap:'8px',marginTop:'8px'}}>
          <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--greenl)',color:'var(--green)'}}>✓ {presentes} P</span>
          {ausentes>0 && <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--redl)',color:'var(--red)'}}>✗ {ausentes} A</span>}
          {tardes>0 && <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)'}}>⏱ {tardes} T</span>}
        </div>
      </div>

      {/* Lista alumnos — grande para celular */}
      {alumnosCurso.map((al:any) => {
        const est = estados[al.id] || 'P'
        return (
          <div key={al.id} style={{background:'var(--white)',border:`2px solid ${est==='P'?'var(--green)':est==='A'?'var(--red)':'var(--amber)'}`,borderRadius:'16px',padding:'14px 16px',marginBottom:'10px',display:'flex',alignItems:'center',gap:'12px'}}>
            <Av color={al.color} size={44}>{al.nombre[0]}{al.apellido[0]}</Av>
            <div style={{flex:1}}>
              <div style={{fontSize:'15px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
              <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                {est==='P'?'✓ Presente':est==='A'?'✗ Ausente':'⏱ Tarde'}
              </div>
            </div>
            {/* Botones grandes para touch */}
            <div style={{display:'flex',gap:'6px'}}>
              {(['P','A','T'] as const).map(e => (
                <button key={e} onClick={() => toggleEstado(al.id, e)} style={{
                  width:'44px',height:'44px',borderRadius:'12px',fontSize:'16px',fontWeight:700,
                  cursor:'pointer',border:'2px solid',
                  borderColor:est===e?(e==='P'?'var(--green)':e==='A'?'var(--red)':'var(--amber)'):'var(--border)',
                  background:est===e?(e==='P'?'var(--greenl)':e==='A'?'var(--redl)':'var(--amberl)'):'var(--white)',
                  color:est===e?(e==='P'?'var(--green)':e==='A'?'var(--red)':'var(--amber)'):'var(--text3)',
                }}>
                  {e==='P'?'✓':e==='A'?'✗':'⏱'}
                </button>
              ))}
            </div>
          </div>
        )
      })}

      {alumnosCurso.length === 0 && (
        <div style={{textAlign:'center',padding:'40px',color:'var(--text3)'}}>Sin alumnos en este curso</div>
      )}

      {/* Botón guardar grande */}
      <button onClick={guardar} disabled={guardando || guardado || alumnosCurso.length === 0}
        style={{width:'100%',padding:'16px',marginTop:'8px',background:guardado?'var(--green)':guardando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'14px',fontSize:'16px',fontWeight:700,cursor:guardando?'not-allowed':'pointer',transition:'all .2s'}}>
        {guardado?'✓ Asistencia guardada':guardando?'Guardando...':'Guardar asistencia'}
      </button>
    </div>
  )
}

function BuscadorModal({ alumnos, onSelect }: any) {
  const [q, setQ] = useState('')
  const filtrados = q
    ? alumnos.filter((a:any) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(q.toLowerCase()))
    : alumnos
  return (
    <div>
      <div style={{position:'relative',marginBottom:'12px'}}>
        <input type="text" value={q} onChange={e=>setQ(e.target.value)} placeholder="Buscar alumno..."
          style={{width:'100%',padding:'10px 12px 10px 38px',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}} autoFocus />
        <svg style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',width:'16px',height:'16px'}} viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
      </div>
      <div style={{maxHeight:'320px',overflowY:'auto'}}>
        {filtrados.map((a:any) => (
          <div key={a.id}
            style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px',border:'1.5px solid var(--border)',borderRadius:'12px',marginBottom:'6px'}}
            onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')}
            onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
            <Av color={a.color} size={32}>{a.nombre[0]}{a.apellido[0]}</Av>
            <div style={{flex:1}}><div style={{fontWeight:600,fontSize:'14px'}}>{a.nombre} {a.apellido}</div><div style={{fontSize:'12px',color:'var(--text2)'}}>{a.nivel}</div></div>
            <button onClick={() => onSelect(a)} style={{padding:'7px 16px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',flexShrink:0}}>
              + Agregar
            </button>
          </div>
        ))}
        {filtrados.length === 0 && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>No se encontraron alumnos</div>}
      </div>
    </div>
  )
}

const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const
const Input = ({value,onChange,type='text',placeholder=''}:any) => <input type={type} value={value} placeholder={placeholder} onChange={(e:any)=>onChange(e.target.value)} style={IS} />
const Loader = () => <div style={{color:'var(--text3)',padding:'24px',textAlign:'center'}}>Cargando...</div>
const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const BtnG = ({children,sm,onClick,style}:any) => <button onClick={onClick} style={{padding:sm?'9px 14px':'12px 20px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:'pointer',...style}}>{children}</button>
const BtnDanger = ({children,sm,onClick}:any) => <button onClick={onClick} style={{padding:sm?'7px 13px':'9px 14px',background:'var(--redl)',color:'var(--red)',border:'1.5px solid #f5c5c5',borderRadius:'10px',fontSize:sm?'12px':'13px',fontWeight:600,cursor:'pointer'}}>{children}</button>
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
