'use client'
import { useState, useEffect } from 'react'
import { useComunicados } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logActivity } from '@/lib/hooks'

const ROLES_DESTINO = [
  { id: 'todos',          label: 'Todos' },
  { id: 'docentes',       label: 'Docentes' },
  { id: 'coordinacion',   label: 'Coordinación' },
  { id: 'secretaria',     label: 'Secretaría' },
]

// ── PLANTILLAS PREDEFINIDAS ──────────────────────────────────────────────────
const PLANTILLAS = [
  {
    categoria: 'Inicio de trimestre',
    items: [
      {
        titulo: 'Inicio del 1° Trimestre',
        destino: 'todos',
        texto: 'Les comunicamos que el 1° Trimestre comienza el próximo lunes. Por favor confirmar disponibilidad horaria y revisar la planificación de sus cursos antes del inicio de clases.',
      },
      {
        titulo: 'Inicio del 2° Trimestre',
        destino: 'todos',
        texto: 'Comenzamos el 2° Trimestre. Recordamos entregar los boletines del trimestre anterior antes del viernes. Cualquier consulta, coordinar con coordinación.',
      },
      {
        titulo: 'Inicio del 3° Trimestre',
        destino: 'todos',
        texto: 'Arranca el 3° Trimestre. Es el último período del año, por lo que es importante mantener al día la planilla de asistencia y los exámenes cargados en el sistema.',
      },
    ],
  },
  {
    categoria: 'Reuniones y administrativo',
    items: [
      {
        titulo: 'Reunión de equipo',
        destino: 'todos',
        texto: 'Convocamos a reunión de equipo el próximo [día] a las [hora] hs. Asistencia obligatoria. Se tratarán temas de planificación y novedades del instituto.',
      },
      {
        titulo: 'Reunión de coordinación',
        destino: 'coordinacion',
        texto: 'Reunión de coordinación el [día] a las [hora] hs. Traer planillas actualizadas y listado de alumnos con ausencias consecutivas.',
      },
      {
        titulo: 'Entrega de liquidaciones',
        destino: 'docentes',
        texto: 'Las liquidaciones del mes de [mes] ya están disponibles para su revisión. Por favor confirmar recepción y cualquier observación informarla antes del [fecha].',
      },
    ],
  },
  {
    categoria: 'Feriados y ausencias',
    items: [
      {
        titulo: 'Feriado — sin clases',
        destino: 'todos',
        texto: 'Recordamos que el [fecha] es feriado nacional. No habrá clases ese día. Los cursos retoman normalmente el [día siguiente hábil].',
      },
      {
        titulo: 'Clases suspendidas',
        destino: 'todos',
        texto: 'Se informa que las clases del día [fecha] quedan suspendidas por [motivo]. Se repondrá la clase el [fecha de recuperación] en el mismo horario.',
      },
      {
        titulo: 'Receso invernal',
        destino: 'todos',
        texto: 'El receso invernal se extenderá del [fecha inicio] al [fecha fin]. Las clases se retomarán el [fecha regreso]. Buen descanso a todos.',
      },
    ],
  },
  {
    categoria: 'Exámenes y evaluaciones',
    items: [
      {
        titulo: 'Recordatorio de cargar notas',
        destino: 'docentes',
        texto: 'Recordamos que las notas del período [trimestre] deben cargarse en el sistema antes del [fecha límite]. Ante cualquier duda consultar con coordinación.',
      },
      {
        titulo: 'Período de exámenes',
        destino: 'docentes',
        texto: 'Comienza el período de exámenes finales. Por favor registrar las evaluaciones en el sistema con fecha, tipo y notas dentro de las 48 horas de tomado el examen.',
      },
    ],
  },
  {
    categoria: 'Cobranza',
    items: [
      {
        titulo: 'Recordatorio de cobranza',
        destino: 'secretaria',
        texto: 'Se acerca el vencimiento de cuotas. Recordamos gestionar los pagos pendientes y registrarlos en el sistema. Los alumnos con 2+ meses sin pagar requieren seguimiento prioritario.',
      },
      {
        titulo: 'Actualización de cuotas',
        destino: 'todos',
        texto: 'Se informa que a partir de [fecha] las cuotas se actualizarán conforme a los nuevos valores. El detalle por nivel está disponible en el módulo de Reportes.',
      },
    ],
  },
]

