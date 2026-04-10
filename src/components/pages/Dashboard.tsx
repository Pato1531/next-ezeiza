'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAlumnos, useProfesoras, useCursos, store } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Lunes','Martes','Miercoles','Jueves','Viernes','Sabados']
const NIVEL_COL: Record<string,{bg:string,text:string}> = {
  'Básico':     {bg:'#FEF3CD',text:'#b45309'},
  'Intermedio': {bg:'#E0F0F7',text:'#1a6b8a'},
  'Advanced':   {bg:'#e6f4ec',text:'#2d7a4f'},
  'Cambridge':  {bg:'#f2e8f9',text:'#652f8d'},
}

export default function Dashboard() {
  const { usuario, puedeVer } = useAuth()
  const { alumnos, loading: loadA } = useAlumnos()
  const { profesoras } = useProfesoras()
  const { cursos } = useCursos()

  const [alumnosSinCurso, setAlumnosSinCurso] = useState(0)
  const [cuotasPendientes, setCuotasPendientes] = useState(0)
  const [alertasAusencia, setAlertasAusencia] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [proximosEventos, setProximosEventos] = useState<any[]>([])

  const TIPOS_AGENDA = [
    { value: 'reunion', label: 'Reunión', color: '#652f8d', bg: '#f2e8f9', emoji: '👥' },
    { value: 'examen', label: 'Examen', color: '#c0392b', bg: '#fdeaea', emoji: '📝' },
    { value: 'observacion', label: 'Observación de Clases', color: '#1a73e8', bg: '#e8f0fe', emoji: '👁' },
    { value: 'evento', label: 'Evento especial', color: '#f97316', bg: '#fff7ed', emoji: '🎉' },
    { value: 'cumpleanos', label: 'Cumpleaños', color: '#db2777', bg: '#fce7f3', emoji: '🎂' },
    { value: 'feriado', label: 'Feriado / Sin clases', color: '#b45309', bg: '#fef3cd', emoji: '🏖' },
    { value: 'admin', label: 'Administrativo', color: '#2d7a4f', bg: '#e6f4ec', emoji: '📋' },
    { value: 'otro', label: 'Otro', color: '#9b8eaa', bg: '#f9f5fd', emoji: '📌' },
  ]

  const today = new Date()
  const mesActual = MESES[today.getMonth()]
  // Día de semana JS: 0=Dom, 1=Lun... → mapear al formato del horario
  // Mapeo robusto — cubre todas las variantes de abreviación usadas en DB
  const DIA_MAP: Record<number, string[]> = {
    1: ['Lun','Lunes'],
    2: ['Mar','Martes'],
    3: ['Mié','Mie','Miércoles','Miercoles'],
    4: ['Jue','Jueves'],
    5: ['Vie','Viernes'],
    6: ['Sáb','Sab','Sabado','Sabados'],
    0: [],
  }
  const diaVariants = DIA_MAP[today.getDay()] || []
  const diasJS = ['Domingo','Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
  const diaHoy = diasJS[today.getDay()] || ''

  // Cursos de hoy — match con cualquier variante del día
  const cursosHoy = cursos.filter(c => {
    const d = c.dias || ''
    return diaVariants.some(v => d.includes(v))
  }).sort((a,b) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''))

  useEffect(() => {
    if (!alumnos.length) return
    cargarAlertas()
  }, [alumnos.length])

  // Actualizar contador de pagos pendientes en tiempo real cuando se registra un pago
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.alumno_id) {
        setCuotasPendientes(prev => Math.max(0, prev - 1))
      }
    }
    window.addEventListener('pago-registrado', handler)
    return () => window.removeEventListener('pago-registrado', handler)
  }, [])

  useEffect(() => {
    const cargarEventos = async () => {
      const sb = createClient()
      const hoyStr = new Date().toISOString().split('T')[0]
      const { data } = await sb.from('agenda_eventos')
        .select('*').gte('fecha', hoyStr).order('fecha').order('hora_inicio').limit(5)
      setProximosEventos(data || [])
    }
    cargarEventos()
  }, [])

  const cargarAlertas = async () => {
    setLoading(true)
    const sb = createClient()
    try {
      // Cargar en paralelo para mayor velocidad
      const [conCursoRes, pagosRes] = await Promise.all([
        sb.from('cursos_alumnos').select('alumno_id'),
        sb.from('pagos_alumnos').select('alumno_id').eq('mes', mesActual).eq('anio', today.getFullYear())
      ])
      const idsConCurso = new Set((conCursoRes.data||[]).map((r:any) => r.alumno_id))
      setAlumnosSinCurso(alumnos.filter(a => !idsConCurso.has(a.id)).length)
      const alumnosConPago = new Set((pagosRes.data||[]).map((p:any) => p.alumno_id))
      setCuotasPendientes(alumnos.filter(a => !alumnosConPago.has(a.id)).length)
    } catch { setLoading(false); return }

    // Alertas ausencias - query ligera sin JOINs
    const { data: asist } = await sb
      .from('asistencia_clases')
      .select('alumno_id, clase_id')
      .eq('estado', 'A')
      .limit(200)
    
    if (asist) {
      // Contar ausencias por alumno usando store global
      const conteo: Record<string,number> = {}
      asist.forEach((a:any) => { conteo[a.alumno_id] = (conteo[a.alumno_id]||0) + 1 })
      const alertas = Object.entries(conteo)
        .filter(([,n]) => n >= 2)
        .map(([alumno_id, total]) => {
          const al = (store['alumnos']||[]).find((a:any) => a.id === alumno_id)
          return al ? { alumno_id, nombre: al.nombre, apellido: al.apellido, color: al.color, total } : null
        })
        .filter(Boolean)
        .slice(0, 5)
      setAlertasAusencia(alertas as any[])
    }

    setLoading(false)
  }

  // Sin bloqueo de loading

  // ── VISTA PROFESORA ──
  if (usuario?.rol === 'profesora') {
    return (
      <div className="fade-in">
        <div style={{marginBottom:'20px'}}>
          <div style={{fontSize:'13px',color:'var(--text2)',fontWeight:500}}>Hola, {usuario?.nombre.split(' ')[0]} 👋</div>
          <div style={{fontSize:'22px',fontWeight:700,letterSpacing:'-.3px',marginTop:'2px'}}>
            {today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
          </div>
        </div>

        {/* Alertas de ausencias para profesora */}
        {alertasAusencia.length > 0 && (
          <div style={{marginBottom:'18px'}}>
            <SL style={{marginBottom:'10px'}}>Alertas de ausencias</SL>
            {alertasAusencia.map((al:any,i:number) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',background:'var(--white)',border:'1.5px solid #f5c5c5',borderRadius:'14px',marginBottom:'8px'}}>
                <div style={{width:36,height:36,borderRadius:11,background:al.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {al.nombre?.[0]}{al.apellido?.[0]}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{al.total} ausencias registradas</div>
                </div>
                <span style={{padding:'3px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',flexShrink:0}}>⚠ 2+ faltas</span>
              </div>
            ))}
          </div>
        )}

        {/* Clases de hoy — solo las de esta profesora */}
        <SL style={{marginBottom:'10px'}}>
          {diaHoy ? `Clases de hoy · ${diaHoy}` : 'Clases del día'}
        </SL>
        {cursosHoy.length === 0 ? (
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',color:'var(--text3)',marginBottom:'18px'}}>
            {today.getDay() === 0 ? '🌅 Hoy es domingo' : 'No hay clases programadas para hoy'}
          </div>
        ) : (
          <div style={{marginBottom:'18px'}}>
            {cursosHoy.map(c => {
              const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
                  <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{(c.nivel||'').slice(0,3).toUpperCase()}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
                  </div>
                  <div style={{fontSize:'13px',fontWeight:700,color:'var(--v)',flexShrink:0}}>{c.hora_inicio?.slice(0,5)||'—'}</div>
                </div>
              )
            })}
          </div>
        )}

        {/* Próximos eventos */}
        {proximosEventos.length > 0 && (
          <>
            <SL style={{marginBottom:'10px'}}>Próximos eventos</SL>
            <div style={{marginBottom:'18px'}}>
              {proximosEventos.map((ev:any) => {
                const tipo = TIPOS_AGENDA.find(t => t.value === ev.tipo) || TIPOS_AGENDA[6]
                const esHoy = ev.fecha === new Date().toISOString().split('T')[0]
                const fechaFmt = new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})
                return (
                  <div key={ev.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 14px',background:'var(--white)',border:`1.5px solid ${esHoy?tipo.color:'var(--border)'}`,borderRadius:'14px',marginBottom:'8px'}}>
                    <div style={{width:40,height:40,borderRadius:12,background:tipo.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>
                      {tipo.emoji}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'13.5px',fontWeight:600}}>{ev.titulo}</div>
                      <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'2px'}}>
                        {esHoy ? <span style={{color:tipo.color,fontWeight:700}}>Hoy</span> : fechaFmt}
                        {ev.hora_inicio && <span> · {ev.hora_inicio.slice(0,5)}</span>}
                        <span style={{marginLeft:'6px',padding:'1px 6px',borderRadius:'8px',background:tipo.bg,color:tipo.color,fontSize:'10px',fontWeight:700}}>{tipo.label}</span>
                      </div>
                    </div>
                  </div>
                )
              })}
            </div>
          </>
        )}
      </div>
    )
  }

  return (
    <div className="fade-in">
      {/* Saludo */}
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'13px',color:'var(--text2)',fontWeight:500}}>Hola, {usuario?.nombre.split(' ')[0]} 👋</div>
        <div style={{fontSize:'22px',fontWeight:700,letterSpacing:'-.3px',marginTop:'2px'}}>
          {today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
        </div>
      </div>

      {/* ALERTAS */}
      {!loading && (alertasAusencia.length > 0 || alumnosSinCurso > 0 || cuotasPendientes > 0) && (
        <div style={{marginBottom:'18px'}}>
          <SL style={{marginBottom:'10px'}}>Alertas</SL>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {alertasAusencia.length > 0 && (
              <Alerta tipo="red" icono="⚠">
                <strong>{alertasAusencia.length} alumno{alertasAusencia.length!==1?'s':''}</strong> con 2+ ausencias consecutivas
              </Alerta>
            )}
            {alumnosSinCurso > 0 && (
              <Alerta tipo="amber" icono="📋">
                <strong>{alumnosSinCurso} alumno{alumnosSinCurso!==1?'s':''}</strong> sin curso asignado
              </Alerta>
            )}
            {(usuario?.rol === 'director' || usuario?.rol === 'secretaria') && cuotasPendientes > 0 && (
              <Alerta tipo="amber" icono="💰">
                <strong>{cuotasPendientes} alumno{cuotasPendientes!==1?'s':''}</strong> sin pago registrado en {mesActual}
              </Alerta>
            )}
          </div>
        </div>
      )}

      {/* KPIs */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'18px'}}>
        <KpiCard val={alumnos.length} label="Alumnos activos" color="var(--v)" />
        <KpiCard val={cursos.length} label="Cursos activos" color="var(--v)" />
        {puedeVer('reportes') && <>
          <KpiCard val={profesoras.length} label="Docentes" color="var(--v)" />
          <KpiCard val={alumnosSinCurso} label="Sin curso" color={alumnosSinCurso>0?'var(--amber)':'var(--green)'} />
        </>}
      </div>

      {/* CLASES DE HOY */}
      <SL style={{marginBottom:'10px'}}>
        {diaHoy ? `Clases de hoy · ${diaHoy}` : 'Clases del día'}
      </SL>
      {cursosHoy.length === 0 ? (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',color:'var(--text3)',marginBottom:'18px'}}>
          {today.getDay() === 0 ? '🌅 Hoy es domingo' : 'No hay clases programadas para hoy'}
        </div>
      ) : (
        <div style={{marginBottom:'18px'}}>
          {cursosHoy.map(c => {
            const prof = profesoras.find(p => p.id === c.profesora_id)
            const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
                <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{c.nivel.slice(0,3).toUpperCase()}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                    {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'} · {prof?prof.nombre:'Sin asignar'}
                  </div>
                </div>
                <div style={{fontSize:'13px',fontWeight:700,color:'var(--v)',flexShrink:0}}>
                  {c.hora_inicio?.slice(0,5)||'—'}
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* ALERTAS AUSENCIAS DETALLE */}
      {alertasAusencia.length > 0 && (
        <>
          <SL style={{marginBottom:'10px'}}>Ausencias consecutivas</SL>
          <div style={{marginBottom:'18px'}}>
            {alertasAusencia.map((al:any,i:number) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',background:'var(--white)',border:'1.5px solid #f5c5c5',borderRadius:'14px',marginBottom:'8px'}}>
                <div style={{width:36,height:36,borderRadius:11,background:al.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {al.nombre?.[0]}{al.apellido?.[0]}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{al.curso} · {al.ultimasFechas?.map(fmt).join(' y ')}</div>
                </div>
                <span style={{padding:'3px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',flexShrink:0}}>2+ ausencias</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* PRÓXIMOS EVENTOS */}
      {proximosEventos.length > 0 && (
        <>
          <SL style={{marginBottom:'10px'}}>Próximos eventos</SL>
          <div style={{marginBottom:'18px'}}>
            {proximosEventos.map((ev:any) => {
              const tipo = TIPOS_AGENDA.find(t => t.value === ev.tipo) || TIPOS_AGENDA[6]
              const esHoy = ev.fecha === new Date().toISOString().split('T')[0]
              const fechaFmt = new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})
              return (
                <div key={ev.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 14px',background:'var(--white)',border:`1.5px solid ${esHoy?tipo.color:'var(--border)'}`,borderRadius:'14px',marginBottom:'8px'}}>
                  <div style={{width:40,height:40,borderRadius:12,background:tipo.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>
                    {tipo.emoji}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13.5px',fontWeight:600}}>{ev.titulo}</div>
                    <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'2px'}}>
                      {esHoy ? <span style={{color:tipo.color,fontWeight:700}}>Hoy</span> : fechaFmt}
                      {ev.hora_inicio && <span> · {ev.hora_inicio.slice(0,5)}</span>}
                      <span style={{marginLeft:'6px',padding:'1px 6px',borderRadius:'8px',background:tipo.bg,color:tipo.color,fontSize:'10px',fontWeight:700}}>{tipo.label}</span>
                    </div>
                  </div>
                </div>
              )
            })}
          </div>
        </>
      )}

      {/* TODOS LOS CURSOS */}
      <SL style={{marginBottom:'10px'}}>Todos los cursos</SL>
      {cursos.map(c => {
        const prof = profesoras.find(p => p.id === c.profesora_id)
        const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
        return (
          <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
            <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{c.nivel.slice(0,3).toUpperCase()}</span>
            </div>
            <div style={{flex:1,minWidth:0}}>
              <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
              <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                {prof?`${prof.nombre} ${prof.apellido}`:'Sin asignar'} · {c.dias||'—'} · {c.hora_inicio?.slice(0,5)||'—'}
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function fmt(fecha: string) {
  if (!fecha) return '—'
  const [y,m,d] = fecha.split('-')
  return `${d}/${m}`
}

const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const KpiCard = ({val,label,color='var(--v)'}:any) => (
  <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
    <div style={{fontSize:'30px',fontWeight:700,lineHeight:1,marginBottom:'4px',color}}>{val}</div>
    <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>{label}</div>
  </div>
)
const Alerta = ({tipo,icono,children}:any) => {
  const s = tipo==='red' ? {bg:'var(--redl)',border:'#f5c5c5',color:'var(--red)'} : {bg:'var(--amberl)',border:'#e8d080',color:'var(--amber)'}
  return (
    <div style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',background:s.bg,border:`1.5px solid ${s.border}`,borderRadius:'12px',fontSize:'13px',color:s.color}}>
      <span style={{fontSize:'16px'}}>{icono}</span>
      <div>{children}</div>
    </div>
  )
}
