'use client'
import { useState, useEffect } from 'react'
import { useCursos, useProfesoras, useAlumnos, useCursoAlumnos, useClases, useMiProfesora, useExamenes, useNotasExamen } from '@/lib/hooks'
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
  const [vista, setVista] = useState<Vista>('lista')
  const [selId, setSelId] = useState<string|null>(null)
  const [tab, setTab] = useState<'info'|'alumnos'|'planilla'|'examenes'>('info')
  const [form, setForm] = useState<any>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)

  const puedeEditar = ['director','coordinadora'].includes(usuario?.rol||'')
  const sel = cursos.find(c => c.id === selId)
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

  const irADetalle = (id: string) => { setSelId(id); setTab('info'); setVista('detalle') }
  const irALista = () => { setSelId(null); setVista('lista') }
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
    const sb = createClient()
    const { id, activo, ...datos } = form
    if (!id) {
      const { data: nuevo, error } = await sb.from('cursos').insert({...datos, activo:true}).select().single()
      if (error) { alert('Error: ' + error.message); setGuardando(false); return }
      // Sincronizar al horario
      if (nuevo && datos.dias && datos.hora_inicio && datos.hora_fin) {
        const diasMap: Record<string,number> = {'Lun':0,'Mar':1,'Mié':2,'Jue':3,'Vie':4,'Sáb':5}
        for (const dia of datos.dias.split(' / ').filter(Boolean)) {
          const diaNum = diasMap[dia]
          if (diaNum !== undefined) {
            await sb.from('horario').insert({ curso_id: nuevo.id, curso_nombre: nuevo.nombre, profesora_id: datos.profesora_id||null, dia_semana: diaNum, hora_inicio: datos.hora_inicio+':00', hora_fin: datos.hora_fin+':00', activo: true })
          }
        }
      }
      if (nuevo) irADetalle(nuevo.id)
      else irALista()
    } else {
      await actualizar(id, datos)
      await sb.from('horario').update({ curso_nombre: datos.nombre, profesora_id: datos.profesora_id }).eq('curso_id', id)
      irADetalle(id)
    }
    setGuardando(false)
  }

  const eliminar = async () => {
    if (!selId) return
    const sb = createClient()
    await sb.from('cursos').update({ activo: false }).eq('id', selId)
    await sb.from('horario').update({ activo: false }).eq('curso_id', selId)
    setConfirmDelete(false)
    setSelId(null)
    await recargar()
    window.dispatchEvent(new Event('horario-actualizado'))
    setVista('lista')
  }

  if (loading || (usuario?.rol === 'profesora' && loadingProf)) return <Loader />

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
  if (vista === 'detalle' && sel) return (
    <CursoDetalle
      curso={sel}
      profesoras={profesoras}
      alumnos={alumnos}
      puedeEditar={puedeEditar}
      tab={tab}
      setTab={setTab}
      onVolver={irALista}
      onEditar={irAFormEditar}
      onEliminar={() => setConfirmDelete(true)}
      confirmDelete={confirmDelete}
      onCancelDelete={() => setConfirmDelete(false)}
      onConfirmDelete={eliminar}
      onAsistenciaRapida={() => setVista('asistencia_rapida')}
    />
  )

  // ── ASISTENCIA RÁPIDA ──
  if (vista === 'asistencia_rapida' && sel) return (
    <AsistenciaRapida
      curso={sel}
      profesoras={profesoras}
      alumnos={alumnos}
      onVolver={() => setVista('detalle')}
    />
  )

  return null
}