// ── COMPONENTE ONBOARDING ────────────────────────────────────────────────────
function OnboardingBanner({ onDismiss }: { onDismiss: () => void }) {
  return (
    <div style={{
      background: 'linear-gradient(135deg, var(--vl) 0%, #f0eaf8 100%)',
      border: '1.5px solid var(--v)',
      borderRadius: '16px',
      padding: '20px',
      marginBottom: '20px',
    }}>
      <div style={{display:'flex',justifyContent:'space-between',alignItems:'flex-start',marginBottom:'12px'}}>
        <div style={{fontSize:'16px',fontWeight:700,color:'var(--v)'}}>📢 Módulo de Comunicados</div>
        <button onClick={onDismiss} style={{background:'none',border:'none',cursor:'pointer',fontSize:'18px',color:'var(--text3)',lineHeight:1,padding:'0 4px'}}>×</button>
      </div>
      <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
        {[
          { num:'1', texto:'Escribí un comunicado nuevo con el botón "+ Nuevo comunicado"' },
          { num:'2', texto:'Usá una plantilla para ahorrar tiempo en mensajes frecuentes' },
          { num:'3', texto:'Elegí a quién va dirigido: todos, docentes, coordinación o secretaría' },
        ].map(p => (
          <div key={p.num} style={{display:'flex',alignItems:'flex-start',gap:'10px'}}>
            <div style={{width:22,height:22,borderRadius:'50%',background:'var(--v)',color:'#fff',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,flexShrink:0}}>
              {p.num}
            </div>
            <div style={{fontSize:'13px',color:'var(--text2)',lineHeight:1.5,paddingTop:'2px'}}>{p.texto}</div>
          </div>
        ))}
      </div>
    </div>
  )
}

