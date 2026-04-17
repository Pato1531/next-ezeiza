'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAlumnos, useProfesoras, useCursos, store } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const NIVEL_COL: Record<string,{bg:string,text:string}> = {
  'Básico':     {bg:'#FEF3CD',text:'#b45309'},
  'Intermedio': {bg:'#E0F0F7',text:'#1a6b8a'},
  'Advanced':   {bg:'#e6f4ec',text:'#2d7a4f'},
  'Cambridge':  {bg:'#f2e8f9',text:'#652f8d'},
}

const TIPOS_AGENDA = [
  { value: 'reunion',    label: 'Reunión',              color: '#652f8d', bg: '#f2e8f9', emoji: '👥' },
  { value: 'examen',     label: 'Examen',               color: '#c0392b', bg: '#fdeaea', emoji: '📝' },
  { value: 'observacion',label: 'Observación de Clases',color: '#1a73e8', bg: '#e8f0fe', emoji: '👁' },
  { value: 'evento',     label: 'Evento especial',      color: '#f97316', bg: '#fff7ed', emoji: '🎉' },
  { value: 'cumpleanos', label: 'Cumpleaños',           color: '#db2777', bg: '#fce7f3', emoji: '🎂' },
  { value: 'feriado',    label: 'Feriado / Sin clases', color: '#b45309', bg: '#fef3cd', emoji: '🏖' },
  { value: 'admin',      label: 'Administrativo',       color: '#2d7a4f', bg: '#e6f4ec', emoji: '📋' },
  { value: 'otro',       label: 'Otro',                 color: '#9b8eaa', bg: '#f9f5fd', emoji: '📌' },
]

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
  const [cumpleanos, setCumpleanos] = useState<any[]>([])

  const today = new Date()
  const mesActual = MESES[today.getMonth()]

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

  const cursosHoy = cursos.filter(c => {
    const d = c.dias || ''
    return diaVariants.some(v => d.includes(v))
  }).sort((a,b) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''))

  useEffect(() => {
    if (!alumnos.length) return
    cargarAlertas()
  }, [alumnos.length])

  // Actualizar cuotas pendientes en tiempo real
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.alumno_id) setCuotasPendientes(prev => Math.max(0, prev - 1))
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

  useEffect(() => {
    const cargarCumpleanos = async () => {
      const sb = createClient()
      const hoy = new Date()
      const { data: als } = await sb.from('alumnos')
        .select('id, nombre, apellido, fecha_nacimiento, color')
        .eq('activo', true).not('fecha_nacimiento', 'is', null)
      if (!als) return
      const proximos: any[] = []
      als.forEach((a: any) => {
        if (!a.fecha_nacimiento) return
        const [, mm, dd] = a.fecha_nacimiento.split('-')
        const cumpleEsteAnio = new Date(hoy.getFullYear(), parseInt(mm) - 1, parseInt(dd))
        const diffDias = Math.round((cumpleEsteAnio.getTime() - hoy.setHours(0,0,0,0)) / 86400000)
        if (diffDias >= 0 && diffDias <= 30) {
          proximos.push({ ...a, diasParaCumple: diffDias, fechaStr: `${dd}/${mm}` })
        }
      })
      proximos.sort((a, b) => a.diasParaCumple - b.diasParaCumple)
      setCumpleanos(proximos)
    }
    cargarCumpleanos()
  }, [])

  const cargarAlertas = async () => {
    setLoading(true)
    const sb = createClient()
    try {
      const [conCursoRes, pagosRes] = await Promise.all([
        sb.from('cursos_alumnos').select('alumno_id'),
        sb.from('pagos_alumnos').select('alumno_id').eq('mes', mesActual).eq('anio', today.getFullYear())
      ])
      const idsConCurso = new Set((conCursoRes.data||[]).map((r:any) => r.alumno_id))
      // Bug fix: solo contar alumnos ACTIVOS sin curso
      const alumnosActivos = alumnos.filter(a => (a as any).activo !== false)
      setAlumnosSinCurso(alumnosActivos.filter(a => !idsConCurso.has(a.id)).length)

      // Bug fix: cuotas pendientes solo de alumnos activos CON curso
      const alumnosConCursoActivos = alumnosActivos.filter(a => idsConCurso.has(a.id))
      const alumnosConPago = new Set((pagosRes.data||[]).map((p:any) => p.alumno_id))
      setCuotasPendientes(alumnosConCursoActivos.filter(a => !alumnosConPago.has(a.id)).length)
    } catch { setLoading(false); return }

    // ── Bug fix: ausencias CONSECUTIVAS reales ───────────────────────────────
    // Traer últimas 20 clases por curso → detectar si las últimas N del alumno son A seguidas
    try {
      const { data: cursosAlumnos } = await sb.from('cursos_alumnos').select('alumno_id, curso_id')
      if (!cursosAlumnos?.length) { setLoading(false); return }

      // Agrupar alumnos por curso
      const porCurso: Record<string, string[]> = {}
      cursosAlumnos.forEach((ca: any) => {
        if (!porCurso[ca.curso_id]) porCurso[ca.curso_id] = []
        porCurso[ca.curso_id].push(ca.alumno_id)
      })

      // Para cada curso, traer las últimas 10 clases y su asistencia
      const alertasMap: Record<string, { nombre:string; apellido:string; color:string; consecutivas:number; curso:string }> = {}

      await Promise.all(Object.entries(porCurso).map(async ([curso_id, alumnoIds]) => {
        const { data: clases } = await sb.from('clases')
          .select('id').eq('curso_id', curso_id).order('fecha', { ascending: false }).limit(10)
        if (!clases?.length) return

        const claseIds = clases.map((c: any) => c.id)
        const { data: asist } = await sb.from('asistencia_clases')
          .select('alumno_id, clase_id, estado')
          .in('clase_id', claseIds)
          .in('alumno_id', alumnoIds)

        // Por alumno: detectar ausencias consecutivas al final
        const porAlumno: Record<string, Record<string, string>> = {}
        asist?.forEach((a: any) => {
          if (!porAlumno[a.alumno_id]) porAlumno[a.alumno_id] = {}
          porAlumno[a.alumno_id][a.clase_id] = a.estado
        })

        // Orden de clases (más reciente primero)
        alumnoIds.forEach(alumno_id => {
          const reg = porAlumno[alumno_id] || {}
          let consecutivas = 0
          for (const clase of clases) {
            const estado = reg[clase.id]
            if (estado === 'A') consecutivas++
            else if (estado === 'P' || estado === 'T') break
            // si no hay registro para esa clase, no interrumpir (clase sin datos)
          }
          if (consecutivas >= 2) {
            const al = alumnos.find(a => a.id === alumno_id)
            if (al && !alertasMap[alumno_id]) {
              const cur = cursos.find(c => c.id === curso_id)
              alertasMap[alumno_id] = {
                nombre: al.nombre, apellido: al.apellido,
                color: al.color || '#652f8d',
                consecutivas,
                curso: cur?.nombre || '',
              }
            }
          }
        })
      }))

      setAlertasAusencia(Object.values(alertasMap).slice(0, 5))
    } catch (e) {
      console.error('[Dashboard] alertas ausencias:', e)
    }

    setLoading(false)
  }

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

        {alertasAusencia.length > 0 && (
          <div style={{marginBottom:'18px'}}>
            <SL style={{marginBottom:'10px'}}>Alertas de ausencias</SL>
            {alertasAusencia.map((al:any,i:number) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',background:'var(--white)',border:'1.5px solid #f5c5c5',borderRadius:'14px',marginBottom:'8px'}}>
                <Av color={al.color} nombre={al.nombre} apellido={al.apellido} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{al.consecutivas} ausencias consecutivas</div>
                </div>
                <span style={{padding:'3px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',flexShrink:0}}>⚠ {al.consecutivas}+ faltas</span>
              </div>
            ))}
          </div>
        )}

        <SL style={{marginBottom:'10px'}}>{diaHoy ? `Clases de hoy · ${diaHoy}` : 'Clases del día'}</SL>
        {cursosHoy.length === 0 ? (
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',color:'var(--text3)',marginBottom:'18px'}}>
            {today.getDay() === 0 ? '🌅 Hoy es domingo' : 'No hay clases programadas para hoy'}
          </div>
        ) : (
          <div style={{marginBottom:'18px'}}>
            {cursosHoy.map(c => {
              const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
              return (
                <CursoCard key={c.id} c={c} col={col} />
              )
            })}
          </div>
        )}

        {proximosEventos.length > 0 && (
          <>
            <SL style={{marginBottom:'10px'}}>Próximos eventos</SL>
            <div style={{marginBottom:'18px'}}>
              {proximosEventos.map((ev:any) => <EventoCard key={ev.id} ev={ev} />)}
            </div>
          </>
        )}
      </div>
    )
  }

  // ── VISTA GENERAL ──
  const alertasUrgentes = alertasAusencia.length > 0 || alumnosSinCurso > 0 || cuotasPendientes > 0 || cumpleanos.some((c:any) => c.diasParaCumple === 0)

  return (
    <div className="fade-in">
      {/* Saludo */}
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'13px',color:'var(--text2)',fontWeight:500}}>Hola, {usuario?.nombre.split(' ')[0]} 👋</div>
        <div style={{fontSize:'22px',fontWeight:700,letterSpacing:'-.3px',marginTop:'2px'}}>
          {today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
        </div>
      </div>

      {/* ── ZONA 1: ALERTAS URGENTES ── */}
      {!loading && alertasUrgentes && (
        <div style={{marginBottom:'20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <SL>Alertas</SL>
            <span style={{padding:'2px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:700,background:'var(--redl)',color:'var(--red)'}}>
              {[alertasAusencia.length>0,alumnosSinCurso>0,cuotasPendientes>0].filter(Boolean).length + cumpleanos.filter((c:any)=>c.diasParaCumple===0).length} pendiente{[alertasAusencia.length>0,alumnosSinCurso>0,cuotasPendientes>0].filter(Boolean).length + cumpleanos.filter((c:any)=>c.diasParaCumple===0).length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {alertasAusencia.length > 0 && (
              <Alerta tipo="red" icono="⚠">
                <strong>{alertasAusencia.length} alumno{alertasAusencia.length!==1?'s':''}</strong> con ausencias consecutivas
              </Alerta>
            )}
            {alumnosSinCurso > 0 && (
              <Alerta tipo="amber" icono="📋">
                <strong>{alumnosSinCurso} alumno{alumnosSinCurso!==1?'s':''}</strong> sin curso asignado
              </Alerta>
            )}
            {(usuario?.rol === 'director' || usuario?.rol === 'secretaria') && cuotasPendientes > 0 && (
              <Alerta tipo="amber" icono="💰">
                <strong>{cuotasPendientes} alumno{cuotasPendientes!==1?'s':''}</strong> sin pago en {mesActual}
              </Alerta>
            )}
            {cumpleanos.filter((c:any) => c.diasParaCumple === 0).map((c:any) => (
              <Alerta key={c.id} tipo="red" icono="🎂">
                <strong>¡Hoy cumple años!</strong> {c.nombre} {c.apellido}
              </Alerta>
            ))}
          </div>
        </div>
      )}

      {/* ── ZONA 2: CLASES DE HOY (bloque destacado) ── */}
      <div style={{marginBottom:'20px'}}>
        <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
          <SL>{diaHoy ? `Clases de hoy · ${diaHoy}` : 'Clases del día'}</SL>
          <span style={{fontSize:'12px',color:'var(--text3)',fontWeight:500}}>{cursosHoy.length} clase{cursosHoy.length!==1?'s':''}</span>
        </div>
        {cursosHoy.length === 0 ? (
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',color:'var(--text3)'}}>
            {today.getDay() === 0 ? '🌅 Hoy es domingo' : 'Sin clases hoy'}
          </div>
        ) : (
          cursosHoy.map(c => {
            const prof = profesoras.find(p => p.id === c.profesora_id)
            const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
            return (
              <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
                <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                  <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{(c.nivel||'').slice(0,3).toUpperCase()}</span>
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                    {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'} · {prof?prof.nombre:'Sin asignar'}
                  </div>
                </div>
                <div style={{fontSize:'13px',fontWeight:700,color:'var(--v)',flexShrink:0}}>{c.hora_inicio?.slice(0,5)||'—'}</div>
              </div>
            )
          })
        )}
      </div>

      {/* ── ZONA 3: KPIs (menor jerarquía) ── */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'20px'}}>
        <KpiCard val={alumnos.length} label="Alumnos activos" color="var(--v)" />
        <KpiCard val={cursos.length} label="Cursos activos" color="var(--v)" />
        {puedeVer('reportes') && <>
          <KpiCard val={profesoras.length} label="Colaboradores" color="var(--v)" />
          <KpiCard val={alumnosSinCurso} label="Sin curso" color={alumnosSinCurso>0?'var(--amber)':'var(--green)'} />
        </>}
      </div>

      {/* ── ZONA 3B: DETALLE AUSENCIAS ── */}
      {alertasAusencia.length > 0 && (
        <>
          <SL style={{marginBottom:'10px'}}>Ausencias consecutivas</SL>
          <div style={{marginBottom:'20px'}}>
            {alertasAusencia.map((al:any,i:number) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',background:'var(--white)',border:'1.5px solid #f5c5c5',borderRadius:'14px',marginBottom:'8px'}}>
                <Av color={al.color} nombre={al.nombre} apellido={al.apellido} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{al.curso} · {al.consecutivas} faltas seguidas</div>
                </div>
                <span style={{padding:'3px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',flexShrink:0}}>{al.consecutivas} ausencias</span>
              </div>
            ))}
          </div>
        </>
      )}

      {/* ── ZONA 4: CUMPLEAÑOS (menor peso) ── */}
      {cumpleanos.length > 0 && (
        <div style={{marginBottom:'20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <SL>Próximos cumpleaños</SL>
            <span style={{fontSize:'11px',color:'var(--text3)',fontWeight:500}}>30 días</span>
          </div>
          <div style={{background:'var(--white)',border:'1.5px solid #fce7f3',borderRadius:'16px',overflow:'hidden'}}>
            <div style={{background:'linear-gradient(135deg,#fce7f3,#fff0f8)',padding:'10px 16px',borderBottom:'1px solid #fce7f3',display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'18px'}}>🎂</span>
              <span style={{fontSize:'12px',fontWeight:700,color:'#db2777'}}>{cumpleanos.length} este mes</span>
            </div>
            {cumpleanos.map((cu:any,idx:number) => (
              <div key={cu.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 16px',borderBottom:idx<cumpleanos.length-1?'1px solid #fce7f3':'none',background:cu.diasParaCumple===0?'#fff0f8':'transparent'}}>
                <Av color={cu.color||'#db2777'} nombre={cu.nombre} apellido={cu.apellido} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13px',fontWeight:600}}>{cu.nombre} {cu.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'2px'}}>
                    {cu.diasParaCumple===0 ? <span style={{color:'#db2777',fontWeight:700}}>🎉 Hoy</span>
                    : cu.diasParaCumple===1 ? <span style={{color:'#db2777',fontWeight:600}}>Mañana</span>
                    : `En ${cu.diasParaCumple} días`}
                  </div>
                </div>
                <div style={{background:'#fce7f3',color:'#db2777',padding:'3px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:700,flexShrink:0}}>{cu.fechaStr}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── ZONA 5: PRÓXIMOS EVENTOS ── */}
      {proximosEventos.length > 0 && (
        <>
          <SL style={{marginBottom:'10px'}}>Próximos eventos</SL>
          <div style={{marginBottom:'18px'}}>
            {proximosEventos.map((ev:any) => <EventoCard key={ev.id} ev={ev} />)}
          </div>
        </>
      )}
    </div>
  )
}

function fmt(fecha: string) {
  if (!fecha) return '—'
  const [y,m,d] = fecha.split('-')
  return `${d}/${m}`
}

const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>

const Av = ({color,nombre,apellido,size}:any) => (
  <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.3+'px',fontWeight:700,color:'#fff',flexShrink:0}}>
    {nombre?.[0]}{apellido?.[0]}
  </div>
)

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

const CursoCard = ({c,col}:any) => (
  <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
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

const EventoCard = ({ev}:any) => {
  const tipo = TIPOS_AGENDA.find(t => t.value === ev.tipo) || TIPOS_AGENDA[6]
  const esHoy = ev.fecha === new Date().toISOString().split('T')[0]
  const fechaFmt = new Date(ev.fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})
  return (
    <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 14px',background:'var(--white)',border:`1.5px solid ${esHoy?tipo.color:'var(--border)'}`,borderRadius:'14px',marginBottom:'8px'}}>
      <div style={{width:40,height:40,borderRadius:12,background:tipo.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>{tipo.emoji}</div>
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
}
