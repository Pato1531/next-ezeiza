'use client'
import { useState, useEffect } from 'react'
import { useAlumnos, usePagos, useMiProfesora, useHistorialCursos, useCuotasHistorial, useCursos } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

const NIVELES = ['Básico','Intermedio','Advanced','Cambridge']
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const COLORES = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#1B6B4A','#7d3aab','#2d5016','#5a3010','#1a4b8a']
const NIVEL_COL: Record<string,{bg:string,text:string}> = {
  'Básico':     {bg:'#FEF3CD',text:'#b45309'},
  'Intermedio': {bg:'#E0F0F7',text:'#1a6b8a'},
  'Advanced':   {bg:'#e6f4ec',text:'#2d7a4f'},
  'Cambridge':  {bg:'#f2e8f9',text:'#652f8d'},
}

type Vista = 'lista' | 'detalle' | 'form' | 'baja' | 'bajas_historicas' | 'pagos_masivos'

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
  const [guardando, setGuardando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [soloSinCurso, setSoloSinCurso] = useState(false)
  const [filtroPago, setFiltroPago] = useState<'todos'|'pagaron'|'no_pagaron'>('todos')
  const [mesFiltro, setMesFiltro] = useState(new Date().getMonth())
  const [alumnosSinCurso, setAlumnosSinCurso] = useState<Set<string>>(new Set())
  const [alumnosConPagoMes, setAlumnosConPagoMes] = useState<Set<string>>(new Set())

  const MESES_LISTA = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesActual = MESES_LISTA[new Date().getMonth()]
  const mesFiltroNombre = MESES_LISTA[mesFiltro]

  // Cargar pagos del mes y cursos en un solo efecto
  useEffect(() => {
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
  }, [mesFiltro, alumnos.length])
  const [modalPago, setModalPago] = useState(false)
  const [motivoBaja, setMotivoBaja] = useState('')
  const [motivoLibre, setMotivoLibre] = useState('')
  const [guardandoBaja, setGuardandoBaja] = useState(false)
  const [bajas, setBajas] = useState<any[]>([])
  const [loadingBajas, setLoadingBajas] = useState(false)
  const [pago, setPago] = useState({ mes: MESES[new Date().getMonth()], anio: 2025, monto: 0, metodo:'Efectivo', fecha_pago: hoy(), observaciones:'' })

  const puedeVerPagos = ['director','coordinadora','secretaria'].includes(usuario?.rol||'')
  const puedeEditar = usuario?.rol !== 'profesora'
  const sel = alumnos.find(a => a.id === selId)

  const irADetalle = (id: string) => { setSelId(id); setTab('datos'); setVista('detalle') }
  const irALista = () => { setSelId(null); setVista('lista') }
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
    setForm({ nombre:'', apellido:'', edad:0, telefono:'', email:'', nivel:'Básico', cuota_mensual:0, es_menor:false, padre_nombre:'', padre_telefono:'', padre_email:'', color: COLORES[alumnos.length % COLORES.length] })
    setVista('form')
  }
  const irAFormEditar = () => { if (sel) { setForm({...sel}); setVista('form') } }

  const guardar = async () => {
    if (!form?.nombre || !form?.apellido) return alert('Nombre y apellido son obligatorios')
    setGuardando(true)
    const { id, activo, ...datos } = form
    try {
      if (!id) {
        const nuevo = await agregar(datos)
        if (nuevo) irADetalle((nuevo as any).id)
        else irALista()
      } else {
        // Usar API route para actualizar
        const res = await fetch('/api/actualizar-alumno', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ id, datos })
        })
        if (res.ok) {
          // Actualizar store local
          await actualizar(id, datos)
        }
        irADetalle(id)
      }
    } catch (e) {
      console.error('Error guardando alumno:', e)
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
      await Promise.all([
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
        sb.from('alumnos').update({ activo: false }).eq('id', sel.id)
      ])
      await recargar()
    } catch (e) { console.error(e) }
    setGuardandoBaja(false)
    setSelId(null)
    setVista('lista')
  }

  const eliminar = async () => {
    if (!selId) return
    const sb = createClient()
    await sb.from('alumnos').update({ activo: false }).eq('id', selId)
    setConfirmDelete(false)
    irALista()
  }

  const filtrados = alumnos.filter(a => {
    const matchBusq = !busqueda || `${a.nombre} ${a.apellido} ${a.nivel}`.toLowerCase().includes(busqueda.toLowerCase())
    const matchSinCurso = !soloSinCurso || alumnosSinCurso.has(a.id)
    const matchPago = filtroPago === 'todos' ? true
      : filtroPago === 'pagaron' ? alumnosConPagoMes.has(a.id)
      : !alumnosConPagoMes.has(a.id)
    return matchBusq && matchSinCurso && matchPago
  })

  if (loading || (usuario?.rol === 'profesora' && loadingProf)) return <Loader />

  // ── LISTA ──
  if (vista === 'lista') return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
        <SL>{alumnos.length} alumnos</SL>
        <div style={{display:'flex',gap:'8px'}}>
          {puedeEditar && (
            <button onClick={() => setVista('pagos_masivos')} style={{padding:'9px 14px',background:'var(--white)',color:'var(--green)',border:'1.5px solid var(--green)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',display:'flex',alignItems:'center',gap:'5px'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M12 2H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6z"/><path d="M14 2v6h6M10 12v4M8 14h4"/></svg>
              Pagos
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

      {/* Filtro sin curso */}
      <div style={{display:'flex',gap:'8px',marginBottom:'14px',alignItems:'center'}}>
        <button onClick={() => setSoloSinCurso(!soloSinCurso)} style={{display:'flex',alignItems:'center',gap:'6px',padding:'7px 14px',borderRadius:'20px',fontSize:'12.5px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:soloSinCurso?'var(--amber)':'var(--border)',background:soloSinCurso?'var(--amberl)':'var(--white)',color:soloSinCurso?'var(--amber)':'var(--text2)',transition:'all .15s'}}>
          <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/></svg>
          Sin curso asignado
          {alumnosSinCurso.size > 0 && <span style={{background:soloSinCurso?'var(--amber)':'var(--border)',color:soloSinCurso?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 7px',fontSize:'11px',fontWeight:700}}>{alumnosSinCurso.size}</span>}
        </button>
        {soloSinCurso && <button onClick={() => setSoloSinCurso(false)} style={{fontSize:'12px',color:'var(--text3)',background:'none',border:'none',cursor:'pointer'}}>✕ Limpiar</button>}
      </div>
      {filtrados.map(a => {
        const col = NIVEL_COL[a.nivel]
        const pagado = alumnosConPagoMes.has(a.id)
        const sinCurso = alumnosSinCurso.has(a.id)
        return (
          <ListItem key={a.id} onClick={() => irADetalle(a.id)}>
            <div style={{position:'relative',flexShrink:0}}>
              <Av color={a.color} size={44}>{a.nombre[0]}{a.apellido[0]}</Av>
              <div style={{position:'absolute',bottom:0,right:0,width:'13px',height:'13px',borderRadius:'50%',background:pagado?'var(--green)':'var(--red)',border:'2px solid var(--white)'}} title={pagado?`Pagó ${mesActual}`:`Sin pago ${mesActual}`} />
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'15px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
              <div style={{display:'flex',gap:'5px',marginTop:'4px',flexWrap:'wrap'}}>
                <span style={{padding:'2px 7px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:col?.bg,color:col?.text}}>{a.nivel}</span>
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

  // ── FORMULARIO ──
  if (vista === 'form') return (
    <div className="fade-in">
      <BtnG sm onClick={() => form?.id ? irADetalle(form.id) : irALista()} style={{marginBottom:'20px'}}>← Cancelar</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>{form?.id ? 'Editar alumno' : 'Nuevo alumno'}</div>
      <Card>
        <Row2>
          <Field2 label="Nombre *"><Input value={form?.nombre||''} onChange={(v:string)=>setForm({...form,nombre:v})} /></Field2>
          <Field2 label="Apellido *"><Input value={form?.apellido||''} onChange={(v:string)=>setForm({...form,apellido:v})} /></Field2>
        </Row2>
        <Row2>
          <Field2 label="Edad"><Input type="number" value={form?.edad||''} onChange={(v:string)=>setForm({...form,edad:+v})} /></Field2>
          <Field2 label="Teléfono"><Input value={form?.telefono||''} onChange={(v:string)=>setForm({...form,telefono:v})} /></Field2>
        </Row2>
        <Field2 label="Email"><Input type="email" value={form?.email||''} onChange={(v:string)=>setForm({...form,email:v})} /></Field2>
        <Row2>
          <Field2 label="Nivel">
            <select style={IS} value={form?.nivel||'Básico'} onChange={(e:any)=>setForm({...form,nivel:e.target.value})}>
              {NIVELES.map(n=><option key={n}>{n}</option>)}
            </select>
          </Field2>
          <Field2 label="Cuota mensual ($)"><Input type="number" value={form?.cuota_mensual||''} onChange={(v:string)=>setForm({...form,cuota_mensual:+v})} /></Field2>
        </Row2>
        <Field2 label="¿Es menor de edad?">
          <select style={IS} value={form?.es_menor?'si':'no'} onChange={(e:any)=>setForm({...form,es_menor:e.target.value==='si'})}>
            <option value="no">No</option>
            <option value="si">Sí</option>
          </select>
        </Field2>
        {form?.es_menor && <>
          <Field2 label="Nombre padre/madre"><Input value={form?.padre_nombre||''} onChange={(v:string)=>setForm({...form,padre_nombre:v})} /></Field2>
          <Row2>
            <Field2 label="Tel. contacto"><Input value={form?.padre_telefono||''} onChange={(v:string)=>setForm({...form,padre_telefono:v})} /></Field2>
            <Field2 label="Email contacto"><Input value={form?.padre_email||''} onChange={(v:string)=>setForm({...form,padre_email:v})} /></Field2>
          </Row2>
        </>}
      </Card>
      <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
        <BtnG style={{flex:1}} onClick={() => form?.id ? irADetalle(form.id) : irALista()}>Cancelar</BtnG>
        <BtnP style={{flex:2}} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : form?.id ? 'Guardar cambios' : 'Crear alumno'}
        </BtnP>
      </div>
    </div>
  )

  // ── DETALLE ──
  if (vista === 'detalle' && sel) return (
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

  // ── VISTA BAJA ──
  if (vista === 'baja' && sel) return (
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
                <td>${fmtFecha(b.fecha_baja)}</td>
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

  // ── VISTA PAGOS MASIVOS ──
  if (vista === 'pagos_masivos') return (
    <PagosMasivos alumnos={alumnos} onVolver={() => setVista('lista')} />
  )

  return null
}

function AlumnoDetalle({ alumno:a, puedeVerPagos, puedeEditar, tab, setTab, onVolver, onEditar, onEliminar, confirmDelete, onCancelDelete, onConfirmDelete, modalPago, setModalPago, pago, setPago }: any) {
  const { pagos, registrar } = usePagos(a.id)
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
    // Cargar curso actual del alumno
    sb.from('cursos_alumnos')
      .select('curso_id, cursos(id, nombre, nivel, dias, hora_inicio, hora_fin)')
      .eq('alumno_id', a.id)
      .then(({ data }) => {
        if (data && data.length > 0) setCursoActual((data[0] as any).cursos)
        else setCursoActual(null)
      })

  }, [a.id])

  const asignarCurso = async (cursoId: string) => {
    setAsignando(true)
    const nuevo = todosLosCursos.find((c:any) => c.id === cursoId)
    try {
      const res = await fetch('/api/asignar-curso', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ alumno_id: a.id, curso_id: cursoId })
      })
      if (res.ok) setCursoActual(nuevo)
    } catch (e) {
      console.error('Error asignando curso:', e)
    }
    setModalAsignarCurso(false)
    setAsignando(false)
  }

  const guardarPago = async () => {
    setGuardandoPago(true)
    await registrar({ ...pago, alumno_id: a.id })
    setGuardandoPago(false)
    setModalPago(false)
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
      </div>

      {tab === 'datos' && <Card>
        <FieldRO label="Nombre" value={`${a.nombre} ${a.apellido}`} />
        <FieldRO label="Edad" value={`${a.edad} años`} />
        <FieldRO label="Teléfono" value={a.telefono||'—'} />
        <FieldRO label="Email" value={a.email||'—'} />
        <FieldRO label="Nivel" value={a.nivel} />
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

      {tab === 'pagos' && puedeVerPagos && <Card>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
          <SL>Historial de pagos</SL>
          <BtnP sm onClick={() => setModalPago(true)}>+ Registrar pago</BtnP>
        </div>
        <div style={{display:'grid',gridTemplateColumns:'repeat(12,1fr)',gap:'3px',marginBottom:'14px'}}>
          {MESES.map((m,i) => {
            const p = pagos.find((x:any) => x.mes === m && x.anio === 2025)
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
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'15px',fontWeight:700}}>${p.monto?.toLocaleString('es-AR')}</div>
                <Badge cls={ok?'b-green':parc?'b-amber':'b-red'} style={{marginTop:'3px'}}>{ok?'Completo':parc?'Parcial':'Pendiente'}</Badge>
              </div>
            </div>
          )
        })}
      </Card>}

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
    </div>
  )
}

function hoy() { return new Date().toISOString().split('T')[0] }
function fmtFecha(f: string) { if(!f)return'—'; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}` }
function PagosMasivos({ alumnos, onVolver }: any) {
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesActual = MESES[new Date().getMonth()]
  const anioActual = new Date().getFullYear()

  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [mes, setMes] = useState(mesActual)
  const [anio] = useState(anioActual)
  const [metodo, setMetodo] = useState('Efectivo')
  const [usarCuotaIndividual, setUsarCuotaIndividual] = useState(true)
  const [montoFijo, setMontoFijo] = useState('')
  const [guardando, setGuardando] = useState(false)
  const [guardado, setGuardado] = useState(false)
  const [busqueda, setBusqueda] = useState('')

  const filtrados = busqueda
    ? alumnos.filter((a:any) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(busqueda.toLowerCase()))
    : alumnos

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
      setSeleccionados(new Set(filtrados.map((a:any) => a.id)))
    }
  }

  const guardar = async () => {
    if (seleccionados.size === 0) return alert('Seleccioná al menos un alumno')
    setGuardando(true)
    const sb = createClient()
    const fecha = new Date().toISOString().split('T')[0]
    const alumnosSeleccionados = alumnos.filter((a:any) => seleccionados.has(a.id))

    const inserts = alumnosSeleccionados.map((a:any) => ({
      alumno_id: a.id,
      mes,
      anio,
      monto: usarCuotaIndividual ? (a.cuota_mensual || 0) : (parseFloat(montoFijo) || 0),
      metodo,
      fecha_pago: fecha,
      observaciones: `Pago masivo registrado`,
    }))

    const { error } = await sb.from('pagos_alumnos').upsert(inserts, { onConflict: 'alumno_id,mes,anio' })
    if (error) { alert('Error: ' + error.message); setGuardando(false); return }

    setGuardando(false)
    setGuardado(true)
    setSeleccionados(new Set())
    setTimeout(() => setGuardado(false), 3000)
  }

  const totalMonto = [...seleccionados].reduce((sum, id) => {
    const a = alumnos.find((x:any) => x.id === id)
    if (!a) return sum
    return sum + (usarCuotaIndividual ? (a.cuota_mensual || 0) : (parseFloat(montoFijo) || 0))
  }, 0)

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'20px'}}>
        <BtnG sm onClick={onVolver}>← Volver</BtnG>
        <div style={{fontSize:'20px',fontWeight:700}}>Registrar pagos</div>
      </div>

      {/* Config pago */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px',marginBottom:'14px'}}>
        <SL style={{marginBottom:'12px'}}>Configuración del pago</SL>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
          <div>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Mes</div>
            <select style={IS} value={mes} onChange={e=>setMes(e.target.value)}>
              {MESES.map(m=><option key={m}>{m}</option>)}
            </select>
          </div>
          <div>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Método</div>
            <select style={IS} value={metodo} onChange={e=>setMetodo(e.target.value)}>
              <option>Efectivo</option>
              <option>Transferencia</option>
              <option>MercadoPago</option>
            </select>
          </div>
        </div>
        <div>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'6px'}}>Monto</div>
          <div style={{display:'flex',gap:'8px',marginBottom:'8px'}}>
            <button onClick={() => setUsarCuotaIndividual(true)} style={{flex:1,padding:'9px',borderRadius:'10px',border:'1.5px solid',borderColor:usarCuotaIndividual?'var(--v)':'var(--border)',background:usarCuotaIndividual?'var(--vl)':'var(--white)',color:usarCuotaIndividual?'var(--v)':'var(--text2)',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
              Cuota individual
            </button>
            <button onClick={() => setUsarCuotaIndividual(false)} style={{flex:1,padding:'9px',borderRadius:'10px',border:'1.5px solid',borderColor:!usarCuotaIndividual?'var(--v)':'var(--border)',background:!usarCuotaIndividual?'var(--vl)':'var(--white)',color:!usarCuotaIndividual?'var(--v)':'var(--text2)',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
              Monto fijo
            </button>
          </div>
          {!usarCuotaIndividual && (
            <input type="number" value={montoFijo} onChange={e=>setMontoFijo(e.target.value)}
              placeholder="Monto igual para todos..." style={IS} />
          )}
          {usarCuotaIndividual && (
            <div style={{fontSize:'12px',color:'var(--text3)',padding:'8px 0'}}>Cada alumno pagará su cuota mensual individual</div>
          )}
        </div>
      </div>

      {/* Selección alumnos */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden',marginBottom:'14px'}}>
        <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'12px',background:'var(--bg)'}}>
          <input type="checkbox" checked={seleccionados.size === filtrados.length && filtrados.length > 0}
            onChange={toggleTodos} style={{width:'16px',height:'16px',cursor:'pointer',accentColor:'var(--v)'}} />
          <div style={{flex:1,fontSize:'13px',fontWeight:600}}>Seleccionar todos ({filtrados.length})</div>
          <div style={{position:'relative'}}>
            <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)}
              placeholder="Buscar..." style={{...IS,width:'150px',padding:'6px 10px 6px 30px',fontSize:'12px'}} />
            <svg style={{position:'absolute',left:'9px',top:'50%',transform:'translateY(-50%)',width:'13px',height:'13px'}} viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
          </div>
        </div>

        <div style={{maxHeight:'360px',overflowY:'auto'}}>
          {filtrados.map((a:any) => {
            const sel = seleccionados.has(a.id)
            const monto = usarCuotaIndividual ? a.cuota_mensual : parseFloat(montoFijo)||0
            return (
              <div key={a.id} onClick={() => toggleAlumno(a.id)}
                style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 16px',borderBottom:'1px solid var(--border)',cursor:'pointer',background:sel?'var(--vl)':'var(--white)',transition:'background .1s'}}>
                <input type="checkbox" checked={sel} onChange={() => toggleAlumno(a.id)}
                  onClick={e=>e.stopPropagation()} style={{width:'16px',height:'16px',cursor:'pointer',accentColor:'var(--v)',flexShrink:0}} />
                <Av color={a.color} size={32}>{a.nombre[0]}{a.apellido[0]}</Av>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)'}}>{a.nivel}</div>
                </div>
                <div style={{fontSize:'13px',fontWeight:700,color:sel?'var(--v)':'var(--text3)',flexShrink:0}}>
                  ${monto?.toLocaleString('es-AR')||'0'}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {/* Footer con total y guardar */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px'}}>
          <div>
            <div style={{fontSize:'13px',color:'var(--text2)'}}>{seleccionados.size} alumno{seleccionados.size!==1?'s':''} seleccionado{seleccionados.size!==1?'s':''}</div>
            <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{mes} {anio} · {metodo}</div>
          </div>
          <div style={{textAlign:'right'}}>
            <div style={{fontSize:'12px',color:'var(--text3)'}}>Total a registrar</div>
            <div style={{fontSize:'22px',fontWeight:700,color:'var(--v)'}}>${totalMonto.toLocaleString('es-AR')}</div>
          </div>
        </div>

        {guardado && (
          <div style={{padding:'10px 14px',background:'var(--greenl)',borderRadius:'10px',fontSize:'13px',fontWeight:600,color:'var(--green)',marginBottom:'10px',textAlign:'center'}}>
            ✓ Pagos registrados correctamente
          </div>
        )}

        <button onClick={guardar} disabled={guardando || seleccionados.size === 0}
          style={{width:'100%',padding:'14px',background:guardando||seleccionados.size===0?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'12px',fontSize:'15px',fontWeight:700,cursor:guardando||seleccionados.size===0?'not-allowed':'pointer'}}>
          {guardando ? 'Registrando pagos...' : `Registrar ${seleccionados.size} pago${seleccionados.size!==1?'s':''}`}
        </button>
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
