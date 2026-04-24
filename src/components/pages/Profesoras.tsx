'use client'
import { useState, useEffect, useRef } from 'react'
import { useProfesoras, useHorasHistorial, useLiquidaciones } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

function hoy() { return new Date().toISOString().split('T')[0] }
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

const COLORES = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#1B6B4A','#7d3aab','#2d5016']
const MESES_S = ['Ene','Feb','Mar','Abr','May','Jun']
const TIPOS_LIC = ['Licencia médica','Licencia personal','Ausencia justificada','Ausencia injustificada','Vacaciones','Reemplazo docente']

type Vista = 'lista' | 'detalle' | 'form'

export default function Profesoras() {
  const { profesoras, loading, actualizar, agregar, recargar } = useProfesoras()
  const { usuario } = useAuth()
  const [vista, setVista] = useState<Vista>('lista')
  const [selId, setSelId] = useState<string|null>(null)
  const [tab, setTab] = useState<'datos'|'licencias'|'liquidacion'>('datos')
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
  const selLive = profesoras.find(p => p.id === selId)
  const selRef = useRef<any>(null)
  if (selLive) selRef.current = selLive
  const sel = selLive ?? selRef.current

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
    setForm({ nombre:'', apellido:'', email:'', fecha_nacimiento:'', telefono:'', tipo_colaborador:'docente', tarifa_hora:0, horas_semana:0, sueldo_fijo:0, tipo_contrato:'hora', color: COLORES[profesoras.length % COLORES.length] })
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
    const { error: inactErr } = await sb.from('profesoras').update({ activa: false }).eq('id', selId)
    if (!inactErr) recargar()
    else console.error('[inactivar profesora]', inactErr.message)
  }

  const guardarLic = async () => {
    if (!selId) return
    setModalLic(false)
    const datos = { ...lic, profesora_id: selId }
    // Resetear form para próxima licencia
    setLic({ tipo:'Licencia médica', fecha_desde:hoy(), fecha_hasta:hoy(), observaciones:'', reemplazo_nombre:'', reemplazo_horas:0, es_paga:false, reemplazo_profesora_id:'' })
    try {
      const res = await fetch('/api/guardar-licencia', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify(datos)
      })
      const json = await res.json()
      if (json.data) {
        setLicencias(prev => [json.data, ...prev])
        showToast('✓ Licencia registrada')
      } else {
        console.error('[guardarLic]', json.error)
        showToast('Error al guardar la licencia', 'error')
      }
    } catch(e: any) {
      console.error('[guardarLic] catch:', e?.message)
      showToast('Error de conexión', 'error')
    }
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
        <SL>{profesoras.length} colaboradores</SL>
        <div style={{display:'flex',gap:'8px',alignItems:'center'}}>
          {soloLectura && <Badge cls="b-purple">Solo lectura</Badge>}
          {puedeEditar && <BtnP sm onClick={irAFormNuevo}>+ Nuevo colaborador</BtnP>}
        </div>
      </div>
      {profesoras.map(p => (
        <ListItem key={p.id} onClick={() => irADetalle(p.id)}>
          <Av color={p.color} size={44}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
          <div style={{flex:1,minWidth:0}}>
            <div style={{fontSize:'15px',fontWeight:600}}>{p.nombre} {p.apellido} {p.tipo_colaborador && p.tipo_colaborador !== 'docente' && <span style={{fontSize:'10px',fontWeight:600,padding:'1px 6px',borderRadius:'8px',background:'var(--bluel)',color:'var(--blue)',marginLeft:'6px'}}>{p.tipo_colaborador}</span>}</div>
            <div style={{fontSize:'12.5px',color:'var(--text2)',marginTop:'2px'}}>
              {p.tipo_contrato === 'fijo'
                ? `$${(p.sueldo_fijo||0).toLocaleString('es-AR')}/mes`
                : `${p.horas_semana}hs/sem`}
            </div>
          </div>

          <Chevron />
        </ListItem>
      ))}
    </div>
  )

  // ── FORMULARIO ──
  if (vista === 'form') return (
    <div className="fade-in">
      <BtnG sm onClick={() => form?.id ? irADetalle(form.id) : irALista()} style={{marginBottom:'20px'}}>← Cancelar</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>{form?.id ? 'Editar colaborador' : 'Nuevo colaborador'}</div>
      <Card>
        <Row2>
          <Field2 label="Nombre *"><Input value={form?.nombre||''} onChange={(v:string)=>setForm({...form,nombre:v})} /></Field2>
          <Field2 label="Apellido *"><Input value={form?.apellido||''} onChange={(v:string)=>setForm({...form,apellido:v})} /></Field2>
        </Row2>
        <Field2 label="Email"><Input type="email" value={form?.email||''} onChange={(v:string)=>setForm({...form,email:v})} /></Field2>
        <Row2>
          <Field2 label="Fecha de nacimiento">
              <input style={IS} type="date" value={form?.fecha_nacimiento||''} onChange={e=>setForm({...form,fecha_nacimiento:e.target.value})} />
            </Field2>
          <Field2 label="Teléfono"><Input value={form?.telefono||''} onChange={(v:string)=>setForm({...form,telefono:v})} /></Field2>
        </Row2>
        <Row2>
          <Field2 label="Tipo">
            <select style={IS} value={form?.tipo_colaborador||'docente'} onChange={e=>setForm({...form,tipo_colaborador:e.target.value})}>
              <option value="docente">Docente</option>
              <option value="secretaria">Secretaria</option>
              <option value="coordinadora">Coordinadora</option>
            </select>
          </Field2>
          <Field2 label="Tipo de contrato">
            <select style={IS} value={form?.tipo_contrato||'hora'} onChange={e=>setForm({...form,tipo_contrato:e.target.value})}>
              <option value="hora">Por hora</option>
              <option value="fijo">Sueldo fijo mensual</option>
            </select>
          </Field2>
        </Row2>
        {(form?.tipo_contrato||'hora') === 'hora' ? (
          <Row2>
            <Field2 label="Tarifa/hora ($)"><Input type="number" value={form?.tarifa_hora||''} onChange={(v:string)=>setForm({...form,tarifa_hora:+v})} /></Field2>
            <Field2 label="Horas por semana"><input type="number" step="0.5" min="0" value={form?.horas_semana||''} onChange={e=>setForm({...form,horas_semana:parseFloat(e.target.value)||0})} style={IS} /></Field2>
          </Row2>
        ) : (
          <Field2 label="Sueldo mensual ($)"><Input type="number" value={form?.sueldo_fijo||''} onChange={(v:string)=>setForm({...form,sueldo_fijo:+v})} /></Field2>
        )}
      </Card>
      <div style={{display:'flex',gap:'10px',marginTop:'4px'}}>
        <BtnG style={{flex:1}} onClick={() => form?.id ? irADetalle(form.id) : irALista()}>Cancelar</BtnG>
        <BtnP style={{flex:2}} onClick={guardar} disabled={guardando}>
          {guardando ? 'Guardando...' : form?.id ? 'Guardar cambios' : 'Crear colaborador'}
        </BtnP>
      </div>
    </div>
  )

  // ── DETALLE ──
  if (vista === 'detalle') {
    if (!sel) return <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
    const liq = sel.tipo_contrato === 'fijo'
    ? (sel.sueldo_fijo || 0)
    : (sel.horas_semana || 0) * 4 * (sel.tarifa_hora || 0)
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
                {!soloLectura && (
                  sel.tipo_contrato === 'fijo'
                    ? <Badge cls="b-green">${(sel.sueldo_fijo||0).toLocaleString('es-AR')}/mes</Badge>
                    : <Badge cls="b-green">${sel.tarifa_hora?.toLocaleString('es-AR')}/h</Badge>
                )}
              </div>
            </div>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'1px',background:'var(--border)',borderRadius:'12px',overflow:'hidden'}}>
            <Kpi val={sel.tipo_contrato==='fijo' ? `$${(sel.sueldo_fijo||0).toLocaleString('es-AR')}` : `${sel.horas_semana}hs`} label={sel.tipo_contrato==='fijo' ? 'Sueldo fijo' : 'Semanal'} color="var(--v)" />
            {!soloLectura ? <Kpi val={`$${Math.round(liq/1000)}k`} label="Liquidación" color="var(--v)" /> : (() => {
              const edad = sel.fecha_nacimiento ? Math.floor((Date.now() - new Date(sel.fecha_nacimiento+'T12:00:00').getTime()) / (365.25*24*3600*1000)) : null
              return <Kpi val={edad !== null ? `${edad} años` : '—'} label="Edad" />
            })()}
            <Kpi val={licencias.length} label="Licencias" />
          </div>
        </div>

        <div style={{display:'flex',gap:'6px',marginBottom:'18px',overflowX:'auto'}}>
          <TabBtn active={tab==='datos'} onClick={() => setTab('datos')}>Datos</TabBtn>

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
            <FieldRO label="Fecha de nacimiento" value={sel.fecha_nacimiento ? new Date(sel.fecha_nacimiento+'T12:00:00').toLocaleDateString('es-AR',{day:'2-digit',month:'2-digit',year:'numeric'}) : '—'} />
            {sel.fecha_nacimiento && (() => {
              const edad = Math.floor((Date.now() - new Date(sel.fecha_nacimiento+'T12:00:00').getTime()) / (365.25*24*3600*1000))
              return <FieldRO label="Edad" value={`${edad} años`} />
            })()}
            <FieldRO label="Teléfono" value={sel.telefono||'—'} />
          </Row2>
          <Row2>
            {!soloLectura && (
              sel.tipo_contrato === 'fijo'
                ? <FieldRO label="Sueldo mensual" value={`$${(sel.sueldo_fijo||0).toLocaleString('es-AR')}`} />
                : <FieldRO label="Tarifa/hora" value={`$${sel.tarifa_hora?.toLocaleString('es-AR')}`} />
            )}
          </Row2>
          {sel.tipo_contrato !== 'fijo' && <FieldRO label="Horas por semana" value={`${sel.horas_semana}hs`} />}
          <FieldRO label="Tipo de contrato" value={sel.tipo_contrato === 'fijo' ? 'Sueldo fijo mensual' : 'Por hora'} />
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
                <option key={p.id} value={p.id}>{p.nombre} {p.apellido} {p.tipo_colaborador && p.tipo_colaborador !== 'docente' && <span style={{fontSize:'10px',fontWeight:600,padding:'1px 6px',borderRadius:'8px',background:'var(--bluel)',color:'var(--blue)',marginLeft:'6px'}}>{p.tipo_colaborador}</span>}</option>
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

        {confirmDelete && <ModalSheet title="¿Eliminar colaborador?" onClose={() => setConfirmDelete(false)}>
          <p style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción desactiva al colaborador del sistema.</p>
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
                <option key={p.id} value={p.id}>{p.nombre} {p.apellido} {p.tipo_colaborador && p.tipo_colaborador !== 'docente' && <span style={{fontSize:'10px',fontWeight:600,padding:'1px 6px',borderRadius:'8px',background:'var(--bluel)',color:'var(--blue)',marginLeft:'6px'}}>{p.tipo_colaborador}</span>}</option>
              ))}
            </select>
          </Field2>
          {lic.reemplazo_profesora_id && <Field2 label="Horas dictadas por reemplazo">
            <input style={IS} type="number" min="0" value={lic.reemplazo_horas} onChange={e=>setLic({...lic,reemplazo_horas:Number(e.target.value)})} placeholder="0" />
          </Field2>}
          {lic.reemplazo_profesora_id && <div style={{padding:'10px 12px',background:'var(--vl)',borderRadius:'10px',fontSize:'12px',color:'var(--v)',marginBottom:'8px'}}>
            💡 Suma en liquidación de {lic.reemplazo_nombre} y resta en la docente ausente.
          </div>}
          <Field2 label="Observaciones"><Input value={lic.observaciones} onChange={(v:string)=>setLic({...lic,observaciones:v})} placeholder="Opcional..." /></Field2>
          <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
            <BtnG style={{flex:1}} onClick={() => setModalLic(false)}>Cancelar</BtnG>
            <BtnP style={{flex:2}} onClick={guardarLic}>Guardar</BtnP>
          </div>
        </ModalSheet>}
      </div>
    )
  }

  return null
}

