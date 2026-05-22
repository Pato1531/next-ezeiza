'use client'
import { useState, useEffect } from 'react'
import { useComunicados } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { logActivity, apiHeaders } from '@/lib/hooks'
import { useToast } from '@/components/Toast'

const ROLES_DESTINO = [
  { id: 'todos',          label: 'Todos' },
  { id: 'docentes',       label: 'Docentes' },
  { id: 'coordinacion',   label: 'Coordinación' },
  { id: 'secretaria',     label: 'Secretaría' },
  { id: 'individual',     label: 'Usuarios específicos' },
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
          { num:'3', texto:'Elegí a quién va dirigido: todos, docentes, coordinación, secretaría, o usuarios específicos' },
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
  const { comunicados, recargar, eliminar } = useComunicados()
  const { success: toastSuccess, error: toastError } = useToast()
  const [tab, setTab]           = useState<'lista'|'nuevo'>('lista')
  const [plantillaOpen, setPlantillaOpen] = useState(false)
  const [guardando, setGuardando]         = useState(false)
  const [mostrarOnboarding, setMostrarOnboarding] = useState(false)
  const [detalleLectura, setDetalleLectura] = useState<string | null>(null)
  const [tabDetalle, setTabDetalle]         = useState<'leido'|'pendiente'>('leido')

  // Lista de usuarios del instituto para destinatarios individuales
  const [usuariosInstituto, setUsuariosInstituto] = useState<any[]>([])

  const [form, setForm] = useState({
    titulo:             '',
    contenido:          '',
    rol_destino:        'todos',
    destinatarios_ids:  [] as string[],   // para modo individual
    agregar_agenda:     false,
    agenda_fecha:       '',
    agenda_hora:        '',
  })

  const puedeCrear = ['director','coordinadora'].includes(usuario?.rol || '')

  // Onboarding
  useEffect(() => {
    if (!usuario) return
    try {
      const visitados = JSON.parse(localStorage.getItem(`onboarding_${usuario.id}`) || '[]')
      if (!visitados.includes('comunicados_interno')) setMostrarOnboarding(true)
    } catch {}
  }, [usuario?.id])

  // Cargar usuarios del instituto para selector individual
  useEffect(() => {
    if (!usuario?.id || !puedeCrear) return
    fetch('/api/usuarios', { headers: apiHeaders() })
      .then(r => r.json())
      .then(json => setUsuariosInstituto((json.data || []).filter((u: any) => u.activo)))
      .catch(() => setUsuariosInstituto([]))
  }, [usuario?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // Registrar lectura automáticamente para comunicados individuales
  useEffect(() => {
    if (!usuario || !comunicados.length) return
    const individuales = comunicados.filter((c: any) =>
      c.rol_destino === 'individual' &&
      Array.isArray(c.destinatarios_ids) &&
      c.destinatarios_ids.length > 0 &&
      c.destinatarios_ids.includes(usuario.id) &&
      !(c.leido_por || []).some((e: any) => e.id === usuario.id)
    )
    individuales.forEach((c: any) => {
      fetch('/api/comunicados', {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({
          id:             c.id,
          accion:         'marcar_leido',
          usuario_id:     usuario.id,
          usuario_nombre: `${usuario.nombre} ${usuario.apellido || ''}`.trim(),
        }),
      }).catch(() => {})
    })
    if (individuales.length > 0) setTimeout(() => recargar(), 1200)
  }, [comunicados.length, usuario?.id]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // Filtrar comunicados para el usuario actual:
  // ve los de su rol, los de 'todos', y los individuales donde su ID aparece
  const misComunicados = comunicados.filter((c: any) => {
    if (c.rol_destino === 'todos') return true
    // individual: solo mostrar si el usuario está explícitamente en destinatarios_ids
    if (c.rol_destino === 'individual') {
      return Array.isArray(c.destinatarios_ids) &&
        c.destinatarios_ids.length > 0 &&
        c.destinatarios_ids.includes(usuario?.id)
    }
    if (c.rol_destino === usuario?.rol) return true
    if (c.rol_destino === 'coordinacion' && usuario?.rol === 'coordinadora') return true
    return false
  })

  const toggleDestinatario = (id: string) => {
    setForm(f => ({
      ...f,
      destinatarios_ids: f.destinatarios_ids.includes(id)
        ? f.destinatarios_ids.filter(x => x !== id)
        : [...f.destinatarios_ids, id],
    }))
  }

  const archivar = async (id: string, titulo: string) => {
    if (!confirm(`¿Archivar "${titulo}"? Ya no aparecerá en la lista.`)) return
    await eliminar(id)
    toastSuccess('Comunicado archivado')
  }

  const guardar = async () => {
    if (!form.titulo.trim() || !form.contenido.trim()) return alert('Título y contenido son obligatorios')
    if (form.rol_destino === 'individual' && form.destinatarios_ids.length === 0)
      return alert('Seleccioná al menos un destinatario')
    if (form.agregar_agenda && !form.agenda_fecha)
      return alert('Si querés agregar a la Agenda, indicá la fecha')

    setGuardando(true)

    // 1. Guardar comunicado via API Route (service_role, evita problemas de schema cache)
    const resCom = await fetch('/api/comunicados', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({
        titulo:            form.titulo.trim(),
        contenido:         form.contenido.trim(),
        rol_destino:       form.rol_destino,
        destinatarios_ids: form.rol_destino === 'individual' ? form.destinatarios_ids : null,
        creado_por:        usuario?.nombre || 'Sistema',
        autor_id:          usuario?.id,
      }),
    })
    const jsonCom = await resCom.json()
    if (jsonCom.error) { toastError('Error al guardar: ' + jsonCom.error); setGuardando(false); return }

    // 2. Crear evento en agenda si corresponde
    if (form.agregar_agenda) {
      // Determinar convocados para el evento
      const convocadosEvento = form.rol_destino === 'individual' ? 'individual' : form.rol_destino

      await fetch('/api/guardar-evento', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          titulo:              form.titulo.trim(),
          tipo:                'admin',
          fecha:               form.agenda_fecha,
          hora_inicio:         form.agenda_hora || '',
          hora_fin:            '',
          descripcion:         form.contenido.trim(),
          convocados:          convocadosEvento,
          destinatarios_ids:   form.rol_destino === 'individual' ? form.destinatarios_ids : null,
          creado_por:          usuario?.nombre,
        }),
      })
    }

    logActivity('Creó comunicado', 'Comunicados', form.titulo)
    toastSuccess('Comunicado publicado correctamente')
    recargar()
    setForm({ titulo:'', contenido:'', rol_destino:'todos', destinatarios_ids:[], agregar_agenda:false, agenda_fecha:'', agenda_hora:'' })
    setTab('lista')
    setGuardando(false)
  }

  const aplicarPlantilla = (p: typeof PLANTILLAS[0]['items'][0]) => {
    setForm(f => ({ ...f, titulo: p.titulo, contenido: p.texto, rol_destino: p.destino }))
    setPlantillaOpen(false)
    setTab('nuevo')
  }

  function hoy() { return new Date().toISOString().split('T')[0] }

  const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

  // Badge de destino en la lista
  const destinoBadge = (c: any) => {
    if (c.rol_destino === 'individual') {
      const count = c.destinatarios_ids?.length || 0
      return { label: `${count} persona${count !== 1 ? 's' : ''}`, bg: '#e8f0fe', color: '#1a73e8' }
    }
    const found = ROLES_DESTINO.find(r => r.id === c.rol_destino)
    return {
      label: found?.label || c.rol_destino,
      bg:    c.rol_destino === 'todos' ? 'var(--vl)' : 'var(--amberl)',
      color: c.rol_destino === 'todos' ? 'var(--v)'  : 'var(--amber)',
    }
  }


  // ── Helpers confirmación de lectura ──────────────────────────────────────
  const getDestinatariosInfo = (c: any) => {
    if (c.rol_destino !== 'individual' || !Array.isArray(c.destinatarios_ids)) return []
    return c.destinatarios_ids.map((uid: string) => {
      const u = usuariosInstituto.find((x: any) => x.id === uid)
      const entrada = (c.leido_por || []).find((e: any) => e.id === uid)
      return {
        id:       uid,
        nombre:   u ? `${u.nombre} ${u.apellido || ''}`.trim() : (entrada?.nombre || 'Usuario'),
        rol:      u?.rol || '',
        leyo:     !!entrada,
        ts:       entrada?.ts || null,
        initials: u ? `${u.nombre?.[0] || ''}${u.apellido?.[0] || ''}`.toUpperCase() : '?',
        color:    u?.color || '#888',
      }
    })
  }

  const formatTs = (ts: string | null) => {
    if (!ts) return ''
    const d = new Date(ts)
    const diffH = Math.floor((Date.now() - d.getTime()) / 3600000)
    if (diffH < 1)  return 'hace menos de 1 h'
    if (diffH < 24) return `hoy ${d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })}`
    if (diffH < 48) return `ayer ${d.toLocaleTimeString('es-AR', { hour:'2-digit', minute:'2-digit' })}`
    return d.toLocaleDateString('es-AR', { day:'numeric', month:'short' })
  }

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
              onClick={() => { setForm({ titulo:'', contenido:'', rol_destino:'todos', destinatarios_ids:[], agregar_agenda:false, agenda_fecha:'', agenda_hora:'' }); setTab('nuevo') }}
              style={{padding:'9px 14px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}
            >
              + Nuevo
            </button>
          </div>
        )}
      </div>

      {/* FORMULARIO NUEVO COMUNICADO */}
      {tab === 'nuevo' && puedeCrear && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',marginBottom:'14px'}}>
          <div style={{fontSize:'16px',fontWeight:700,marginBottom:'16px'}}>Nuevo comunicado</div>

          {/* ── DIRIGIDO A ── */}
          <div style={{marginBottom:'12px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'6px'}}>Dirigido a</div>
            <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
              {ROLES_DESTINO.map(r => (
                <button key={r.id} onClick={() => setForm(f => ({...f, rol_destino: r.id, destinatarios_ids: []}))}
                  style={{padding:'7px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',
                    borderColor: form.rol_destino === r.id ? 'var(--v)' : 'var(--border)',
                    background:  form.rol_destino === r.id ? 'var(--v)' : 'var(--white)',
                    color:       form.rol_destino === r.id ? '#fff'     : 'var(--text2)',
                  }}>
                  {r.id === 'individual' ? '👤 ' : ''}{r.label}
                </button>
              ))}
            </div>
          </div>

          {/* ── SELECTOR DE USUARIOS INDIVIDUALES ── */}
          {form.rol_destino === 'individual' && (
            <div style={{marginBottom:'12px',background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:'10px',padding:'12px'}}>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px'}}>
                Seleccioná los destinatarios
                {form.destinatarios_ids.length > 0 && (
                  <span style={{marginLeft:'8px',fontWeight:700,color:'var(--v)'}}>({form.destinatarios_ids.length} seleccionado{form.destinatarios_ids.length !== 1 ? 's' : ''})</span>
                )}
              </div>
              {usuariosInstituto.length === 0 ? (
                <div style={{fontSize:'13px',color:'var(--text3)'}}>Cargando usuarios...</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:'4px',maxHeight:'200px',overflowY:'auto'}}>
                  {usuariosInstituto
                    .filter(u => u.id !== usuario?.id) // no mostrarse a uno mismo
                    .map(u => {
                      const seleccionado = form.destinatarios_ids.includes(u.id)
                      return (
                        <label key={u.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'8px',cursor:'pointer',background:seleccionado?'var(--vl)':'transparent',border:`1.5px solid ${seleccionado?'var(--v)':'transparent'}`,transition:'all .12s'}}>
                          <input
                            type="checkbox"
                            checked={seleccionado}
                            onChange={() => toggleDestinatario(u.id)}
                            style={{accentColor:'var(--v)',width:'15px',height:'15px',cursor:'pointer'}}
                          />
                          <div style={{flex:1}}>
                            <span style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{u.nombre} {u.apellido}</span>
                            <span style={{fontSize:'11px',color:'var(--text3)',marginLeft:'6px',textTransform:'capitalize'}}>{u.rol}</span>
                          </div>
                          {seleccionado && <span style={{fontSize:'14px'}}>✓</span>}
                        </label>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          {/* ── TÍTULO ── */}
          <div style={{marginBottom:'12px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Título</div>
            <input style={IS} value={form.titulo} onChange={e => setForm(f => ({...f, titulo: e.target.value}))} placeholder="Ej: Reunión de equipo — martes 15" />
          </div>

          {/* ── CONTENIDO ── */}
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

          {/* ── AGREGAR A AGENDA ── */}
          <div style={{marginBottom:'16px',background: form.agregar_agenda ? 'var(--vl)' : 'var(--bg)',border:`1.5px solid ${form.agregar_agenda ? 'var(--v)' : 'var(--border)'}`,borderRadius:'10px',padding:'12px',transition:'all .15s'}}>
            <label style={{display:'flex',alignItems:'center',gap:'10px',cursor:'pointer'}}>
              <input
                type="checkbox"
                checked={form.agregar_agenda}
                onChange={e => setForm(f => ({...f, agregar_agenda: e.target.checked, agenda_fecha: e.target.checked ? hoy() : '', agenda_hora: ''}))}
                style={{accentColor:'var(--v)',width:'16px',height:'16px',cursor:'pointer'}}
              />
              <div>
                <div style={{fontSize:'13px',fontWeight:600,color: form.agregar_agenda ? 'var(--v)' : 'var(--text)'}}>📅 Agregar a la Agenda</div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'1px'}}>El comunicado aparecerá como evento en la agenda de los destinatarios</div>
              </div>
            </label>

            {form.agregar_agenda && (
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginTop:'12px'}}>
                <div>
                  <div style={{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Fecha *</div>
                  <input style={{...IS,fontSize:'13px'}} type="date" value={form.agenda_fecha} onChange={e => setForm(f => ({...f, agenda_fecha: e.target.value}))} />
                </div>
                <div>
                  <div style={{fontSize:'10px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Hora (opcional)</div>
                  <input style={{...IS,fontSize:'13px'}} type="time" value={form.agenda_hora} onChange={e => setForm(f => ({...f, agenda_hora: e.target.value}))} />
                </div>
              </div>
            )}
          </div>

          {/* ── BOTONES ── */}
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

      {/* ── LISTA DE COMUNICADOS ── */}
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
              <button onClick={() => { setForm({ titulo:'', contenido:'', rol_destino:'todos', destinatarios_ids:[], agregar_agenda:false, agenda_fecha:'', agenda_hora:'' }); setTab('nuevo') }} style={{padding:'9px 16px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
                + Nuevo comunicado
              </button>
            </div>
          )}
        </div>
      ) : (
        <div>
          {[...misComunicados].reverse().map((c: any) => {
            const badge = destinoBadge(c)
            const fecha = c.created_at
              ? new Date(c.created_at).toLocaleDateString('es-AR', { day:'numeric', month:'short', year:'numeric' })
              : '—'
            const esIndividual = c.rol_destino === 'individual'
            return (
              <div key={c.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'flex-start',justifyContent:'space-between',gap:'8px',marginBottom:'8px'}}>
                  <div style={{fontSize:'15px',fontWeight:700,color:'var(--text)',flex:1}}>{c.titulo}</div>
                  <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:600,whiteSpace:'nowrap',flexShrink:0,background:badge.bg,color:badge.color}}>
                    {esIndividual ? '👤 ' : ''}{badge.label}
                  </span>
                </div>
                <div style={{fontSize:'14px',color:'var(--text2)',lineHeight:1.6,marginBottom:'8px',whiteSpace:'pre-wrap'}}>
                  {c.contenido}
                </div>
                <div style={{fontSize:'11px',color:'var(--text3)',display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap',justifyContent:'space-between'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                    <span>{c.autor_nombre} · {fecha}</span>
                    {c.agregar_agenda && (
                      <span style={{display:'inline-flex',alignItems:'center',gap:'3px',padding:'2px 8px',borderRadius:'10px',background:'#e8f0fe',color:'#1a73e8',fontSize:'10px',fontWeight:600}}>
                        📅 En agenda
                      </span>
                    )}
                  </div>
                  {puedeCrear && (
                    <button
                      onClick={() => archivar(c.id, c.titulo)}
                      title="Archivar comunicado"
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:'12px',padding:'2px 6px',borderRadius:'6px',fontWeight:500,lineHeight:1,display:'inline-flex',alignItems:'center',gap:'3px'}}
                      onMouseEnter={e => { e.currentTarget.style.color='var(--red)'; e.currentTarget.style.background='var(--redl)' }}
                      onMouseLeave={e => { e.currentTarget.style.color='var(--text3)'; e.currentTarget.style.background='none' }}
                    >
                      × archivar
                    </button>
                  )}
                </div>

                {/* Panel de lecturas — solo comunicados individuales */}
                {esIndividual && (() => {
                  const destinatariosInfo = getDestinatariosInfo(c)
                  const leyeron   = destinatariosInfo.filter(d => d.leyo)
                  const pendientes = destinatariosInfo.filter(d => !d.leyo)
                  const abierto   = detalleLectura === c.id
                  return (
                    <div style={{marginTop:'10px',paddingTop:'10px',borderTop:'1px solid var(--border)'}}>
                      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
                        <div style={{display:'flex',alignItems:'center',gap:'4px'}}>
                          {destinatariosInfo.map(d => (
                            <div key={d.id} title={`${d.nombre} — ${d.leyo ? 'leyó' : 'pendiente'}`}
                              style={{width:'26px',height:'26px',borderRadius:'50%',background:d.leyo?d.color:'var(--border)',color:'#fff',fontSize:'10px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',opacity:d.leyo?1:0.5,border:d.leyo?`2px solid ${d.color}`:'2px solid var(--border)',flexShrink:0}}>
                              {d.initials}
                            </div>
                          ))}
                          <span style={{fontSize:'11px',color:'var(--text3)',marginLeft:'6px'}}>
                            {leyeron.length} de {destinatariosInfo.length} {leyeron.length === 1 ? 'leyó' : 'leyeron'}
                          </span>
                          {pendientes.length > 0 && (
                            <span style={{marginLeft:'4px',padding:'1px 7px',borderRadius:'10px',background:'var(--amberl)',color:'var(--amber)',fontSize:'10px',fontWeight:600}}>
                              {pendientes.length} pendiente{pendientes.length > 1 ? 's' : ''}
                            </span>
                          )}
                        </div>
                        {puedeCrear && destinatariosInfo.length > 0 && (
                          <button onClick={() => { setDetalleLectura(abierto ? null : c.id); setTabDetalle('leido') }}
                            style={{fontSize:'11px',color:'var(--v)',background:'var(--vl)',border:'none',borderRadius:'6px',padding:'3px 10px',cursor:'pointer',fontWeight:600}}>
                            {abierto ? 'Cerrar' : 'Ver detalle'}
                          </button>
                        )}
                      </div>
                      {abierto && (
                        <div style={{marginTop:'10px',background:'var(--bg)',borderRadius:'10px',padding:'12px'}}>
                          <div style={{display:'flex',gap:'6px',marginBottom:'10px'}}>
                            {(['leido','pendiente'] as const).map(t => (
                              <button key={t} onClick={() => setTabDetalle(t)}
                                style={{padding:'4px 12px',borderRadius:'20px',border:'1.5px solid',fontSize:'11px',fontWeight:700,cursor:'pointer',
                                  background: tabDetalle===t?'var(--v)':'transparent',
                                  color:      tabDetalle===t?'#fff':'var(--text2)',
                                  borderColor:tabDetalle===t?'var(--v)':'var(--border)'}}>
                                {t === 'leido' ? `✓ Leído (${leyeron.length})` : `⏳ Pendiente (${pendientes.length})`}
                              </button>
                            ))}
                          </div>
                          <div style={{display:'flex',flexDirection:'column',gap:'6px'}}>
                            {(tabDetalle === 'leido' ? leyeron : pendientes).map(d => (
                              <div key={d.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',background:'var(--white)',borderRadius:'8px',border:'1px solid var(--border)'}}>
                                <div style={{width:'30px',height:'30px',borderRadius:'50%',background:d.leyo?d.color:'var(--border)',color:'#fff',fontSize:'11px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0,opacity:d.leyo?1:0.55}}>
                                  {d.initials}
                                </div>
                                <div style={{flex:1,minWidth:0}}>
                                  <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{d.nombre}</div>
                                  <div style={{fontSize:'11px',color:'var(--text3)',textTransform:'capitalize'}}>{d.rol}</div>
                                </div>
                                <div style={{textAlign:'right',flexShrink:0}}>
                                  {d.leyo ? (
                                    <>
                                      <span style={{display:'inline-flex',alignItems:'center',gap:'3px',padding:'2px 8px',borderRadius:'10px',background:'var(--greenl)',color:'var(--green)',fontSize:'10px',fontWeight:600}}>✓ Leído</span>
                                      <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'2px'}}>{formatTs(d.ts)}</div>
                                    </>
                                  ) : (
                                    <span style={{display:'inline-flex',alignItems:'center',gap:'3px',padding:'2px 8px',borderRadius:'10px',background:'var(--bg)',color:'var(--text3)',fontSize:'10px',fontWeight:600,border:'1px solid var(--border)'}}>⏳ Pendiente</span>
                                  )}
                                </div>
                              </div>
                            ))}
                            {(tabDetalle === 'leido' ? leyeron : pendientes).length === 0 && (
                              <div style={{textAlign:'center',padding:'16px',color:'var(--text3)',fontSize:'13px'}}>
                                {tabDetalle === 'leido' ? 'Nadie leyó este comunicado aún' : 'Todos leyeron este comunicado ✓'}
                              </div>
                            )}
                          </div>
                        </div>
                      )}
                    </div>
                  )
                })()}
              </div>
            )
          })}
        </div>
      )}

      {/* ── MODAL PLANTILLAS ── */}
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
                      style={{display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',padding:'12px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'10px',cursor:'pointer',textAlign:'left',transition:'border-color .15s'}}
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
