'use client'
import { useState, useEffect, useRef } from 'react'
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
    const datos = { ...lic, profesora_id: selId }
    // Resetear form para próxima licencia
    setLic({ tipo:'Licencia médica', fecha_desde:hoy(), fecha_hasta:hoy(), observaciones:'', reemplazo_nombre:'', reemplazo_horas:0, es_paga:false, reemplazo_profesora_id:'' })
    fetch('/api/guardar-licencia', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(datos)
    }).then(r => r.json()).then(json => {
      if (json.data) setLicencias(prev => [json.data, ...prev])
      else console.error('Error guardando licencia:', json.error)
    }).catch(e => console.error('Error licencia:', e))
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
  if (vista === 'detalle') {
    if (!sel) return <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
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
                <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>
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

  const [ajuste, setAjuste] = useState(0)
  const [descLic, setDescLic] = useState(0)
  const [notaAjuste, setNotaAjuste] = useState('')
  const [notaLic, setNotaLic] = useState('')
  const [guardandoLiq, setGuardandoLiq] = useState(false)
  const [liqGuardada, setLiqGuardada] = useState(false)

  const { liquidaciones, guardar: guardarLiq } = useLiquidaciones(prof.id)
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

  const base = (prof.horas_semana || 0) * 4 * (prof.tarifa_hora || 0)

  // Reemplazos que hizo ESTA docente (aparece como reemplazante en licencias de otras)
  const reemplazosHechos = licComoReemplazo
  const totalReemplazosHechos = reemplazosHechos.reduce((s:number, l:any) =>
    s + (l.reemplazo_horas || 0) * (prof.tarifa_hora || 0), 0)

  // Descuento por ausencias impagas — resta las horas del reemplazo x tarifa propia
  const ausenciasImpagas = licencias.filter((l:any) => !l.es_paga)
  const totalDescuentoAusencias = ausenciasImpagas.reduce((s:number, l:any) =>
    s + (l.reemplazo_horas > 0 ? l.reemplazo_horas : (l.dias || 0)) * (prof.tarifa_hora || 0), 0)

  const descLicFinal = descLic > 0 ? descLic : totalDescuentoAusencias
  const total = base + totalReemplazosHechos + ajuste - descLicFinal

  const confirmarLiquidacion = async () => {
    setGuardandoLiq(true)
    await guardarLiq({
      profesora_id: prof.id,
      profesora_nombre: `${prof.nombre} ${prof.apellido}`,
      mes: mesActual,
      anio: anioActual,
      horas_semana: prof.horas_semana,
      horas_mes: (prof.horas_semana || 0) * 4,
      tarifa_hora: prof.tarifa_hora,
      subtotal: base,
      ajuste: ajuste || 0,
      ajuste_concepto: notaAjuste,
      descuento_licencias: descLicFinal,
      descuento_concepto: notaLic,
      total,
      estado: 'confirmada',
    })
    setGuardandoLiq(false)
    setLiqGuardada(true)
    setTimeout(() => setLiqGuardada(false), 3000)
  }

  return (
    <Card>
      <SL style={{marginBottom:'14px'}}>Liquidación mensual — {mesActual} {anioActual}</SL>

      {/* Base */}
      {[
        ['Hs/semana', `${prof.horas_semana}hs`],
        ['Hs/mes', `${prof.horas_semana * 4}hs`],
        ['Valor/hora', `$${prof.tarifa_hora?.toLocaleString('es-AR')}`],
        ['Subtotal base', `$${base.toLocaleString('es-AR')}`],
      ].map(([k,v], i) => (
        <div key={k} style={{display:'flex',justifyContent:'space-between',alignItems:'center',padding:'11px 0',borderBottom:'1px solid var(--border)'}}>
          <span style={{fontSize:'14px',color:i===3?'var(--text)':'var(--text2)',fontWeight:i===3?600:400}}>{k}</span>
          <span style={{fontSize:i===3?'15px':'14px',fontWeight:i===3?700:400}}>{v}</span>
        </div>
      ))}

      {/* AJUSTES */}
      <div style={{margin:'14px 0 6px',padding:'14px',background:'#f0fff4',borderRadius:'12px',border:'1.5px solid #a8d8b4'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
          <div>
            <div style={{fontSize:'13px',fontWeight:700,color:'var(--green)'}}>Ajuste</div>
            <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'1px'}}>Suma si positivo · Resta si negativo</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'13px',fontWeight:600,color:'var(--text2)'}}>$</span>
            <input
              type="number"
              value={ajuste||''}
              onChange={e => setAjuste(parseFloat(e.target.value)||0)}
              placeholder="0"
              style={{width:'110px',padding:'7px 10px',border:'1.5px solid #a8d8b4',borderRadius:'8px',fontSize:'14px',fontWeight:600,textAlign:'right',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}}
            />
          </div>
        </div>
        <input
          type="text"
          value={notaAjuste}
          onChange={e => setNotaAjuste(e.target.value)}
          placeholder="Concepto del ajuste (opcional)..."
          style={{width:'100%',padding:'7px 10px',border:'1.5px solid #a8d8b4',borderRadius:'8px',fontSize:'13px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text2)',background:'var(--white)'}}
        />
        {ajuste !== 0 && (
          <div style={{marginTop:'8px',fontSize:'12px',fontWeight:600,color:ajuste>0?'var(--green)':'var(--red)',textAlign:'right'}}>
            {ajuste>0?'+':''}{ajuste.toLocaleString('es-AR')} → {notaAjuste||'Sin concepto'}
          </div>
        )}
      </div>

      {/* LICENCIAS */}
      <div style={{margin:'6px 0 14px',padding:'14px',background:'#fff5f5',borderRadius:'12px',border:'1.5px solid #f5c5c5'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
          <div>
            <div style={{fontSize:'13px',fontWeight:700,color:'var(--red)'}}>Descuento por licencias</div>
            <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'1px'}}>Solo resta · Ingresá 0 para no descontar</div>
          </div>
          <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
            <span style={{fontSize:'13px',fontWeight:600,color:'var(--text2)'}}>$</span>
            <input
              type="number"
              min="0"
              value={descLic||''}
              onChange={e => setDescLic(Math.abs(parseFloat(e.target.value)||0))}
              placeholder={totalDescuentoAusencias>0?totalDescuentoAusencias.toString():'0'}
              style={{width:'110px',padding:'7px 10px',border:'1.5px solid #f5c5c5',borderRadius:'8px',fontSize:'14px',fontWeight:600,textAlign:'right',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}}
            />
          </div>
        </div>
        <input
          type="text"
          value={notaLic}
          onChange={e => setNotaLic(e.target.value)}
          placeholder="Concepto (ej: 2 días ausencia injustificada)..."
          style={{width:'100%',padding:'7px 10px',border:'1.5px solid #f5c5c5',borderRadius:'8px',fontSize:'13px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text2)',background:'var(--white)'}}
        />
        {licencias.length > 0 && (
          <div style={{marginTop:'8px',fontSize:'11px',color:'var(--text3)'}}>
            {licencias.length} licencia(s) · Descuento automático ausencias impagas: ${totalDescuentoAusencias.toLocaleString('es-AR')}
          </div>
        )}
      </div>

      {/* REEMPLAZOS REALIZADOS */}
      {totalReemplazosHechos > 0 && (
        <div style={{margin:'6px 0 14px',padding:'14px',background:'var(--greenl)',borderRadius:'12px',border:'1.5px solid var(--green)'}}>
          <div style={{display:'flex',justifyContent:'space-between',alignItems:'center'}}>
            <div>
              <div style={{fontSize:'13px',fontWeight:700,color:'var(--green)'}}>+ Reemplazos realizados</div>
              {reemplazosHechos.map((l:any,i:number) => (
                <div key={i} style={{fontSize:'11px',color:'var(--text2)',marginTop:'3px'}}>
                  {(l.profesoras as any)?.nombre} {(l.profesoras as any)?.apellido} · {l.fecha_desde} · {l.reemplazo_horas}hs × ${prof.tarifa_hora?.toLocaleString('es-AR')}/h
                </div>
              ))}
            </div>
            <div style={{fontSize:'18px',fontWeight:700,color:'var(--green)',flexShrink:0}}>+${totalReemplazosHechos.toLocaleString('es-AR')}</div>
          </div>
        </div>
      )}

      {/* TOTAL */}
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',background:'var(--vl)',borderRadius:'12px',padding:'16px',border:'2px solid var(--v)'}}>
        <div>
          <div style={{fontSize:'16px',fontWeight:700}}>Total a liquidar</div>
          {(ajuste !== 0 || descLicFinal > 0) && (
            <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'3px'}}>
              ${base.toLocaleString('es-AR')}
              {ajuste!==0&&` ${ajuste>0?'+':''} $${ajuste.toLocaleString('es-AR')}`}
              {descLicFinal>0&&` - $${descLicFinal.toLocaleString('es-AR')}`}
            </div>
          )}
        </div>
        <span style={{fontSize:'24px',fontWeight:700,color:total>=0?'var(--v)':'var(--red)'}}>${total.toLocaleString('es-AR')}</span>
      </div>

      <div style={{display:'flex',gap:'10px',marginTop:'14px'}}>
        <button onClick={() => {
          const filas = [
            `<tr><td style="color:#888">Hs/semana</td><td style="text-align:right">${prof.horas_semana}hs</td></tr>`,
            `<tr><td style="color:#888">Hs/mes</td><td style="text-align:right">${prof.horas_semana*4}hs</td></tr>`,
            `<tr><td style="color:#888">Tarifa/hora</td><td style="text-align:right">$${prof.tarifa_hora?.toLocaleString('es-AR')}</td></tr>`,
            `<tr><td style="color:#888;font-weight:600">Subtotal base</td><td style="text-align:right;font-weight:700">$${base.toLocaleString('es-AR')}</td></tr>`,
            prof.es_coordinadora && montoCoord > 0 ? `<tr><td style="color:#652f8d">Monto de Coordinacion</td><td style="text-align:right;color:#652f8d;font-weight:600">+$${montoCoord.toLocaleString('es-AR')}</td></tr>` : '',
            totalReemplazosHechos > 0 ? `<tr><td style="color:#2d7a4f">Reemplazos realizados</td><td style="text-align:right;color:#2d7a4f;font-weight:600">+$${totalReemplazosHechos.toLocaleString('es-AR')}</td></tr>` : '',
            ajuste !== 0 ? `<tr><td style="color:#2d7a4f">Ajuste${notaAjuste ? ' ('+notaAjuste+')' : ''}</td><td style="text-align:right;color:#2d7a4f">${ajuste>0?'+':''}$${Math.abs(ajuste).toLocaleString('es-AR')}</td></tr>` : '',
            descLicFinal > 0 ? `<tr><td style="color:#c0392b">Descuento ausencias${notaLic ? ' ('+notaLic+')' : ''}</td><td style="text-align:right;color:#c0392b">-$${descLicFinal.toLocaleString('es-AR')}</td></tr>` : '',
          ].filter(Boolean).join('')
          const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Liquidacion ${prof.nombre} ${prof.apellido}</title><style>
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
            <div class="logo"><span>Next</span> Ezeiza</div>
            <div style="color:#888;font-size:12px">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
          </div>
          <h1>Liquidacion - ${mesActual} ${anioActual}</h1>
          <div class="sub">${prof.nombre} ${prof.apellido} &bull; ${prof.nivel} &bull; ${prof.horas_semana}hs/sem &bull; $${prof.tarifa_hora?.toLocaleString('es-AR')}/h</div>
          <table>${filas}</table>
          <div class="total">
            <span class="total-label">Total a liquidar</span>
            <span class="total-value">$${total.toLocaleString('es-AR')}</span>
          </div>
          <script>setTimeout(function(){window.print()},500)</script>
          </body></html>`
          const blob = new Blob([html], { type: 'text/html;charset=utf-8' })
          const url = URL.createObjectURL(blob)
          const win = window.open(url, '_blank')
          if (!win) {
            // Fallback: download directo
            const a = document.createElement('a')
            a.href = url
            a.download = `liquidacion-${prof.nombre}-${prof.apellido}-${mesActual}-${anioActual}.html`
            a.click()
          }
          setTimeout(() => URL.revokeObjectURL(url), 10000)
        }} style={{flex:1,padding:'11px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
          Descargar PDF
        </button>
        <button onClick={confirmarLiquidacion} disabled={guardandoLiq}
          style={{flex:1,padding:'11px',background:liqGuardada?'var(--greenl)':guardandoLiq?'#aaa':'#1B6B4A',color:liqGuardada?'var(--green)':'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:guardandoLiq?'not-allowed':'pointer',transition:'all .2s'}}>
          {liqGuardada?'✓ Guardada':guardandoLiq?'Guardando...':'Confirmar'}
        </button>
      </div>

      {/* HISTORIAL DE LIQUIDACIONES */}
      {liquidaciones.length > 0 && (
        <div style={{marginTop:'20px'}}>
          <SL style={{marginBottom:'10px'}}>Liquidaciones anteriores</SL>
          {liquidaciones.map((l:any) => (
            <div key={l.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
              <div>
                <div style={{fontSize:'13.5px',fontWeight:600}}>{l.mes} {l.anio}</div>
                <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'1px'}}>{l.horas_semana}hs/sem · ${l.tarifa_hora?.toLocaleString('es-AR')}/h</div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>${l.total?.toLocaleString('es-AR')}</div>
                <span style={{fontSize:'10px',fontWeight:600,padding:'1px 7px',borderRadius:'8px',
                  background:l.estado==='pagada'?'var(--greenl)':l.estado==='confirmada'?'var(--vl)':'var(--amberl)',
                  color:l.estado==='pagada'?'var(--green)':l.estado==='confirmada'?'var(--v)':'var(--amber)'}}>
                  {l.estado}
                </span>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* HISTORIAL DE HORAS/TARIFA */}
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