function LiquidacionTab({ prof, licencias }: any) {
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
  const mesActual = MESES[new Date().getMonth()]
  const anioActual = new Date().getFullYear()

  const [mesLiq, setMesLiq] = useState(mesActual)
  const [anioLiq, setAnioLiq] = useState(anioActual)

  // ── Tipo de contrato ─────────────────────────────────────────────────
  // 'hora' = horas/semana × semanas × tarifa | 'fijo' = monto fijo mensual
  const [tipoContrato, setTipoContrato] = useState<'hora'|'fijo'>(
    prof.tipo_contrato === 'fijo' ? 'fijo' : (prof.horas_semana && prof.horas_semana > 0) ? 'hora' : 'fijo'
  )
  const [semanasLiq, setSemanasLiq] = useState(4)
  // Pre-cargar sueldo fijo del perfil
  const [sueldoFijo, setSueldoFijo] = useState<number>(prof.sueldo_fijo || 0)

  // ── Conceptos libres ──────────────────────────────────────────────────
  // Cada ítem: { id, label, monto, signo: '+' | '-' }
  const [conceptos, setConceptos] = useState<{id:number,label:string,monto:number,signo:'+'|'-'}[]>([])

  // ── Descuento por licencias ───────────────────────────────────────────
  const [diasAusente, setDiasAusente] = useState(0)

  // ── Estados internos ──────────────────────────────────────────────────
  const [guardandoLiq, setGuardandoLiq] = useState(false)
  const [liqGuardada, setLiqGuardada] = useState(false)
  const [estadoLiq, setEstadoLiq] = useState<'borrador'|'confirmada'>('confirmada')
  const [liqEditando, setLiqEditando] = useState<any>(null)
  const [guardandoEdit, setGuardandoEdit] = useState(false)
  const [confirmDelLiq, setConfirmDelLiq] = useState<any>(null)

  const { liquidaciones, guardar: guardarLiq, recargar: recargarLiqs } = useLiquidaciones(prof.id)
  const { historial: histHoras } = useHorasHistorial(prof.id)
  const [licComoReemplazo, setLicComoReemplazo] = useState<any[]>([])

  useEffect(() => {
    if (!prof.id) return
    createClient().from('licencias_profesoras')
      .select('*, profesoras!licencias_profesoras_profesora_id_fkey(nombre,apellido,tarifa_hora)')
      .eq('reemplazo_profesora_id', prof.id)
      .then(({ data }) => setLicComoReemplazo(data || []))
      .catch(() => {})
  }, [prof.id])

  // ── Cálculos ─────────────────────────────────────────────────────────
  const base = tipoContrato === 'hora'
    ? (prof.horas_semana || 0) * semanasLiq * (prof.tarifa_hora || 0)
    : (sueldoFijo || prof.sueldo_fijo || 0)

  // Filtrar reemplazos solo del mes seleccionado
  const licReemplazoMes = licComoReemplazo.filter((l: any) => {
    if (!l.fecha_desde) return false
    const [anioL, mesL] = l.fecha_desde.split('-').map(Number)
    const mesIdx = MESES.indexOf(mesLiq)
    return anioL === anioLiq && mesL === mesIdx + 1
  })
  const totalReemplazos = licReemplazoMes.reduce((s:number, l:any) =>
    s + (l.reemplazo_horas || 0) * (prof.tarifa_hora || 0), 0)

  const totalConceptos = conceptos.reduce((s, c) =>
    s + (c.signo === '+' ? (c.monto || 0) : -(c.monto || 0)), 0)

  // Descuento por días ausentes: proporcional al base (base / 22 días hábiles × días)
  const descuentoLicencias = diasAusente > 0 ? Math.round(base / 22 * diasAusente) : 0

  const total = Math.max(0, base + totalReemplazos + totalConceptos - descuentoLicencias)

  // ── Helpers de conceptos ──────────────────────────────────────────────
  const addConcepto = () =>
    setConceptos(prev => [...prev, { id: Date.now(), label: '', monto: 0, signo: '+' }])

  const updateConcepto = (id: number, field: string, val: any) =>
    setConceptos(prev => prev.map(c => c.id === id ? { ...c, [field]: val } : c))

  const removeConcepto = (id: number) =>
    setConceptos(prev => prev.filter(c => c.id !== id))

  // ── Guardar liquidación ───────────────────────────────────────────────
  const confirmarLiquidacion = async () => {
    setGuardandoLiq(true)
    // Serializamos los conceptos libres en ajuste_concepto (JSON) para no cambiar la DB
    const conceptosJson = JSON.stringify(conceptos.filter(c => c.monto > 0 && c.label))
    await guardarLiq({
      profesora_id: prof.id,
      profesora_nombre: `${prof.nombre} ${prof.apellido}`,
      mes: mesLiq,
      anio: anioLiq,
      horas_semana: tipoContrato === 'hora' ? prof.horas_semana : 0,
      horas_mes: tipoContrato === 'hora' ? (prof.horas_semana || 0) * semanasLiq : 0,
      tarifa_hora: tipoContrato === 'hora' ? prof.tarifa_hora : 0,
      subtotal: base,
      ajuste: totalConceptos,
      ajuste_concepto: conceptosJson,
      descuento_licencias: descuentoLicencias,
      descuento_concepto: diasAusente > 0 ? `${diasAusente} días ausente` : '',
      total,
      estado: estadoLiq,
    })
    setGuardandoLiq(false)
    setLiqGuardada(true)
    setTimeout(() => setLiqGuardada(false), 3000)
  }

  // ── Guardar edición de liq anterior ───────────────────────────────────
  const guardarEdicionLiq = async () => {
    if (!liqEditando) return
    setGuardandoEdit(true)
    const newTotal = Math.max(0,
      (liqEditando.subtotal || 0) +
      (liqEditando.ajuste || 0) -
      (liqEditando.descuento_licencias || 0)
    )
    const res = await fetch('/api/liquidaciones', {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        id: liqEditando.id,
        subtotal: liqEditando.subtotal || 0,
        ajuste: liqEditando.ajuste || 0,
        ajuste_concepto: liqEditando.ajuste_concepto || '',
        descuento_licencias: liqEditando.descuento_licencias || 0,
        descuento_concepto: liqEditando.descuento_concepto || '',
        estado: liqEditando.estado,
        total: newTotal,
      })
    })
    const json = await res.json()
    if (!json.error) await recargarLiqs()
    setGuardandoEdit(false)
    setLiqEditando(null)
  }

  const eliminarLiq = async (id: string) => {
    await fetch('/api/liquidaciones', {
      method: 'DELETE',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ id })
    })
    await recargarLiqs()
    setConfirmDelLiq(null)
  }

  // ── Generar PDF ───────────────────────────────────────────────────────
  const descargarPDF = (liqGuardadaData?: any) => {
    // Si se pasa una liquidación guardada, usar sus datos; sino usar el estado actual
    const conceptosParaPDF = liqGuardadaData
      ? (() => {
          try { return JSON.parse(liqGuardadaData.ajuste_concepto || '[]') } catch { return [] }
        })()
      : conceptos

    const basePDF = liqGuardadaData ? (liqGuardadaData.subtotal || 0) : base
    const totalReemplazosPDF = liqGuardadaData ? 0 : totalReemplazos // reemplazos ya en subtotal si es guardada
    const descuentoLicenciasPDF = liqGuardadaData ? (liqGuardadaData.descuento_licencias || 0) : descuentoLicencias
    const diasAusentePDF = liqGuardadaData ? (parseInt(liqGuardadaData.descuento_concepto?.match(/\d+/)?.[0] || '0')) : diasAusente
    const totalPDF = liqGuardadaData ? (liqGuardadaData.total || 0) : total
    const mesLiqPDF = liqGuardadaData ? (liqGuardadaData.mes || mesLiq) : mesLiq
    const anioLiqPDF = liqGuardadaData ? (liqGuardadaData.anio || anioLiq) : anioLiq

    const filasConceptos = conceptosParaPDF
      .filter((c: any) => c.monto > 0 && c.label)
      .map((c: any) => `<tr><td style="color:${c.signo==='+'?'#2d7a4f':'#c0392b'}">${c.label}</td><td style="text-align:right;color:${c.signo==='+'?'#2d7a4f':'#c0392b'};font-weight:600">${c.signo==='+'?'+':'-'}$${(c.monto||0).toLocaleString('es-AR')}</td></tr>`)
      .join('')

    const filaBase = tipoContrato === 'hora'
      ? `<tr><td style="color:#888">Hs/semana</td><td style="text-align:right">${prof.horas_semana}hs</td></tr>
         <tr><td style="color:#888">Hs/mes (${semanasLiq} sem)</td><td style="text-align:right">${(prof.horas_semana||0)*semanasLiq}hs</td></tr>
         <tr><td style="color:#888">Tarifa/hora</td><td style="text-align:right">$${prof.tarifa_hora?.toLocaleString('es-AR')}</td></tr>`
      : `<tr><td style="color:#888">Modalidad</td><td style="text-align:right">Sueldo fijo</td></tr>`

    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Liquidacion ${prof.nombre} ${prof.apellido} ${mesLiqPDF} ${anioLiqPDF}</title><style>
      body{font-family:Arial,sans-serif;padding:32px;font-size:14px;color:#333}
      h1{color:#652f8d;font-size:20px;margin:0 0 4px}
      .sub{color:#888;font-size:13px;margin-bottom:20px}
      .hd{display:flex;justify-content:space-between;align-items:center;border-bottom:3px solid #652f8d;padding-bottom:14px;margin-bottom:20px}
      .logo{font-size:20px;font-weight:700;color:#333}.logo span{color:#652f8d}
      table{width:100%;border-collapse:collapse;margin:16px 0}
      td{padding:11px 8px;border-bottom:1px solid #eee;font-size:14px}
      .total{background:#f2e8f9;padding:16px 20px;border-radius:10px;display:flex;justify-content:space-between;align-items:center;margin-top:20px}
      .total-label{font-size:16px;font-weight:600;color:#652f8d}
      .total-value{font-size:24px;font-weight:700;color:#652f8d}
      @media print{body{padding:16px}}
    </style></head><body>
    <div class="hd">
      <div class="logo"><span>Edu</span>Gest</div>
      <div style="color:#888;font-size:12px">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
    </div>
    <h1>Liquidación — ${mesLiqPDF} ${anioLiqPDF}</h1>
    <div class="sub">${prof.nombre} ${prof.apellido}</div>
    <table>
      ${filaBase}
      <tr><td style="color:#888;font-weight:600">Subtotal base</td><td style="text-align:right;font-weight:700">$${basePDF.toLocaleString('es-AR')}</td></tr>
      ${totalReemplazosPDF > 0 ? `<tr><td style="color:#2d7a4f">Reemplazos realizados</td><td style="text-align:right;color:#2d7a4f;font-weight:600">+$${totalReemplazosPDF.toLocaleString('es-AR')}</td></tr>` : ''}
      ${filasConceptos}
      ${descuentoLicenciasPDF > 0 ? `<tr><td style="color:#c0392b">Descuento ausencias (${diasAusentePDF} días)</td><td style="text-align:right;color:#c0392b;font-weight:600">-$${descuentoLicenciasPDF.toLocaleString('es-AR')}</td></tr>` : ''}
    </table>
    <div class="total">
      <span class="total-label">Total a liquidar</span>
      <span class="total-value">$${totalPDF.toLocaleString('es-AR')}</span>
    </div>
    <script>setTimeout(function(){window.print()},500)</script>
    </body></html>`

    const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
    const url = URL.createObjectURL(blob)
    const win = window.open(url, '_blank')
    if (!win) {
      const a = document.createElement('a')
      a.href = url
      a.download = `liquidacion-${prof.nombre}-${prof.apellido}-${mesLiq}-${anioLiq}.html`
      a.click()
    }
    setTimeout(() => URL.revokeObjectURL(url), 10000)
  }

  // ─────────────────────────────────────────────────────────────────────
  return (
    <Card>
      {/* ── SELECTOR MES/AÑO ── */}
      <div style={{display:'flex',gap:'10px',marginBottom:'16px'}}>
        <div style={{flex:1}}>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Mes</div>
          <select style={IS} value={mesLiq} onChange={e=>{setMesLiq(e.target.value);setDiasAusente(0)}}>
            {MESES.map(m=><option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{flex:1}}>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Año</div>
          <select style={IS} value={anioLiq} onChange={e=>{setAnioLiq(+e.target.value);setDiasAusente(0)}}>
            {[2024,2025,2026,2027].map(y=><option key={y}>{y}</option>)}
          </select>
        </div>
      </div>

      {/* ── TIPO DE CONTRATO ── */}
      <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
        {(['hora','fijo'] as const).map(t => (
          <button key={t} onClick={() => setTipoContrato(t)}
            style={{flex:1,padding:'9px',borderRadius:'10px',border:'1.5px solid',fontSize:'13px',fontWeight:600,cursor:'pointer',
              borderColor: tipoContrato===t ? 'var(--v)' : 'var(--border)',
              background: tipoContrato===t ? 'var(--vl)' : 'var(--white)',
              color: tipoContrato===t ? 'var(--v)' : 'var(--text2)'}}>
            {t === 'hora' ? 'Por hora' : 'Sueldo fijo'}
          </button>
        ))}
      </div>

      {/* ── BASE DE CÁLCULO ── */}
      <div style={{background:'var(--bg)',borderRadius:'12px',border:'1.5px solid var(--border)',padding:'14px',marginBottom:'12px'}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'12px'}}>Base de cálculo</div>

        {tipoContrato === 'hora' ? (
          <>
            {[
              ['Horas semanales', `${prof.horas_semana}hs`, null],
              ['Tarifa por hora', `$${prof.tarifa_hora?.toLocaleString('es-AR')}`, null],
            ].map(([k,v]) => (
              <div key={k as string} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
                <span style={{fontSize:'13px',color:'var(--text2)'}}>{k}</span>
                <span style={{fontSize:'13px',fontWeight:500}}>{v}</span>
              </div>
            ))}
            <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
              <span style={{fontSize:'13px',color:'var(--text2)'}}>Semanas en el mes</span>
              <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                {[4,5].map(n => (
                  <button key={n} onClick={() => setSemanasLiq(n)}
                    style={{width:'36px',height:'30px',borderRadius:'8px',border:'1.5px solid',fontSize:'13px',fontWeight:600,cursor:'pointer',
                      borderColor: semanasLiq===n ? 'var(--v)' : 'var(--border)',
                      background: semanasLiq===n ? 'var(--vl)' : 'var(--white)',
                      color: semanasLiq===n ? 'var(--v)' : 'var(--text2)'}}>
                    {n}
                  </button>
                ))}
              </div>
            </div>
          </>
        ) : (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'8px 0',borderBottom:'1px solid var(--border)'}}>
            <span style={{fontSize:'13px',color:'var(--text2)'}}>Sueldo fijo del mes</span>
            <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
              <span style={{fontSize:'12px',color:'var(--text3)'}}>$</span>
              <input type="number" min="0" step="1000"
                value={sueldoFijo||''}
                onChange={e => setSueldoFijo(parseFloat(e.target.value)||0)}
                placeholder={String(prof.sueldo_fijo || 0)}
                style={{width:'110px',padding:'6px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'14px',fontWeight:600,textAlign:'right',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}}
              />
            </div>
          </div>
        )}

        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'10px 0 0'}}>
          <span style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>Subtotal base</span>
          <span style={{fontSize:'16px',fontWeight:700,color:'var(--text)'}}>${base.toLocaleString('es-AR')}</span>
        </div>
      </div>

      {/* ── REEMPLAZOS (si aplica) ── */}
      {totalReemplazos > 0 && (
        <div style={{padding:'12px 14px',background:'var(--greenl)',borderRadius:'12px',border:'1.5px solid #a8d8b4',marginBottom:'12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700,color:'var(--green)'}}>+ Reemplazos realizados</div>
              {licReemplazoMes.map((l:any,i:number) => (
                <div key={i} style={{fontSize:'11px',color:'var(--text2)',marginTop:'3px'}}>
                  {(l.profesoras as any)?.nombre} · {l.fecha_desde} · {l.reemplazo_horas}hs
                </div>
              ))}
            </div>
            <div style={{fontSize:'16px',fontWeight:700,color:'var(--green)',flexShrink:0}}>+${totalReemplazos.toLocaleString('es-AR')}</div>
          </div>
        </div>
      )}

      {/* ── CONCEPTOS LIBRES ── */}
      <div style={{background:'var(--bg)',borderRadius:'12px',border:'1.5px solid var(--border)',padding:'14px',marginBottom:'12px'}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'10px'}}>Conceptos adicionales</div>

        {conceptos.map(c => (
          <div key={c.id} style={{display:'flex',gap:'6px',alignItems:'center',marginBottom:'8px'}}>
            <select
              value={c.signo}
              onChange={e => updateConcepto(c.id, 'signo', e.target.value)}
              style={{width:'52px',padding:'7px 4px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'13px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)',textAlign:'center'}}>
              <option value="+">+</option>
              <option value="-">−</option>
            </select>
            <input type="text"
              value={c.label}
              onChange={e => updateConcepto(c.id, 'label', e.target.value)}
              placeholder="Concepto (ej: bono, plus, material...)"
              style={{flex:1,padding:'7px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'13px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}}
            />
            <input type="number" min="0" step="100"
              value={c.monto||''}
              onChange={e => updateConcepto(c.id, 'monto', parseFloat(e.target.value)||0)}
              placeholder="$0"
              style={{width:'90px',padding:'7px 8px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'13px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)',textAlign:'right'}}
            />
            <button onClick={() => removeConcepto(c.id)}
              style={{width:'30px',height:'30px',display:'flex',alignItems:'center',justifyContent:'center',background:'var(--redl)',color:'var(--red)',border:'none',borderRadius:'7px',cursor:'pointer',fontSize:'16px',flexShrink:0}}>
              ×
            </button>
          </div>
        ))}

        <button onClick={addConcepto}
          style={{width:'100%',padding:'8px',border:'1.5px dashed var(--border)',borderRadius:'8px',background:'transparent',color:'var(--text3)',fontSize:'13px',cursor:'pointer',marginTop: conceptos.length > 0 ? '4px' : '0'}}>
          + Agregar concepto
        </button>
      </div>

      {/* ── DESCUENTO POR LICENCIAS ── */}
      <div style={{background:'#fff5f5',borderRadius:'12px',border:'1.5px solid #f5c5c5',padding:'14px',marginBottom:'12px'}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'10px'}}>Descuento por ausencias</div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
          <span style={{fontSize:'13px',color:'var(--text2)'}}>Días ausente en {mesLiq}</span>
          <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
            <button onClick={() => setDiasAusente(d => Math.max(0, d-1))}
              style={{width:'28px',height:'28px',borderRadius:'7px',border:'1.5px solid var(--border)',background:'var(--white)',color:'var(--text2)',fontSize:'16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>−</button>
            <span style={{fontSize:'15px',fontWeight:700,minWidth:'24px',textAlign:'center'}}>{diasAusente}</span>
            <button onClick={() => setDiasAusente(d => d+1)}
              style={{width:'28px',height:'28px',borderRadius:'7px',border:'1.5px solid var(--border)',background:'var(--white)',color:'var(--text2)',fontSize:'16px',cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center'}}>+</button>
          </div>
        </div>
        {descuentoLicencias > 0 && (
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'8px',paddingTop:'8px',borderTop:'1px solid #f5c5c5'}}>
            <span style={{fontSize:'12px',color:'var(--red)'}}>Descuento calculado ({diasAusente} días / 22)</span>
            <span style={{fontSize:'13px',fontWeight:700,color:'var(--red)'}}>-${descuentoLicencias.toLocaleString('es-AR')}</span>
          </div>
        )}
      </div>

      {/* ── RESUMEN Y TOTAL ── */}
      <div style={{borderRadius:'12px',border:'2px solid var(--v)',overflow:'hidden',marginBottom:'14px'}}>
        <div style={{padding:'10px 14px',background:'var(--bg)',borderBottom:'1px solid var(--border)'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'8px'}}>Resumen</div>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',color:'var(--text2)',marginBottom:'4px'}}>
            <span>Subtotal base</span><span>${base.toLocaleString('es-AR')}</span>
          </div>
          {totalReemplazos > 0 && (
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',color:'var(--green)',marginBottom:'4px'}}>
              <span>Reemplazos</span><span>+${totalReemplazos.toLocaleString('es-AR')}</span>
            </div>
          )}
          {conceptos.filter(c => c.monto > 0 && c.label).map(c => (
            <div key={c.id} style={{display:'flex',justifyContent:'space-between',fontSize:'13px',color:c.signo==='+'?'var(--green)':'var(--red)',marginBottom:'4px'}}>
              <span>{c.label}</span>
              <span>{c.signo==='+'?'+':'-'}${c.monto.toLocaleString('es-AR')}</span>
            </div>
          ))}
          {descuentoLicencias > 0 && (
            <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',color:'var(--red)',marginBottom:'4px'}}>
              <span>Descuento ausencias</span><span>-${descuentoLicencias.toLocaleString('es-AR')}</span>
            </div>
          )}
        </div>
        <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'14px',background:'var(--vl)'}}>
          <span style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>Total a liquidar</span>
          <span style={{fontSize:'24px',fontWeight:700,color:total>=0?'var(--v)':'var(--red)'}}>${total.toLocaleString('es-AR')}</span>
        </div>
      </div>

      {/* ── SWITCH BORRADOR / CONFIRMAR ── */}
      <div style={{background:'var(--bg)',borderRadius:'12px',border:'1.5px solid var(--border)',padding:'14px',marginBottom:'12px'}}>
        <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',marginBottom:'10px'}}>Estado de liquidación</div>
        <div style={{display:'flex',gap:'6px',marginBottom:'12px'}}>
          {(['borrador','confirmada'] as const).map(est => (
            <button key={est} onClick={() => setEstadoLiq(est)}
              style={{flex:1,padding:'10px',borderRadius:'10px',border:'1.5px solid',fontSize:'13px',fontWeight:700,cursor:'pointer',transition:'all .2s',
                borderColor: estadoLiq===est ? (est==='confirmada'?'var(--green)':'var(--amber)') : 'var(--border)',
                background: estadoLiq===est ? (est==='confirmada'?'var(--greenl)':'var(--amberl)') : 'var(--white)',
                color: estadoLiq===est ? (est==='confirmada'?'var(--green)':'var(--amber)') : 'var(--text3)'}}>
              {est === 'borrador' ? '📝 Borrador' : '✓ Confirmada'}
            </button>
          ))}
        </div>
        {estadoLiq === 'borrador' && <div style={{fontSize:'11px',color:'var(--amber)'}}>Borrador: guardado pero no confirmado — podés modificarlo</div>}
        {estadoLiq === 'confirmada' && <div style={{fontSize:'11px',color:'var(--green)'}}>Confirmada: queda registrada como liquidación del mes</div>}
      </div>

      {/* ── ACCIONES ── */}
      <div style={{display:'flex',gap:'10px'}}>
        <button onClick={descargarPDF}
          style={{flex:1,padding:'11px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
          Descargar PDF
        </button>
        <button onClick={confirmarLiquidacion} disabled={guardandoLiq}
          style={{flex:1,padding:'11px',
            background: guardandoLiq ? '#aaa' : liqGuardada ? 'var(--greenl)' : estadoLiq==='confirmada' ? 'var(--v)' : 'var(--amber)',
            color: liqGuardada ? 'var(--green)' : '#fff',
            border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,
            cursor:guardandoLiq?'not-allowed':'pointer',transition:'all .2s'}}>
          {guardandoLiq ? 'Guardando...' : liqGuardada ? '✓ Guardada' : estadoLiq==='confirmada' ? 'Confirmar liquidación' : 'Guardar borrador'}
        </button>
      </div>

      {/* ── HISTORIAL DE LIQUIDACIONES ── */}
      {liquidaciones.length > 0 && (
        <div style={{marginTop:'20px'}}>
          <SL style={{marginBottom:'10px'}}>Liquidaciones anteriores</SL>
          {liquidaciones.map((l:any) => (
            <div key={l.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:'13.5px',fontWeight:600}}>{l.mes} {l.anio}</div>
                <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'1px'}}>
                  {l.horas_semana > 0 ? `${l.horas_semana}hs/sem · $${l.tarifa_hora?.toLocaleString('es-AR')}/h` : 'Sueldo fijo'}
                </div>
              </div>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{textAlign:'right'}}>
                  <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>${l.total?.toLocaleString('es-AR')}</div>
                  <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'8px',
                    background:l.estado==='pagada'?'var(--greenl)':l.estado==='confirmada'?'var(--vl)':'var(--amberl)',
                    color:l.estado==='pagada'?'var(--green)':l.estado==='confirmada'?'var(--v)':'var(--amber)'}}>
                    {l.estado}
                  </span>
                </div>
                <button onClick={() => descargarPDF(l)}
                  style={{padding:'5px 9px',background:'var(--bg)',color:'var(--text2)',border:'1px solid var(--border)',borderRadius:'7px',fontSize:'11px',fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  PDF
                </button>
                <button onClick={() => setLiqEditando({...l})}
                  style={{padding:'5px 9px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'7px',fontSize:'11px',fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  Editar
                </button>
                <button onClick={() => setConfirmDelLiq(l)}
                  style={{padding:'5px 9px',background:'var(--redl)',color:'var(--red)',border:'none',borderRadius:'7px',fontSize:'11px',fontWeight:600,cursor:'pointer',flexShrink:0}}>
                  ✕
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* ── MODAL EDITAR LIQUIDACIÓN ── */}
      {liqEditando && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setLiqEditando(null)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'4px'}}>Editar liquidación</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'16px'}}>{liqEditando.mes} {liqEditando.anio} · base ${liqEditando.subtotal?.toLocaleString('es-AR')}</div>
            <div style={{marginBottom:'10px'}}>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Ajuste total ($)</div>
              <input type="number" style={IS} value={liqEditando.ajuste||''} onChange={e=>setLiqEditando({...liqEditando,ajuste:+e.target.value})} placeholder="0" />
            </div>
            <div style={{marginBottom:'10px'}}>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Descuento ausencias ($)</div>
              <input type="number" min="0" style={IS} value={liqEditando.descuento_licencias||''} onChange={e=>setLiqEditando({...liqEditando,descuento_licencias:Math.abs(+e.target.value)})} placeholder="0" />
            </div>
            <div style={{marginBottom:'14px'}}>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',marginBottom:'3px'}}>Estado</div>
              <select style={IS} value={liqEditando.estado||'confirmada'} onChange={e=>setLiqEditando({...liqEditando,estado:e.target.value})}>
                <option value="borrador">Borrador</option>
                <option value="confirmada">Confirmada</option>
                <option value="pagada">Pagada</option>
              </select>
            </div>
            <div style={{padding:'12px 14px',background:'var(--vl)',borderRadius:'10px',display:'flex',justifyContent:'space-between',marginBottom:'14px'}}>
              <span style={{fontSize:'13px',fontWeight:600,color:'var(--v)'}}>Total calculado</span>
              <span style={{fontSize:'16px',fontWeight:700,color:'var(--v)'}}>
                ${Math.max(0,(liqEditando.subtotal||0)+(liqEditando.ajuste||0)-(liqEditando.descuento_licencias||0)).toLocaleString('es-AR')}
              </span>
            </div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>setLiqEditando(null)} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <button onClick={guardarEdicionLiq} disabled={guardandoEdit} style={{flex:2,padding:'12px',background:guardandoEdit?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
                {guardandoEdit?'Guardando...':'Guardar cambios'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── CONFIRMAR ELIMINAR LIQUIDACIÓN ── */}
      {confirmDelLiq && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setConfirmDelLiq(null)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>¿Eliminar liquidación?</div>
            <div style={{fontSize:'14px',color:'var(--text2)',marginBottom:'6px'}}>{confirmDelLiq.mes} {confirmDelLiq.anio} — ${confirmDelLiq.total?.toLocaleString('es-AR')}</div>
            <div style={{fontSize:'12px',color:'var(--text3)',marginBottom:'20px'}}>Esta acción no se puede deshacer.</div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>setConfirmDelLiq(null)} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <button onClick={()=>eliminarLiq(confirmDelLiq.id)} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}

      {/* ── HISTORIAL DE HORAS/TARIFA ── */}
      {histHoras.length > 0 && (
        <div style={{marginTop:'16px'}}>
          <SL style={{marginBottom:'10px'}}>Historial de horas y tarifa</SL>
          {histHoras.map((h:any) => (
            <div key={h.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 0',borderBottom:'1px solid var(--border)',fontSize:'12.5px'}}>
              <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4l2 2"/></svg>
              {h.horas_anterior !== h.horas_nueva && (
                <span style={{color:'var(--text2)'}}>{h.horas_anterior}hs → <strong style={{color:'var(--v)'}}>{h.horas_nueva}hs</strong></span>
              )}
              {h.tarifa_anterior !== h.tarifa_nueva && (
                <span style={{color:'var(--text2)',marginLeft:'6px'}}>${h.tarifa_anterior?.toLocaleString('es-AR')} → <strong style={{color:'var(--green)'}}>${h.tarifa_nueva?.toLocaleString('es-AR')}</strong></span>
              )}
              <span style={{marginLeft:'auto',color:'var(--text3)',fontSize:'11px'}}>{h.vigente_desde}</span>
            </div>
          ))}
        </div>
      )}

    </Card>
  )
}


const Input = ({value,onChange,type='text',placeholder=''}:any) => <input type={type} value={value} placeholder={placeholder} onChange={(e:any)=>onChange(e.target.value)} style={IS} />
const Loader = () => <div style={{color:'var(--text3)',padding:'24px',textAlign:'center'}}>Cargando...</div>
const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const BtnG = ({children,sm,onClick,style}:any) => <button onClick={onClick} style={{padding:sm?'9px 14px':'12px 20px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:'pointer',...style}}>{children}</button>
const BtnDanger = ({children,sm,onClick}:any) => <button onClick={onClick} style={{padding:sm?'7px 13px':'9px 14px',background:'var(--redl)',color:'var(--red)',border:'1.5px solid #f5c5c5',borderRadius:'10px',fontSize:sm?'12px':'13px',fontWeight:600,cursor:'pointer'}}>{children}</button>
const Badge = ({children,cls,style}:any) => { const s:Record<string,any>={'b-green':{bg:'var(--greenl)',c:'var(--green)'},'b-blue':{bg:'var(--bluel)',c:'var(--blue)'},'b-amber':{bg:'var(--amberl)',c:'var(--amber)'},'b-red':{bg:'var(--redl)',c:'var(--red)'},'b-purple':{bg:'var(--vl)',c:'var(--v)'}}; const t=s[cls]??s['b-purple']; return <span style={{display:'inline-flex',alignItems:'center',padding:'3px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:t.bg,color:t.c,...style}}>{children}</span> }
const ListItem = ({children,onClick}:any) => <div onClick={onClick} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'10px',cursor:'pointer'}} onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')} onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>{children}</div>
const Av = ({color,size,children}:any) => <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.28+'px',fontWeight:700,color:'#fff',flexShrink:0}}>{children}</div>
const Kpi = ({val,label,color='var(--text)'}:any) => <div style={{background:'var(--white)',padding:'12px 8px',textAlign:'center'}}><div style={{fontSize:'20px',fontWeight:700,color}}>{val}</div><div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>{label}</div></div>
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
