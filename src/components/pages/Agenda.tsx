'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { useProfesoras, apiHeaders } from '@/lib/hooks'

const TIPOS = [
  { value: 'reunion', label: 'Reunión', color: '#652f8d', bg: '#f2e8f9', emoji: '👥' },
  { value: 'examen', label: 'Examen', color: '#c0392b', bg: '#fdeaea', emoji: '📝' },
  { value: 'observacion', label: 'Observación de Clases', color: '#1a73e8', bg: '#e8f0fe', emoji: '👁' },
  { value: 'evento', label: 'Evento especial', color: '#f97316', bg: '#fff7ed', emoji: '🎉' },
  { value: 'cumpleanos', label: 'Cumpleaños', color: '#db2777', bg: '#fce7f3', emoji: '🎂' },
  { value: 'feriado', label: 'Feriado / Sin clases', color: '#b45309', bg: '#fef3cd', emoji: '🏖' },
  { value: 'admin', label: 'Administrativo', color: '#2d7a4f', bg: '#e6f4ec', emoji: '📋' },
  { value: 'otro', label: 'Otro', color: '#9b8eaa', bg: '#f9f5fd', emoji: '📌' },
]
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function hoy() { return new Date().toISOString().split('T')[0] }

export default function Agenda() {
  const { usuario } = useAuth()
  const esDirector = usuario?.rol === 'director'
  const esCoord = usuario?.rol === 'coordinadora' || usuario?.rol === 'secretaria' || esDirector
  const { profesoras } = useProfesoras()

  const [eventos, setEventos] = useState<any[]>([])
  const [vista, setVista] = useState<'calendario'|'proximos'|'nuevo'>('proximos')
  const [form, setForm] = useState({ titulo:'', tipo:'reunion', fecha: hoy(), hora_inicio:'', hora_fin:'', descripcion:'', convocados:'todos', docente_id:'' })
  const [guardando, setGuardando] = useState(false)
  const [mesActual, setMesActual] = useState(new Date().getMonth())
  const [anioActual, setAnioActual] = useState(new Date().getFullYear())

  useEffect(() => { cargarEventos() }, [])

  const cargarEventos = async () => {
    const sb = createClient()
    const { data } = await sb.from('agenda_eventos').select('*').order('fecha').order('hora_inicio')
    setEventos(data || [])
  }

  const guardar = async () => {
    if (!form.titulo || !form.fecha) return alert('Título y fecha son obligatorios')
    if (form.tipo === 'observacion' && !form.docente_id) return alert('La docente es obligatoria para Observación de Clases')
    setGuardando(true)
    try {
      const res = await fetch('/api/guardar-evento', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ ...form, creado_por: usuario?.nombre })
      })
      const json = await res.json()
      if (json.error) { alert('Error: ' + json.error); setGuardando(false); return }
      await cargarEventos()
      setVista('proximos')
      setForm({ titulo:'', tipo:'reunion', fecha: hoy(), hora_inicio:'', hora_fin:'', descripcion:'', convocados:'todos', docente_id:'' })
    } catch(e:any) { alert('Error al guardar') }
    setGuardando(false)
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este evento?')) return
    const sb = createClient()
    await sb.from('agenda_eventos').delete().eq('id', id)
    setEventos(prev => prev.filter(e => e.id !== id))
  }

  const hoyStr = hoy()
  const proximos = eventos.filter(e => e.fecha >= hoyStr).slice(0, 20)
  const pasados = eventos.filter(e => e.fecha < hoyStr).slice(-5).reverse()

  // Calendario
  const primerDia = new Date(anioActual, mesActual, 1).getDay()
  const diasEnMes = new Date(anioActual, mesActual + 1, 0).getDate()
  const celdas: (number|null)[] = Array(primerDia).fill(null)
  for (let i = 1; i <= diasEnMes; i++) celdas.push(i)
  while (celdas.length % 7 !== 0) celdas.push(null)

  const eventosDia = (dia: number) => {
    const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    return eventos.filter(e => e.fecha === dateStr)
  }

  const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Agenda del instituto</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Compartida con todo el equipo</div>
        </div>
        {esCoord && <button onClick={() => setVista('nuevo')} style={{padding:'9px 14px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>+ Nuevo</button>}
      </div>

      {/* TABS */}
      <div style={{display:'flex',gap:'6px',marginBottom:'16px'}}>
        {(['proximos','calendario','nuevo'] as const).filter(v => v !== 'nuevo' || esCoord).map(v => (
          <button key={v} onClick={() => setVista(v)} style={{padding:'9px 16px',borderRadius:'20px',border:'1.5px solid',fontSize:'12px',fontWeight:700,cursor:'pointer',background:vista===v?'var(--v)':'transparent',color:vista===v?'#fff':'var(--text2)',borderColor:vista===v?'var(--v)':'var(--border)'}}>
            {v === 'proximos' ? '📋 Próximos' : v === 'calendario' ? '📅 Calendario' : '+ Nuevo evento'}
          </button>
        ))}
      </div>

      {/* ── PRÓXIMOS ── */}
      {vista === 'proximos' && (
        <>
          {proximos.length === 0 && (
            <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text3)',background:'var(--white)',borderRadius:'16px',border:'1.5px solid var(--border)'}}>
              <div style={{fontSize:'32px',marginBottom:'8px'}}>📅</div>
              <div style={{fontWeight:600}}>No hay eventos próximos</div>
              {esCoord && <div style={{fontSize:'13px',marginTop:'4px'}}>Creá el primero con el botón + Nuevo</div>}
            </div>
          )}
          {proximos.length > 0 && (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden',marginBottom:'12px'}}>
              {proximos.map((ev, i) => {
                const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[5]
                const esHoy = ev.fecha === hoyStr
                return (
                  <div key={ev.id} style={{display:'flex',gap:'12px',padding:'14px 16px',borderBottom:i<proximos.length-1?'1px solid var(--border)':'none',background:esHoy?'var(--vl)':'transparent'}}>
                    <div style={{flexShrink:0,width:'44px',background:tipo.bg,borderRadius:'12px',padding:'8px 4px',textAlign:'center'}}>
                      <div style={{fontSize:'18px'}}>{tipo.emoji}</div>
                      <div style={{fontSize:'11px',fontWeight:800,color:tipo.color}}>{String(new Date(ev.fecha+'T12:00').getDate()).padStart(2,'0')}</div>
                      <div style={{fontSize:'9px',color:tipo.color,fontWeight:600,textTransform:'uppercase'}}>{MESES[new Date(ev.fecha+'T12:00').getMonth()].slice(0,3)}</div>
                    </div>
                    <div style={{flex:1}}>
                      {esHoy && <div style={{fontSize:'10px',fontWeight:700,color:'var(--v)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'2px'}}>HOY</div>}
                      <div style={{fontSize:'14px',fontWeight:700,color:'var(--text)'}}>{ev.titulo}</div>
                      <div style={{fontSize:'11px',color:'var(--text2)',marginTop:'3px',lineHeight:1.5}}>
                        {ev.hora_inicio && <span>{ev.hora_inicio.slice(0,5)}{ev.hora_fin?' – '+ev.hora_fin.slice(0,5):''} · </span>}
                        <span style={{background:tipo.bg,color:tipo.color,padding:'1px 7px',borderRadius:'10px',fontWeight:600,fontSize:'10px'}}>{tipo.label}</span>
                      </div>
                      {ev.tipo === 'observacion' && ev.docente_nombre && (
                        <div style={{fontSize:'11px',color:'#1a73e8',marginTop:'3px',fontWeight:600}}>👤 Docente: {ev.docente_nombre}</div>
                      )}
                      {ev.descripcion && <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'4px'}}>{ev.descripcion}</div>}
                    </div>
                    {esCoord && <button onClick={() => eliminar(ev.id)} style={{background:'none',border:'none',color:'var(--text3)',cursor:'pointer',fontSize:'16px',alignSelf:'flex-start',padding:'0 4px'}}>×</button>}
                  </div>
                )
              })}
            </div>
          )}
          {pasados.length > 0 && (
            <>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em',margin:'16px 0 8px'}}>Eventos pasados</div>
              <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden'}}>
                {pasados.map((ev, i) => {
                  const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[5]
                  return (
                    <div key={ev.id} style={{display:'flex',gap:'12px',padding:'12px 16px',borderBottom:i<pasados.length-1?'1px solid var(--border)':'none',opacity:.6}}>
                      <div style={{fontSize:'20px'}}>{tipo.emoji}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{ev.titulo}</div>
                        <div style={{fontSize:'11px',color:'var(--text3)'}}>{new Date(ev.fecha+'T12:00').toLocaleDateString('es-AR',{day:'numeric',month:'long'})}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ── CALENDARIO ── */}
      {vista === 'calendario' && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
            <button onClick={() => { if(mesActual===0){setMesActual(11);setAnioActual(a=>a-1)}else setMesActual(m=>m-1) }} style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--vl)',border:'none',cursor:'pointer',color:'var(--v)',fontSize:'16px',fontWeight:700}}>‹</button>
            <div style={{fontSize:'16px',fontWeight:800}}>{MESES[mesActual]} {anioActual}</div>
            <button onClick={() => { if(mesActual===11){setMesActual(0);setAnioActual(a=>a+1)}else setMesActual(m=>m+1) }} style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--vl)',border:'none',cursor:'pointer',color:'var(--v)',fontSize:'16px',fontWeight:700}}>›</button>
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px',marginBottom:'8px'}}>
            {DIAS_SEMANA.map(d => <div key={d} style={{textAlign:'center',fontSize:'10px',fontWeight:700,color:'var(--text3)',padding:'4px 0'}}>{d}</div>)}
          </div>
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'2px'}}>
            {celdas.map((dia, idx) => {
              if (!dia) return <div key={idx} />
              const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
              const evs = eventosDia(dia)
              const esHoy = dateStr === hoyStr
              const tipoEv = evs[0] ? (TIPOS.find(t => t.value === evs[0].tipo) || TIPOS[5]) : null
              return (
                <div key={idx} style={{aspectRatio:'1',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',borderRadius:'8px',background:esHoy?'var(--v)':tipoEv?tipoEv.bg:'transparent',cursor:evs.length?'pointer':'default',position:'relative'}}>
                  <div style={{fontSize:'13px',fontWeight:esHoy||evs.length?700:400,color:esHoy?'white':tipoEv?tipoEv.color:'var(--text)'}}>{dia}</div>
                  {evs.length > 0 && <div style={{width:'4px',height:'4px',borderRadius:'50%',background:esHoy?'white':tipoEv?.color,position:'absolute',bottom:'3px'}} />}
                </div>
              )
            })}
          </div>
          <div style={{display:'flex',flexWrap:'wrap',gap:'8px',marginTop:'14px'}}>
            {TIPOS.map(t => (
              <div key={t.value} style={{display:'flex',alignItems:'center',gap:'4px',fontSize:'11px',color:'var(--text3)',fontWeight:600}}>
                <div style={{width:'10px',height:'10px',borderRadius:'3px',background:t.bg,border:`1px solid ${t.color}`}} />
                {t.label}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── NUEVO EVENTO ── */}
      {vista === 'nuevo' && esCoord && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
          <div style={{fontSize:'16px',fontWeight:700,marginBottom:'16px'}}>Nuevo evento</div>

          <div style={{marginBottom:'11px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Título *</div>
            <input style={IS} value={form.titulo} onChange={e=>setForm({...form,titulo:e.target.value})} placeholder="Ej: Reunión de equipo, Examen Final..." />
          </div>

          <div style={{marginBottom:'11px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Tipo</div>
            <select style={IS} value={form.tipo} onChange={e=>setForm({...form,tipo:e.target.value,docente_id:e.target.value!=='observacion'?'':form.docente_id})}>
              {TIPOS.map(t => <option key={t.value} value={t.value}>{t.emoji} {t.label}</option>)}
            </select>
          </div>

          {/* Campo docente — obligatorio para Observación de Clases */}
          {(form.tipo === 'observacion' || form.docente_id) && (
          <div style={{marginBottom:'11px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>
              Docente {form.tipo === 'observacion' && <span style={{color:'var(--red)'}}>*</span>}
            </div>
            <select style={{...IS,borderColor:form.tipo==='observacion'&&!form.docente_id?'var(--red)':'var(--border)'}}
              value={form.docente_id} onChange={e=>setForm({...form,docente_id:e.target.value})}>
              <option value="">— Seleccioná una docente —</option>
              {profesoras.map((p:any) => <option key={p.id} value={p.id}>{p.nombre} {p.apellido}</option>)}
            </select>
            {form.tipo === 'observacion' && !form.docente_id && (
              <div style={{fontSize:'11px',color:'var(--red)',marginTop:'3px'}}>La docente es obligatoria para Observación de Clases</div>
            )}
            {form.tipo === 'observacion' && form.docente_id && (
              <div style={{fontSize:'11px',color:'var(--green)',marginTop:'3px'}}>✓ Se enviará una notificación a la docente seleccionada</div>
            )}
          </div>
          )}

          <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'11px'}}>
            <div>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Fecha *</div>
              <input style={IS} type="date" value={form.fecha} onChange={e=>setForm({...form,fecha:e.target.value})} />
            </div>
            <div>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Hora inicio</div>
              <input style={IS} type="time" value={form.hora_inicio} onChange={e=>setForm({...form,hora_inicio:e.target.value})} />
            </div>
          </div>

          <div style={{marginBottom:'11px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Descripción</div>
            <textarea style={{...IS,resize:'none',lineHeight:1.5}} rows={3} value={form.descripcion} onChange={(e:any)=>setForm({...form,descripcion:e.target.value})} placeholder="Detalles del evento..." />
          </div>

          <div style={{marginBottom:'16px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'6px'}}>¿Quiénes son convocados?</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
              {[{v:'todos',l:'Todos'},{v:'docentes',l:'Docentes'},{v:'coordinadora',l:'Coordinación'},{v:'secretaria',l:'Secretaría'}].map(({v,l}) => (
                <button key={v} onClick={() => setForm({...form,convocados:v})} style={{padding:'6px 12px',borderRadius:'20px',border:'1.5px solid',fontSize:'12px',fontWeight:600,cursor:'pointer',background:form.convocados===v?'var(--v)':'transparent',color:form.convocados===v?'#fff':'var(--text2)',borderColor:form.convocados===v?'var(--v)':'var(--border)'}}>{l}</button>
              ))}
            </div>
          </div>

          <div style={{display:'flex',gap:'10px'}}>
            <button onClick={() => setVista('proximos')} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
            <button onClick={guardar} disabled={guardando} style={{flex:2,padding:'12px',background:guardando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
              {guardando ? 'Guardando...' : 'Guardar evento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
