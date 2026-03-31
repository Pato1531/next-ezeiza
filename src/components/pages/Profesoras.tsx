'use client'
import { useState, useEffect } from 'react'
import { useProfesoras, useHorasHistorial, useLiquidaciones } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

function hoy() { return new Date().toISOString().split('T')[0] }
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

const NIVELES = ['Básico','Intermedio','Advanced','Cambridge']
const COLORES = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#1B6B4A','#7d3aab','#2d5016']
const MESES_S = ['Ene','Feb','Mar','Abr','May','Jun']
const TIPOS_LIC = ['Licencia médica','Licencia personal','Ausencia justificada','Ausencia injustificada','Vacaciones','Reemplazo docente']

type Vista = 'lista' | 'detalle' | 'form'

export default function Profesoras() {
  const { profesoras, loading, actualizar, agregar, recargar } = useProfesoras()
  const { usuario } = useAuth()
  const [vista, setVista] = useState<Vista>('lista')
  const [selId, setSelId] = useState<string|null>(null)
  const [tab, setTab] = useState<'datos'|'asistencia'|'licencias'|'liquidacion'>('datos')
  const [form, setForm] = useState<any>(null)
  const [guardando, setGuardando] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [modalLic, setModalLic] = useState(false)
  const [lic, setLic] = useState({ tipo:'Licencia médica', fecha_desde:hoy(), fecha_hasta:hoy(), observaciones:'', reemplazo_nombre:'', reemplazo_horas:0, es_paga:false, reemplazo_profesora_id:'' })
  const [licEditando, setLicEditando] = useState<any>(null)
  const [modalEditLic, setModalEditLic] = useState(false)
  const [licencias, setLicencias] = useState<any[]>([])

  const puedeEditar = usuario?.rol === 'director'
  const puedeCargarLicencias = usuario?.rol === 'director' || usuario?.rol === 'coordinadora'
  const soloLectura = usuario?.rol === 'coordinadora'
  const sel = profesoras.find(p => p.id === selId)

  const irADetalle = (id: string) => {
    setSelId(id)
    setTab('datos')
    setVista('detalle')
    // Cargar licencias de esta profesora
    const sb = createClient()
    sb.from('licencias_profesoras').select('*').eq('profesora_id', id).order('fecha_desde', { ascending: false })
      .then(({ data }) => setLicencias(data || []))
  }
  const irALista = () => { setSelId(null); setVista('lista') }
  const irAFormNuevo = () => {
    setForm({ nombre:'', apellido:'', email:'', edad:0, telefono:'', nivel:'Básico', tarifa_hora:0, horas_semana:0, color: COLORES[profesoras.length % COLORES.length] })
    setVista('form')
  }
  const irAFormEditar = () => {
    if (sel) { setForm({...sel}); setVista('form') }
  }

  const guardar = async () => {
    if (!form?.nombre || !form?.apellido) return alert('Nombre y apellido son obligatorios')
    setGuardando(true)
    const initials = `${form.nombre[0]}${form.apellido[0]}`.toUpperCase()
    const { id, activo, activa, ...datos } = form
    const t = setTimeout(() => { setGuardando(false); if (id) irADetalle(id); else irALista() }, 6000)
    try {
      if (!id) {
        const nueva = await agregar({ ...datos, initials, activa: true })
        clearTimeout(t)
        if (nueva) irADetalle((nueva as any).id)
        else irALista()
      } else {
        actualizar(id, { ...datos, initials })
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
    const sb = createClient()
    sb.from('profesoras').update({ activa: false }).eq('id', selId)
      .then(() => recargar()).catch(() => {})
  }

  const guardarLic = async () => {
    if (!selId) return
    setModalLic(false)
    const sb = createClient()
    sb.from('licencias_profesoras').insert({ ...lic, profesora_id: selId }).select().single()
      .then(({ data }) => { if (data) setLicencias(prev => [data, ...prev]) })
      .catch(e => console.error('Error guardando licencia:', e))
  }

  const guardarEditLic = async () => {
    if (!licEditando) return
    setModalEditLic(false)
    setLicencias(prev => prev.map(l => l.id === licEditando.id ? licEditando : l))
    const sb = createClient()
    sb.from('licencias_profesoras').update({
      tipo: licEditando.tipo,
      fecha_desde: licEditando.fecha_desde,
      fecha_hasta: licEditando.fecha_hasta,
      es_paga: licEditando.es_paga,
      reemplazo_nombre: licEditando.reemplazo_nombre,
      reemplazo_horas: licEditando.reemplazo_horas,
      reemplazo_profesora_id: licEditando.reemplazo_profesora_id || null,
      observaciones: licEditando.observaciones,
    }).eq('id', licEditando.id).catch(e => console.error('Error editando licencia:', e))
  }

  const eliminarLic = async (id: string, profesoraId: string) => {
    if (!id) return
    setLicencias(prev => prev.filter(l => l.id !== id))
    const sb = createClient()
    const { error } = await sb.from('licencias_profesoras').delete().eq('id', id)
    if (error) {
      console.error('Error eliminando licencia:', error)
      sb.from('licencias_profesoras').select('*').eq('profesora_id', profesoraId).order('fecha_desde', { ascending: false })
        .then(({ data }) => setLicencias(data || []))
    }
  }

  // No bloquear con loading

  // ── LISTA ──
  if (vista === 'lista') return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
        <SL>{profesoras.length} docentes</SL>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {soloLectura && <Badge cls="b-purple">Solo lectura</Badge>}
          {puedeEditar && <BtnP sm onClick={irAFormNuevo}>+ Nueva docente</BtnP>}
        </div>
      </div>
      {profesoras.map(p => (
        <ListItem key={p.id} onClick={() => irADetalle(p.id)}>
          <Av color={p.color} size={44}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'15px',fontWeight:600}}>{p.nombre} {p.apellido}</div>
            <div style={{fontSize:'12.5px',color:'var(--text2)',marginTop:'2px'}}>{p.nivel} · {p.horas_semana}hs/sem</div>
          </div>
          <Badge cls="b-green">95%</Badge>
          <Chevron />
        </ListItem>
      ))}
    </div>
  )

  // ── FORMULARIO ──
  if (vista === 'form') return (
    <div className="fade-in">
      <BtnG sm onClick={() => form?.id ? irADetalle(form.id) : irALista()} style={{marginBottom:'20px'}}>← Cancelar</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>{form?.id ? 'Editar docente' : 'Nueva docente'}</div>
      <Card>
        <Row2>
          <Field2 label="Nombre *"><Input value={form?.nombre||''} onChange={(v:string)=>setForm({...form,nombre:v})} /></Field2>
          <Field2 label="Apellido *"><Input value={form?.apellido||''} onChange={(v:string)=>setForm({...form,apellido:v})} /></Field2>
        </Row2>
        <Field2 label="Email"><Input type="email" value={form?.email||''} onChange={(v:string)=>setForm({...form,email:v})} /></Field2>
        <Row2>
          <Field2 label="Edad"><Input type="number" value={form?.edad||''} onChange={(v:string)=>setForm({...form,edad:+v})} /></Field2>
          <Field2 label="Teléfono"><Input value={form?.telefono||''} onChange={(v:string)=>setForm({...form,telefono:v})} /></Field2>
        </Row2>
        <Row2>
          <Field2 label="Nivel">
            <select style={IS} value={form?.nivel||'Básico'} onChange={e=>setForm({...form,nivel:e.target.value})}>
              {NIVELES.map(n=><option key={n}>{n}</option>)}
            </select>
          </Field2>
          <Field2 label="Tarifa/hora ($)"><Input type="number" value={form?.tarifa_hora||''} onChange={(v:string)=>setForm({...form,tarifa_hora:+v})} /></Field2>
        </Row2>
        <Field2 label="Horas por semana"><input type="number" step="0.5" min="0" value={form?.horas_semana||''} onChange={e=>setForm({...form,horas_semana:parseFloat(e.target.value)||0})} style={IS} /></Field2>
      </Card>
      <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
        <BtnG style={{flex:1}} onClick={() => form?.id ? irADetalle(form.id) : irALista()}>Cancelar</BtnG>
        <BtnP style={{flex:2}} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : form?.id ? 'Guardar cambios' : 'Crear docente'}
        </BtnP>
      </div>
    </div>
  )

  // ── DETALLE ──
  if (vista === 'detalle' && sel) {
    const liq = sel.horas_semana * 4 * sel.tarifa_hora
    return (
      <div className="fade-in">
        <div style={{display:'flex',gap:'8px',marginBottom:'16px',flexWrap:'wrap'}}>
          <BtnG sm onClick={irALista}>← Volver</BtnG>
          {puedeEditar && <BtnP sm onClick={irAFormEditar}>Editar</BtnP>}
          {puedeEditar && <BtnDanger sm onClick={() => setConfirmDelete(true)}>Eliminar</BtnDanger>}
        </div>

        <div style={{background:'var(--vl)',borderRadius:'16px',padding:'20px',marginBottom:'16px'}}>
          <div style={{display:'flex',alignItems:'flex-start',gap:'14px',marginBottom:'14px'}}>
            <Av color={sel.color} size={64}>{sel.initials||`${sel.nombre[0]}${sel.apellido[0]}`}</Av>
            <div style={{flex:1}}>
              <div style={{fontSize:'20px',fontWeight:700}}>{sel.nombre} {sel.apellido}</div>
              <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'3px'}}>{sel.email}</div>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginTop:'8px'}}>
                <Badge cls="b-purple">{sel.nivel}</Badge>
                {!soloLectura && <Badge cls="b-green">${sel.tarifa_hora?.toLocaleString('es-AR')}/h</Badge>}
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1px',background:'var(--border)',borderRadius:'12px',overflow:'hidden'}}>
            <Kpi val={`${sel.horas_semana}hs`} label="Semanal" color="var(--v)" />
            {!soloLectura ? <Kpi val={`$${Math.round(liq/1000)}k`} label="Liquidación" color="var(--v)" /> : <Kpi val={sel.edad} label="Años" />}
            <Kpi val={licencias.length} label="Licencias" />
          </div>
        </div>

        <div style={{display:'flex',gap:'6px',marginBottom:'18px',overflowX:'auto'}}>
          <TabBtn active={tab==='datos'} onClick={() => setTab('datos')}>Datos</TabBtn>
          <TabBtn active={tab==='asistencia'} onClick={() => setTab('asistencia')}>Asistencia</TabBtn>
          {puedeEditar && <>
            <TabBtn active={tab==='licencias'} onClick={() => setTab('licencias')}>Licencias</TabBtn>
            <TabBtn active={tab==='liquidacion'} onClick={() => setTab('liquidacion')}>Liquidación</TabBtn>
          </>}
          {!puedeEditar && puedeCargarLicencias && (
            <TabBtn active={tab==='licencias'} onClick={() => setTab('licencias')}>Licencias</TabBtn>
          )}
        </div>

        {tab === 'datos' && <Card>
          <FieldRO label="Nombre" value={`${sel.nombre} ${sel.apellido}`} />
          <FieldRO label="Email" value={sel.email||'—'} />
          <Row2>
            <FieldRO label="Edad" value={`${sel.edad} años`} />
            <FieldRO label="Teléfono" value={sel.telefono||'—'} />
          </Row2>
          <Row2>
            <FieldRO label="Nivel" value={sel.nivel} />
            {!soloLectura && <FieldRO label="Tarifa/hora" value={`$${sel.tarifa_hora?.toLocaleString('es-AR')}`} />}
          </Row2>
          <FieldRO label="Horas por semana" value={`${sel.horas_semana}hs`} />
        </Card>}

        {tab === 'asistencia' && <Card>
          <SL style={{marginBottom:'14px'}}>Asistencia 2025</SL>
          <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'8px'}}>
            {MESES_S.map(m => (
              <div key={m}>
                <div style={{fontSize:'10px',color:'var(--text3)',textAlign:'center',marginBottom:'5px',fontWeight:500}}>{m}</div>
                <div style={{height:'52px',borderRadius:'10px',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:700,background:'var(--greenl)',color:'var(--green)'}}>95%</div>
              </div>
            ))}
          </div>
        </Card>}

        {tab === 'licencias' && <Card>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
            <SL>Licencias</SL>
            {puedeCargarLicencias && <BtnP sm onClick={() => setModalLic(true)}>+ Nueva</BtnP>}
          </div>
          {licencias.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--text3)'}}>Sin licencias registradas</div>}
          {licencias.map((l:any) => (
            <div key={l.id||l.fecha_desde} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',gap:'10px',alignItems:'flex-start'}}>
                <div style={{flex:1}}>
                  <div style={{fontWeight:600,fontSize:'14px'}}>{l.tipo}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{l.fecha_desde}{l.fecha_hasta!==l.fecha_desde?' → '+l.fecha_hasta:''}</div>
                  {l.reemplazo_nombre && <div style={{fontSize:'11px',color:'var(--v)',marginTop:'2px'}}>Reemplazo: {l.reemplazo_nombre} · {l.reemplazo_horas}hs</div>}
                </div>
                <div style={{display:'flex',flexDirection:'column',alignItems:'flex-end',gap:'4px',flexShrink:0}}>
                  <span style={{fontSize:'10px',fontWeight:700,padding:'2px 8px',borderRadius:'20px',
                    background: l.es_paga ? 'var(--greenl)' : 'var(--redl)',
                    color: l.es_paga ? 'var(--green)' : 'var(--red)'}}>
                    {l.es_paga ? 'Paga' : 'Impaga'}
                  </span>
                  {puedeCargarLicencias && (
                    <div style={{display:'flex',gap:'4px'}}>
                      <button onClick={() => { setLicEditando({...l}); setModalEditLic(true) }}
                        style={{padding:'3px 8px',background:'var(--vl)',color:'var(--v)',border:'1px solid var(--v)',borderRadius:'6px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                        Editar
                      </button>
                      <button onClick={() => eliminarLic(l.id, selId!)}
                        style={{padding:'3px 8px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'6px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                        Eliminar
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          ))}
        </Card>}

        {tab === 'liquidacion' && <LiquidacionTab prof={sel} licencias={licencias} />}

        {modalEditLic && licEditando && <ModalSheet title="Editar licencia" onClose={() => setModalEditLic(false)}>
          <Field2 label="Tipo">
            <select style={IS} value={licEditando.tipo} onChange={e=>setLicEditando({...licEditando,tipo:e.target.value})}>
              {TIPOS_LIC.map(t=><option key={t}>{t}</option>)}
            </select>
          </Field2>
          <Row2>
            <Field2 label="Desde"><input style={IS} type="date" value={licEditando.fecha_desde} onChange={e=>setLicEditando({...licEditando,fecha_desde:e.target.value})} /></Field2>
            <Field2 label="Hasta"><input style={IS} type="date" value={licEditando.fecha_hasta} onChange={e=>setLicEditando({...licEditando,fecha_hasta:e.target.value})} /></Field2>
          </Row2>
          <Field2 label="¿Licencia paga?">
            <select style={IS} value={licEditando.es_paga ? 'si' : 'no'} onChange={e=>setLicEditando({...licEditando,es_paga:e.target.value==='si'})}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </Field2>
          <Field2 label={licEditando.tipo==='Reemplazo docente'?'Docente que reemplazó *':'Docente reemplazo (opcional)'}>
            <select style={IS} value={licEditando.reemplazo_profesora_id||''} onChange={e => {
              const p = profesoras.find((x:any) => x.id === e.target.value)
              setLicEditando({...licEditando, reemplazo_profesora_id: e.target.value, reemplazo_nombre: p ? p.nombre+' '+p.apellido : ''})
            }}>
              <option value="">— Seleccionar docente —</option>
              {profesoras.filter((p:any) => p.id !== selId).map((p:any) => (
                <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>
              ))}
            </select>
          </Field2>
          {(licEditando.reemplazo_profesora_id||licEditando.reemplazo_nombre) && <Field2 label="Horas dictadas por reemplazo">
            <input style={IS} type="number" min="0" value={licEditando.reemplazo_horas||0} onChange={e=>setLicEditando({...licEditando,reemplazo_horas:Number(e.target.value)})} />
          </Field2>}
          <Field2 label="Observaciones"><Input value={licEditando.observaciones||''} onChange={(v:string)=>setLicEditando({...licEditando,observaciones:v})} placeholder="Opcional..." /></Field2>
          <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
            <BtnG style={{flex:1}} onClick={() => setModalEditLic(false)}>Cancelar</BtnG>
            <BtnP style={{flex:2}} onClick={guardarEditLic}>Guardar cambios</BtnP>
          </div>
        </ModalSheet>}

        {confirmDelete && <ModalSheet title="¿Eliminar docente?" onClose={() => setConfirmDelete(false)}>
          <p style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción desactiva a la docente del sistema.</p>
          <div style={{display:'flex',gap:'10px'}}>
            <BtnG style={{flex:1}} onClick={() => setConfirmDelete(false)}>Cancelar</BtnG>
            <button onClick={eliminar} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
          </div>
        </ModalSheet>}

        {modalLic && <ModalSheet title="Registrar licencia" onClose={() => setModalLic(false)}>
          <Field2 label="Tipo">
            <select style={IS} value={lic.tipo} onChange={e=>setLic({...lic,tipo:e.target.value})}>
              {TIPOS_LIC.map(t=><option key={t}>{t}</option>)}
            </select>
          </Field2>
          <Row2>
            <Field2 label="Desde"><input style={IS} type="date" value={lic.fecha_desde} onChange={e=>setLic({...lic,fecha_desde:e.target.value})} /></Field2>
            <Field2 label="Hasta"><input style={IS} type="date" value={lic.fecha_hasta} onChange={e=>setLic({...lic,fecha_hasta:e.target.value})} /></Field2>
          </Row2>
          <Field2 label="¿Licencia paga?">
            <select style={IS} value={lic.es_paga ? 'si' : 'no'} onChange={e=>setLic({...lic,es_paga:e.target.value==='si'})}>
              <option value="si">Sí</option>
              <option value="no">No</option>
            </select>
          </Field2>
          <Field2 label={lic.tipo === 'Reemplazo docente' ? 'Docente que reemplazó *' : 'Docente reemplazo (opcional)'}>
            <select style={IS} value={lic.reemplazo_profesora_id||''} onChange={e => {
              const p = profesoras.find((x:any) => x.id === e.target.value)
              setLic({...lic, reemplazo_profesora_id: e.target.value, reemplazo_nombre: p ? p.nombre+' '+p.apellido : ''})
            }}>
              <option value="">— Seleccionar docente —</option>
              {profesoras.filter((p:any) => p.id !== selId).map((p:any) => (
                <option key={p.id} value={p.id}>{p.nombre} {p.