function CursoDetalle({ curso:c, profesoras, alumnos, puedeEditar, tab, setTab, onVolver, onEditar, onEliminar, confirmDelete, onCancelDelete, onConfirmDelete, onAsistenciaRapida }: any) {
  const { alumnosCurso, agregar: agregarAlumno, quitar: quitarAlumno } = useCursoAlumnos(c.id)
  const { clases, agregar: agregarClase } = useClases(c.id)
  const [modalClase, setModalClase] = useState(false)
  const [modalAlumno, setModalAlumno] = useState(false)
  const [modalEditClase, setModalEditClase] = useState(false)
  const [claseEditando, setClaseEditando] = useState<any>(null)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [confirmDelClase, setConfirmDelClase] = useState<string|null>(null)

  const eliminarClase = async (claseId: string) => {
    const sb = createClient()
    await sb.from('asistencia_clases').delete().eq('clase_id', claseId)
    await sb.from('clases').delete().eq('id', claseId)
    setClasesLocal(prev => prev.filter(cl => cl.id !== claseId))
    setConfirmDelClase(null)
  }
  const [nuevaClase, setNuevaClase] = useState({ fecha: hoy(), tema:'', descripcion:'' })
  const [guardando, setGuardando] = useState(false)
  const [asistencias, setAsistencias] = useState<Record<string,Record<string,string>>>({})
  const [clasesLocal, setClasesLocal] = useState<any[]>([])

  // Sincronizar clases locales con las del hook
  useEffect(() => { setClasesLocal(clases) }, [clases])

  const abrirEditClase = (cl: any) => {
    setClaseEditando({ ...cl, descripcion: cl.observacion_coordinadora || '' })
    setModalEditClase(true)
  }

  const guardarEditClase = async () => {
    if (!claseEditando) return
    setGuardandoEdit(true)
    const sb = createClient()
    await sb.from('clases').update({
      fecha: claseEditando.fecha,
      tema: claseEditando.tema,
      observacion_coordinadora: claseEditando.descripcion,
    }).eq('id', claseEditando.id)
    // Actualizar local
    setClasesLocal(prev => prev.map(cl => cl.id === claseEditando.id
      ? { ...cl, fecha: claseEditando.fecha, tema: claseEditando.tema, observacion_coordinadora: claseEditando.descripcion }
      : cl
    ))
    setGuardandoEdit(false)
    setModalEditClase(false)
    setClaseEditando(null)
  }

  const generarReporte = () => {
    const sorted = [...clasesLocal].sort((a,b) => a.fecha.localeCompare(b.fecha))
    const win = window.open('','_blank')
    if (!win) return
    const prof = profesoras.find((p:any) => p.id === c.profesora_id)
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8">
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
    </body></html>`)
    win.document.close()
  }

  const prof = profesoras.find((p:any) => p.id === c.profesora_id)
  const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
  const alumnosDisponibles = alumnos.filter((a:any) => !alumnosCurso.find((ac:any) => ac.id === a.id))

  useEffect(() => {
    if (!clases.length) return
    const sb = createClient()
    sb.from('asistencia_clases').select('*').in('clase_id', clases.map((cl:any)=>cl.id))
      .then(({data}) => {
        if (!data) return
        const map: Record<string,Record<string,string>> = {}
        data.forEach((a:any) => { if (!map[a.clase_id]) map[a.clase_id]={}; map[a.clase_id][a.alumno_id]=a.estado })
        setAsistencias(map)
      })
  }, [clases.length])

  const guardarClase = async () => {
    if (!nuevaClase.fecha) return alert('La fecha es obligatoria')
    if (!nuevaClase.descripcion.trim()) {
      const continuar = window.confirm('⚠️ No completaste la descripción de los temas vistos.\n\n¿Querés guardar igual? Podés editarla después.')
      if (!continuar) return
    }
    setGuardando(true)
    await agregarClase({
      curso_id: c.id,
      fecha: nuevaClase.fecha,
      tema: nuevaClase.tema,
      observacion_coordinadora: nuevaClase.descripcion
    })
    setGuardando(false)
    setModalClase(false)
    setNuevaClase({ fecha: hoy(), tema:'', descripcion:'' })
  }

  const toggleAsist = async (claseId: string, alumnoId: string, est: 'P'|'A'|'T') => {
    const sb = createClient()
    const actual = asistencias[claseId]?.[alumnoId]
    const nuevo = actual === est ? '' : est
    setAsistencias(prev => ({ ...prev, [claseId]: { ...prev[claseId], [alumnoId]: nuevo } }))
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
        {puedeEditar && alumnosDisponibles.length > 0 && (
          <div style={{display:'flex',justifyContent:'flex-end',marginBottom:'12px'}}>
            <BtnP sm onClick={() => setModalAlumno(true)}>+ Agregar alumno</BtnP>
          </div>
        )}
        <Card>
          <SL style={{marginBottom:'14px'}}>Alumnos inscriptos ({alumnosCurso.length})</SL>
          {alumnosCurso.length === 0 && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Sin alumnos asignados</div>}
          {alumnosCurso.map((a:any) => (
            <div key={a.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <Av color={a.color} size={36}>{a.nombre[0]}{a.apellido[0]}</Av>
              <div style={{flex:1,fontWeight:600}}>{a.nombre} {a.apellido}</div>
              {puedeEditar && <button onClick={() => quitarAlumno(a.id)} style={{padding:'4px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'7px',fontSize:'12px',cursor:'pointer'}}>Quitar</button>}
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

      {tab === 'examenes' && <ExamenesTab cursoId={c.id} alumnosCurso={alumnosCurso} puedeEditar={puedeEditar} />}

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
        <BuscadorModal alumnos={alumnosDisponibles} onSelect={async (a:any) => { await agregarAlumno(a.id); setModalAlumno(false) }} />
        {alumnosDisponibles.length === 0 && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Todos los alumnos ya están inscriptos</div>}
      </ModalSheet>}
    </div>
  )
}

// ── EXAMENES TAB ──
function ExamenesTab({ cursoId, alumnosCurso, puedeEditar }: any) {
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
        <div onClick={() => midterm ? setSelExamen(midterm) : crearPredefinido('midterm')}
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
        <div onClick={() => final ? setSelExamen(final) : crearPredefinido('final')}
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
        {puedeEditar && <BtnP sm onClick={crearLibre} disabled={creando}>+ Nuevo test</BtnP>}
      </div>
      {libres.length === 0 && (
        <div style={{textAlign:'center',padding:'20px',color:'var(--text3)',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',fontSize:'13px'}}>
          Sin tests adicionales registrados
        </div>
      )}
      {libres.map(ex => (
        <div key={ex.id} onClick={() => setSelExamen(ex)}
          style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'8px',cursor:'pointer'}}
          onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')}
          onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
          <div style={{fontSize:'20px'}}>📄</div>
          <div style={{flex:1}}>
            <div style={{fontSize:'15px',fontWeight:600}}>{ex.nombre}</div>
            <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{fmtFecha(ex.fecha)}</div>
          </div>
          <Chevron />
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
    const win = window.open('','_blank'); if(!win)return
    win.document.write(`<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${examen.nombre}</title>
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
    <script>window.onload=()=>window.print()<\/script></body></html>`)
    win.document.close()
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
