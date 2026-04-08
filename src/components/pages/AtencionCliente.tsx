'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábados']
const FRANJAS = ['Mañana (8-12h)','Mediodía (12-14h)','Tarde (14-18h)','Noche (18-21h)']
const NIVELES_INTERES = ['Básico','Intermedio','Advanced','Cambridge','No sabe / A evaluar']
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

function hoy() { return new Date().toISOString().split('T')[0] }
function fmt(f: string) { if(!f)return'—'; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}` }

export default function AtencionCliente() {
  const { usuario } = useAuth()
  const [tab, setTab] = useState<'consultas'|'espera'>('consultas')

  return (
    <div className="fade-in">
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'20px',fontWeight:700}}>Atención al Cliente</div>
        <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Registro de consultas y lista de espera</div>
      </div>

      <div style={{display:'flex',gap:'6px',marginBottom:'18px'}}>
        <TabBtn active={tab==='consultas'} onClick={() => setTab('consultas')}>📊 Registro de consultas</TabBtn>
        <TabBtn active={tab==='espera'} onClick={() => setTab('espera')}>⏳ Lista de espera</TabBtn>
      </div>

      {tab === 'consultas' && <RegistroConsultas />}
      {tab === 'espera' && <ListaEspera />}
    </div>
  )
}

// ── REGISTRO DE CONSULTAS ──
function RegistroConsultas() {
  const MESES_SHORT = ['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic']
  const hoyStr = hoy()
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [editando, setEditando] = useState<string|null>(null)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [mes, anio])

  const cargar = async () => {
    setLoading(true)
    const sb = createClient()
    const mesNombre = MESES[mes]
    const { data } = await sb.from('consultas_diarias')
      .select('*').eq('mes', mesNombre).eq('anio', anio).order('fecha')
    setRegistros(data || [])
    setLoading(false)
  }

  // Generar días del mes con sus registros
  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const dias: { fecha: string; reg: any }[] = []
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dayOfWeek = new Date(fecha+'T12:00:00').getDay()
    if (dayOfWeek === 0) continue // omitir domingos
    const reg = registros.find(r => r.fecha === fecha) || { fecha, ws: 0, instagram: 0, inscriptos: 0 }
    dias.push({ fecha, reg })
  }

  const totales = {
    ws: dias.reduce((s, d) => s + (d.reg.ws || 0), 0),
    instagram: dias.reduce((s, d) => s + (d.reg.instagram || 0), 0),
    inscriptos: dias.reduce((s, d) => s + (d.reg.inscriptos || 0), 0),
  }

  const guardarDia = async (fecha: string, campo: string, valor: number) => {
    if (isNaN(valor) || valor < 0) return
    setGuardando(true)
    const sb = createClient()
    const mesNombre = MESES[mes]
    const existente = registros.find(r => r.fecha === fecha)
    const update = { fecha, mes: mesNombre, anio, [campo]: valor }
    if (existente) {
      await sb.from('consultas_diarias').update({ [campo]: valor }).eq('id', existente.id)
      setRegistros(prev => prev.map(r => r.fecha === fecha ? { ...r, [campo]: valor } : r))
    } else {
      const { data } = await sb.from('consultas_diarias').insert(update).select().single()
      if (data) setRegistros(prev => [...prev, data])
    }
    setGuardando(false)
  }

  return (
    <div>
      {/* Selector mes/año */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px',marginBottom:'14px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px'}}>
          <div>
            <SL style={{marginBottom:'4px'}}>Mes</SL>
            <select style={IS} value={mes} onChange={e=>setMes(+e.target.value)}>
              {MESES.map((m,i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <SL style={{marginBottom:'4px'}}>Año</SL>
            <select style={IS} value={anio} onChange={e=>setAnio(+e.target.value)}>
              {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
      </div>

      {/* KPIs del mes */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'14px'}}>
        {[
          { label:'WhatsApp', val: totales.ws, color:'#25D366', emoji:'💬' },
          { label:'Instagram', val: totales.instagram, color:'#E1306C', emoji:'📸' },
          { label:'Inscriptos', val: totales.inscriptos, color:'var(--v)', emoji:'✅' },
        ].map(k => (
          <div key={k.label} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px',textAlign:'center'}}>
            <div style={{fontSize:'20px',marginBottom:'2px'}}>{k.emoji}</div>
            <div style={{fontSize:'24px',fontWeight:800,color:k.color}}>{k.val}</div>
            <div style={{fontSize:'11px',color:'var(--text3)',fontWeight:600}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla por días */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',overflow:'hidden'}}>
        {/* Header */}
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr',gap:'0',background:'var(--bg)',borderBottom:'1.5px solid var(--border)',padding:'10px 14px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase'}}>Fecha</div>
          <div style={{fontSize:'10px',fontWeight:700,color:'#25D366',textTransform:'uppercase',textAlign:'center'}}>💬 WS</div>
          <div style={{fontSize:'10px',fontWeight:700,color:'#E1306C',textTransform:'uppercase',textAlign:'center'}}>📸 Instagram</div>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--v)',textTransform:'uppercase',textAlign:'center'}}>✅ Inscriptos</div>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>Cargando...</div>
        ) : (
          dias.map(({ fecha, reg }) => {
            const esHoy = fecha === hoyStr
            const dayName = new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short'})
            const dayNum = fecha.split('-')[2]
            return (
              <div key={fecha} style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr',gap:'0',padding:'8px 14px',borderBottom:'1px solid var(--border)',background:esHoy?'var(--vl)':'transparent',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700,color:esHoy?'var(--v)':'var(--text)'}}>{dayNum} {dayName}</div>
                  {esHoy && <div style={{fontSize:'9px',color:'var(--v)',fontWeight:700}}>HOY</div>}
                </div>
                {(['ws','instagram','inscriptos'] as const).map(campo => (
                  <div key={campo} style={{textAlign:'center'}}>
                    <input
                      type="number" min="0" max="999"
                      value={reg[campo] ?? 0}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0
                        setRegistros(prev => {
                          const existe = prev.find(r => r.fecha === fecha)
                          if (existe) return prev.map(r => r.fecha === fecha ? {...r,[campo]:val} : r)
                          return [...prev, { fecha, mes: MESES[mes], anio, ws:0, instagram:0, inscriptos:0, [campo]:val }]
                        })
                      }}
                      onBlur={e => guardarDia(fecha, campo, parseInt(e.target.value)||0)}
                      style={{width:'52px',padding:'6px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'14px',fontWeight:600,textAlign:'center',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}}
                    />
                  </div>
                ))}
              </div>
            )
          })
        )}

        {/* Totales */}
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr',gap:'0',padding:'10px 14px',background:'var(--bg)',borderTop:'2px solid var(--border)'}}>
          <div style={{fontSize:'12px',fontWeight:700,color:'var(--text3)'}}>TOTAL</div>
          <div style={{textAlign:'center',fontSize:'16px',fontWeight:800,color:'#25D366'}}>{totales.ws}</div>
          <div style={{textAlign:'center',fontSize:'16px',fontWeight:800,color:'#E1306C'}}>{totales.instagram}</div>
          <div style={{textAlign:'center',fontSize:'16px',fontWeight:800,color:'var(--v)'}}>{totales.inscriptos}</div>
        </div>
      </div>

      <div style={{fontSize:'11px',color:'var(--text3)',textAlign:'center',marginTop:'8px',padding:'4px'}}>
        Los cambios se guardan automáticamente al salir del campo
      </div>
    </div>
  )
}

// ── LISTA DE ESPERA ──
function ListaEspera() {
  const [lista, setLista] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [confirmDel, setConfirmDel] = useState<string|null>(null)
  const [form, setForm] = useState({
    nombre: '', apellido: '', edad: '', celular: '',
    dia_interes: '', franja_horaria: '', nivel_curso: '', observaciones: ''
  })
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const sb = createClient()
    const { data } = await sb.from('lista_espera')
      .select('*').order('created_at', { ascending: false })
    setLista(data || [])
    setLoading(false)
  }

  const guardar = async () => {
    if (!form.nombre || !form.apellido || !form.celular) return alert('Nombre, apellido y celular son obligatorios')
    setGuardando(true)
    const sb = createClient()
    const { data, error } = await sb.from('lista_espera').insert({
      nombre: form.nombre,
      apellido: form.apellido,
      edad: form.edad ? parseInt(form.edad) : null,
      celular: form.celular,
      dia_interes: form.dia_interes,
      franja_horaria: form.franja_horaria,
      nivel_curso: form.nivel_curso,
      observaciones: form.observaciones,
    }).select().single()
    if (!error && data) {
      setLista(prev => [data, ...prev])
      setModal(false)
      setForm({ nombre:'', apellido:'', edad:'', celular:'', dia_interes:'', franja_horaria:'', nivel_curso:'', observaciones:'' })
    }
    setGuardando(false)
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    await sb.from('lista_espera').delete().eq('id', id)
    setLista(prev => prev.filter(a => a.id !== id))
    setConfirmDel(null)
  }

  const wsLink = (cel: string, nombre: string) => {
    const num = cel.replace(/\D/g, '')
    const texto = `Hola ${nombre}, te contactamos desde Next Ezeiza. Tenemos disponibilidad para el curso que consultaste. ¿Podemos coordinar?`
    return `https://wa.me/54${num}?text=${encodeURIComponent(texto)}`
  }

  return (
    <div>
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
        <div style={{fontSize:'13px',color:'var(--text2)'}}>{lista.length} persona{lista.length!==1?'s':''} en lista</div>
        <BtnP sm onClick={() => setModal(true)}>+ Agregar</BtnP>
      </div>

      {loading ? (
        <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>Cargando...</div>
      ) : lista.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px',color:'var(--text3)',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px'}}>
          <div style={{fontSize:'32px',marginBottom:'8px'}}>⏳</div>
          <div style={{fontWeight:600}}>Lista de espera vacía</div>
          <div style={{fontSize:'13px',marginTop:'4px'}}>Agregá personas interesadas con el botón + Agregar</div>
        </div>
      ) : (
        <div>
          {lista.map((a: any) => (
            <div key={a.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px 16px',marginBottom:'10px'}}>
              <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'10px'}}>
                <div style={{flex:1}}>
                  <div style={{fontSize:'15px',fontWeight:700}}>{a.nombre} {a.apellido}</div>
                  <div style={{display:'flex',flexWrap:'wrap',gap:'6px',marginTop:'6px'}}>
                    {a.edad && <Chip>{a.edad} años</Chip>}
                    {a.dia_interes && <Chip color="var(--v)">{a.dia_interes}</Chip>}
                    {a.franja_horaria && <Chip color="#1a73e8">{a.franja_horaria}</Chip>}
                    {a.nivel_curso && <Chip color="#2d7a4f">{a.nivel_curso}</Chip>}
                  </div>
                  {a.observaciones && (
                    <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'8px',padding:'7px 10px',background:'var(--bg)',borderRadius:'8px'}}>{a.observaciones}</div>
                  )}
                </div>
                <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                  {a.celular && (
                    <a href={wsLink(a.celular, a.nombre)} target="_blank" rel="noopener noreferrer"
                      style={{padding:'8px 12px',background:'#25D366',color:'#fff',borderRadius:'8px',fontSize:'12px',fontWeight:600,textDecoration:'none',display:'flex',alignItems:'center',gap:'4px'}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WS
                    </a>
                  )}
                  <button onClick={() => setConfirmDel(a.id)}
                    style={{padding:'8px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'8px',fontSize:'12px',cursor:'pointer'}}>
                    ✕
                  </button>
                </div>
              </div>
              <div style={{marginTop:'8px',fontSize:'11px',color:'var(--text3)'}}>
                📱 {a.celular || '—'} · Agregado {a.created_at ? new Date(a.created_at).toLocaleDateString('es-AR') : '—'}
              </div>
            </div>
          ))}
        </div>
      )}

      {/* MODAL AGREGAR */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setModal(false)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'20px'}}>Agregar a lista de espera</div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Nombre *">
                <input style={IS} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} placeholder="Nombre" />
              </Field>
              <Field label="Apellido *">
                <input style={IS} value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})} placeholder="Apellido" />
              </Field>
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Edad">
                <input style={IS} type="number" min="4" max="99" value={form.edad} onChange={e=>setForm({...form,edad:e.target.value})} placeholder="Ej: 25" />
              </Field>
              <Field label="Celular *">
                <input style={IS} value={form.celular} onChange={e=>setForm({...form,celular:e.target.value})} placeholder="Ej: 1155554444" />
              </Field>
            </div>

            <Field label="Día de interés" style={{marginBottom:'10px'}}>
              <select style={IS} value={form.dia_interes} onChange={e=>setForm({...form,dia_interes:e.target.value})}>
                <option value="">— Sin preferencia —</option>
                {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
              </select>
            </Field>

            <Field label="Franja horaria" style={{marginBottom:'10px'}}>
              <select style={IS} value={form.franja_horaria} onChange={e=>setForm({...form,franja_horaria:e.target.value})}>
                <option value="">— Sin preferencia —</option>
                {FRANJAS.map(f => <option key={f}>{f}</option>)}
              </select>
            </Field>

            <Field label="Nivel / Curso de interés" style={{marginBottom:'10px'}}>
              <select style={IS} value={form.nivel_curso} onChange={e=>setForm({...form,nivel_curso:e.target.value})}>
                <option value="">— No especificado —</option>
                {NIVELES_INTERES.map(n => <option key={n}>{n}</option>)}
              </select>
            </Field>

            <Field label="Observaciones" style={{marginBottom:'16px'}}>
              <textarea style={{...IS,resize:'none',lineHeight:1.5}} rows={2}
                value={form.observaciones} onChange={(e:any)=>setForm({...form,observaciones:e.target.value})}
                placeholder="Notas adicionales..." />
            </Field>

            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={() => setModal(false)} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <BtnP style={{flex:2}} onClick={guardar} disabled={guardando}>
                {guardando ? 'Guardando...' : 'Agregar'}
              </BtnP>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAR ELIMINAR */}
      {confirmDel && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setConfirmDel(null)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>¿Eliminar de la lista?</div>
            <div style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción no se puede deshacer.</div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={() => setConfirmDel(null)} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── HELPERS ──
const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const TabBtn = ({children,active,onClick}:any) => <button onClick={onClick} style={{padding:'9px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:active?'var(--v)':'var(--border)',background:active?'var(--v)':'var(--white)',color:active?'#fff':'var(--text2)',whiteSpace:'nowrap'}}>{children}</button>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const Chip = ({children,color='var(--text3)'}:any) => <span style={{padding:'2px 9px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--bg)',color,border:`1px solid ${color}22`}}>{children}</span>
const Field = ({label,children,style}:any) => <div style={{marginBottom:'2px',...style}}><div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>{label}</div>{children}</div>