// ── COMPONENTE PRINCIPAL ─────────────────────────────────────────────────────
export default function Comunicados() {
  const { usuario } = useAuth()
  const { comunicados, recargar } = useComunicados()
  const [tab, setTab]           = useState<'lista'|'nuevo'>('lista')
  const [plantillaOpen, setPlantillaOpen] = useState(false)
  const [guardando, setGuardando]         = useState(false)
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false)

  const [form, setForm] = useState({
    titulo:      '',
    contenido:   '',
    rol_destino: 'todos',
  })

  const puedeCrear = ['director','coordinadora'].includes(usuario?.rol || '')

  // Onboarding: mostrar si es la primera vez en el módulo
  useEffect(() => {
    if (!usuario) return
    try {
      const visitados = JSON.parse(localStorage.getItem(`onboarding_${usuario.id}`) || '[]')
      if (!visitados.includes('comunicados_interno')) {
        setMostrarOnboarding(true)
      }
    } catch {}
  }, [usuario?.id])

  const dismissOnboarding = () => {
    setMostrarOnboarding(false)
    if (!usuario) return
    try {
      const visitados = JSON.parse(localStorage.getItem(`onboarding_${usuario.id}`) || '[]')
      if (!visitados.includes('comunicados_interno')) {
        localStorage.setItem(`onboarding_${usuario.id}`, JSON.stringify([...visitados, 'comunicados_interno']))
      }
    } catch {}
  }

  // Filtrar comunicados para el rol del usuario
  const misComunicados = comunicados.filter(c =>
    c.rol_destino === 'todos' || c.rol_destino === usuario?.rol
  )

  const guardar = async () => {
    if (!form.titulo.trim() || !form.contenido.trim()) return alert('Título y contenido son obligatorios')
    setGuardando(true)
    const sb = createClient()
    const { error } = await sb.from('comunicados').insert({
      titulo:      form.titulo.trim(),
      contenido:   form.contenido.trim(),
      rol_destino: form.rol_destino,
      creado_por:  usuario?.nombre || 'Sistema',
    })
    if (!error) {
      logActivity('Creó comunicado', 'Comunicados', form.titulo)
      recargar()
      setForm({ titulo: '', contenido: '', rol_destino: 'todos' })
      setTab('lista')
    }
    setGuardando(false)
  }

  const aplicarPlantilla = (p: typeof PLANTILLAS[0]['items'][0]) => {
    setForm({ titulo: p.titulo, contenido: p.texto, rol_destino: p.destino })
    setPlantillaOpen(false)
    setTab('nuevo')
  }

  const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

  return (
    <div className="fade-in">

      {/* Onboarding */}
      {mostrarOnboarding && <OnboardingBanner onDismiss={dismissOnboarding} />}

      {/* Encabezado */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'18px',gap:'8px',flexWrap:'wrap'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Comunicados</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>
            {misComunicados.length} comunicado{misComunicados.length !== 1 ? 's' : ''} activo{misComunicados.length !== 1 ? 's' : ''}
          </div>
        </div>
        {puedeCrear && (
          <div style={{display:'flex',gap:'8px'}}>
            <button
              onClick={() => setPlantillaOpen(true)}
              style={{padding:'9px 14px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}
            >
              📋 Plantillas
            </button>
            <button
              onClick={() => { setForm({ titulo:'', contenido:'', rol_destino:'todos' }); setTab('nuevo') }}
              style={{padding:'9px 14px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}
            >
              + Nuevo
            </button>
          </div>
        )}
      </div>

      {/* Tabs */}
      {tab === 'nuevo' && puedeCrear && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',marginBottom:'14px'}}>
          <div style={{fontSize:'16px',fontWeight:700,marginBottom:'16px'}}>Nuevo comunicado</div>

          <div style={{marginBottom:'12px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Dirigido a</div>
            <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
              {ROLES_DESTINO.map(r => (
                <button key={r.id} onClick={() => setForm(f => ({...f, rol_destino: r.id}))}
                  style={{padding:'7px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',
                    borderColor: form.rol_destino === r.id ? 'var(--v)' : 'var(--border)',
                    background:  form.rol_destino === r.id ? 'var(--v)' : 'var(--white)',
                    color:       form.rol_destino === r.id ? '#fff'     : 'var(--text2)',
                  }}>
                  {r.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{marginBottom:'12px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Título</div>
            <input style={IS} value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} placeholder="Ej: Reunión de equipo — martes 15" />
          </div>

          <div style={{marginBottom:'16px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Contenido</div>
            <textarea
              style={{...IS, resize:'none', lineHeight:1.6}}
              rows={5}
              value={form.contenido}
              onChange={e => setForm(f => ({...f, contenido: e.target.value}))}
              placeholder="Escribí el mensaje del comunicado..."
            />
          </div>

          <div style={{display:'flex',gap:'10px'}}>
            <button onClick={() => setTab('lista')} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando} style={{flex:2,padding:'12px',background:guardando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:guardando?'not-allowed':'pointer'}}>
              {guardando ? 'Guardando...' : 'Publicar comunicado'}
            </button>
          </div>
        </div>
      )}

      {/* Lista de comunicados */}
      {misComunicados.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px 24px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',color:'var(--text3)'}}>
          <div style={{fontSize:'32px',marginBottom:'8px'}}>📭</div>
          <div style={{fontWeight:600,marginBottom:'4px'}}>Sin comunicados</div>
          <div style={{fontSize:'13px',marginBottom: puedeCrear ? '16px' : '0'}}>
            {puedeCrear ? 'Creá el primer comunicado con el botón + Nuevo o usando una plantilla.' : 'No hay comunicados para tu rol en este momento.'}
          </div>
          {puedeCrear && (
            <div style={{display:'flex',gap:'8px',justifyContent:'center'}}>
              <button onClick={() => setPlantillaOpen(true)} style={{padding:'9px 16px',background:'var(--white)',color:'var(--v)',border:'1.5px solid var(--v)',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
                📋 Usar plantilla
              </button>
              <button onClick={() => { setForm({ titulo:'', contenido:'', rol_destino:'todos' }); setTab('nuevo') }} style={{padding:'9px 16px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
                + Nuevo comunicado
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {[...misComunicados].reverse().map((c: any) => {
            const destLabel = ROLES_DESTINO.find(r => r.id === c.rol_destino)?.label || c.rol_destino
            const fecha = c.created_at
              ? new Date(c.created_at).toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' })
              : '—'
            return (
              <div key={c.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'8px',marginBottom:'8px'}}>
                  <div style={{fontSize:'15px',fontWeight:700,color:'var(--text)',flex:1}}>{c.titulo}</div>
                  <span style={{
                    padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:600,whiteSpace:'nowrap',flexShrink:0,
                    background: c.rol_destino==='todos' ? 'var(--vl)' : 'var(--amberl)',
                    color:      c.rol_destino==='todos' ? 'var(--v)'  : 'var(--amber)',
                  }}>
                    {destLabel}
                  </span>
                </div>
                <div style={{fontSize:'14px',color:'var(--text2)',lineHeight:1.6,marginBottom:'8px',whiteSpace:'pre-wrap'}}>
                  {c.contenido}
                </div>
                <div style={{fontSize:'11px',color:'var(--text3)'}}>
                  {c.creado_por} · {fecha}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL PLANTILLAS */}
      {plantillaOpen && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e => { if(e.target===e.currentTarget) setPlantillaOpen(false) }}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'24px 20px 32px',width:'100%',maxWidth:'520px',maxHeight:'85vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'4px'}}>Plantillas de comunicados</div>
            <div style={{fontSize:'13px',color:'var(--text3)',marginBottom:'20px'}}>Tocá una plantilla para usarla como punto de partida. Podés editarla antes de publicar.</div>

            {PLANTILLAS.map(cat => (
              <div key={cat.categoria} style={{marginBottom:'20px'}}>
                <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.08em',marginBottom:'8px',paddingBottom:'6px',borderBottom:'1px solid var(--border)'}}>
                  {cat.categoria}
                </div>
                <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                  {cat.items.map((item, i) => (
                    <button key={i} onClick={() => aplicarPlantilla(item)}
                      style={{
                        display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',
                        padding:'12px 14px',background:'var(--white)',border:'1.5px solid var(--border)',
                        borderRadius:'10px',cursor:'pointer',textAlign:'left',
                        transition:'border-color .15s',
                      }}
                      onMouseEnter={e => (e.currentTarget.style.borderColor='var(--v)')}
                      onMouseLeave={e => (e.currentTarget.style.borderColor='var(--border)')}
                    >
                      <div style={{flex:1}}>
                        <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)',marginBottom:'2px'}}>{item.titulo}</div>
                        <div style={{fontSize:'11px',color:'var(--text3)',overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap',maxWidth:'300px'}}>
                          {item.texto}
                        </div>
                      </div>
                      <div style={{display:'flex',alignItems:'center',gap:'8px',flexShrink:0}}>
                        <span style={{fontSize:'10px',fontWeight:600,padding:'2px 8px',borderRadius:'10px',background:'var(--vl)',color:'var(--v)'}}>
                          {ROLES_DESTINO.find(r => r.id === item.destino)?.label || item.destino}
                        </span>
                        <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M7 5l5 5-5 5"/></svg>
                      </div>
                    </button>
                  ))}
                </div>
              </div>
            ))}

            <button onClick={() => setPlantillaOpen(false)} style={{width:'100%',padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer',marginTop:'4px'}}>
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
