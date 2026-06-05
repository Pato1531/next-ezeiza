'use client'
import { useState, useEffect, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useProfesoras, apiHeaders } from '@/lib/hooks'

const TIPOS = [
  { value: 'reunion',     label: 'Reunión',               color: '#652f8d', bg: '#f2e8f9', emoji: '👥' },
  { value: 'examen',      label: 'Examen',                color: '#c0392b', bg: '#fdeaea', emoji: '📝' },
  { value: 'observacion', label: 'Observación de Clases', color: '#1a73e8', bg: '#e8f0fe', emoji: '👁' },
  { value: 'evento',      label: 'Evento especial',       color: '#f97316', bg: '#fff7ed', emoji: '🎉' },
  { value: 'cumpleanos',  label: 'Cumpleaños',            color: '#db2777', bg: '#fce7f3', emoji: '🎂' },
  { value: 'feriado',     label: 'Feriado / Sin clases',  color: '#b45309', bg: '#fef3cd', emoji: '🏖' },
  { value: 'admin',       label: 'Administrativo',        color: '#2d7a4f', bg: '#e6f4ec', emoji: '📋' },
  { value: 'otro',        label: 'Otro',                  color: '#9b8eaa', bg: '#f9f5fd', emoji: '📌' },
]
const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Dom','Lun','Mar','Mié','Jue','Vie','Sáb']

function hoy() { return new Date().toISOString().split('T')[0] }

// Dado fecha_nacimiento (YYYY-MM-DD), devuelve la fecha del próximo cumple (o hoy si es hoy)
function proximoCumple(fechaNac: string): string {
  const hoyDate = new Date()
  const anio = hoyDate.getFullYear()
  const [, mm, dd] = fechaNac.split('-')
  let candidato = `${anio}-${mm}-${dd}`
  if (candidato < hoy()) candidato = `${anio + 1}-${mm}-${dd}`
  return candidato
}

export default function Agenda() {
  const { usuario } = useAuth()
  const esDirector = usuario?.rol === 'director'
  const esCoord = usuario?.rol === 'coordinadora' || usuario?.rol === 'secretaria' || esDirector
  const { profesoras } = useProfesoras()

  const [eventos, setEventos] = useState<any[]>([])
  // feriados: dateStr → nombre — solo para indicadores visuales, NO se mezclan en la lista Próximos
  const [feriados, setFeriados] = useState<Record<string, string>>({})
  const [vista, setVista] = useState<'proximos'|'mensual'|'anual'|'nuevo'>('proximos')
  const [form, setForm] = useState({
    titulo: '', tipo: 'reunion', fecha: hoy(), hora_inicio: '', hora_fin: '',
    descripcion: '', convocados: 'todos', docente_id: '',
    destinatarios_ids: [] as string[],
  })
  const [guardando, setGuardando] = useState(false)
  const [mesActual, setMesActual] = useState(new Date().getMonth())
  const [anioActual, setAnioActual] = useState(new Date().getFullYear())
  const [diaSeleccionado, setDiaSeleccionado] = useState<string | null>(null)
  const [usuariosInstituto, setUsuariosInstituto] = useState<any[]>([])
  const [cargandoUsuarios, setCargandoUsuarios] = useState(false)
  const [feriadosAnios, setFeriadosAnios] = useState<Set<number>>(new Set())

  useEffect(() => { cargarEventos() }, []) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!usuario?.id || !esCoord) return
    setCargandoUsuarios(true)
    fetch('/api/usuarios', { headers: apiHeaders() })
      .then(async r => {
        const json = await r.json()
        if (json.data) setUsuariosInstituto(json.data.filter((u: any) => u.activo))
        else setUsuariosInstituto([])
        setCargandoUsuarios(false)
      })
      .catch(() => { setUsuariosInstituto([]); setCargandoUsuarios(false) })
  }, [usuario?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Feriados argentinos (nager.date) — solo para indicadores visuales del calendario ──
  const cargarFeriados = useCallback(async (anio: number) => {
    if (feriadosAnios.has(anio)) return
    try {
      const res = await fetch(`https://date.nager.at/api/v3/PublicHolidays/${anio}/AR`)
      if (!res.ok) return
      const data: { date: string; localName: string }[] = await res.json()
      const mapa: Record<string, string> = {}
      data.forEach(f => { mapa[f.date] = f.localName })
      setFeriados(prev => ({ ...prev, ...mapa }))
      setFeriadosAnios(prev => new Set(prev).add(anio))
    } catch { /* silencioso */ }
  }, [feriadosAnios])

  useEffect(() => { cargarFeriados(anioActual) }, [anioActual]) // eslint-disable-line react-hooks/exhaustive-deps

  const cargarEventos = async () => {
    const res = await fetch('/api/agenda-eventos', { headers: apiHeaders() })
    if (!res.ok) return
    const json = await res.json()
    if (!json.error) setEventos(json.data || [])
  }

  const esVisible = (ev: any) => {
    if (esCoord) return true
    if (ev.convocados === 'todos') return true
    if (ev.convocados === 'individual') {
      const lista: string[] = Array.isArray(ev.destinatarios_ids)
        ? ev.destinatarios_ids.map((x: any) => String(x))
        : []
      return lista.length > 0 && lista.includes(String(usuario?.id || ''))
    }
    if (ev.convocados === 'docentes' && usuario?.rol === 'profesora') return true
    if (ev.convocados === 'coordinacion' && usuario?.rol === 'coordinadora') return true
    if (ev.convocados === 'secretaria' && usuario?.rol === 'secretaria') return true
    return false
  }

  const misEventos = eventos.filter(esVisible)

  // ── Cumpleaños automáticos de colaboradores (solo coord/director los ven) ──
  // Se generan desde fecha_nacimiento de profesoras — no van a la DB, son virtuales
  const cumplesCola: any[] = esCoord
    ? profesoras
        .filter((p: any) => p.fecha_nacimiento)
        .map((p: any) => ({
          _virtual: true,
          id: `cumple-${p.id}`,
          titulo: `🎂 Cumple: ${p.nombre} ${p.apellido}`,
          tipo: 'cumpleanos',
          fecha: proximoCumple(p.fecha_nacimiento),
          hora_inicio: '',
          hora_fin: '',
          descripcion: '',
          convocados: 'coordinacion',
          destinatarios_ids: null,
        }))
    : []

  const hoyStr = hoy()

  // Lista Próximos: eventos de DB + cumples virtuales, ordenados por fecha, sin duplicados
  const todosProximos = [...misEventos, ...cumplesCola]
    .filter(e => e.fecha >= hoyStr)
    .sort((a, b) => a.fecha.localeCompare(b.fecha))
    .slice(0, 25)

  const pasados = misEventos
    .filter(e => e.fecha < hoyStr)
    .slice(-10)
    .reverse()

  // ── Calendario ──
  const primerDia  = new Date(anioActual, mesActual, 1).getDay()
  const diasEnMes  = new Date(anioActual, mesActual + 1, 0).getDate()
  const celdas: (number|null)[] = Array(primerDia).fill(null)
  for (let i = 1; i <= diasEnMes; i++) celdas.push(i)
  while (celdas.length % 7 !== 0) celdas.push(null)

  // Eventos del día (DB + cumples virtuales del mes visible)
  const cumplesMes = cumplesCola.filter(c => {
    const [a, m] = c.fecha.split('-').map(Number)
    return a === anioActual && m === mesActual + 1
  })
  const todosEventosMes = [...misEventos, ...cumplesMes]

  const eventosDia = (dia: number) => {
    const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
    return todosEventosMes.filter(e => e.fecha === dateStr)
  }

  const feriadosDelMes = Object.entries(feriados).filter(([date]) => {
    const [a, m] = date.split('-').map(Number)
    return a === anioActual && m === mesActual + 1
  })

  const handleDiaClick = (dateStr: string, evsDia: any[]) => {
    if (evsDia.length > 0 || feriados[dateStr]) {
      setDiaSeleccionado(prev => prev === dateStr ? null : dateStr)
    } else if (esCoord) {
      setForm(f => ({ ...f, fecha: dateStr }))
      setVista('nuevo')
    }
  }

  const guardar = async () => {
    if (!form.titulo || !form.fecha) return alert('Título y fecha son obligatorios')
    if (form.tipo === 'observacion' && !form.docente_id) return alert('La docente es obligatoria para Observación de Clases')
    if (form.convocados === 'individual' && form.destinatarios_ids.length === 0) return alert('Seleccioná al menos un destinatario')
    setGuardando(true)
    try {
      const payload = {
        ...form,
        destinatarios_ids: form.convocados === 'individual' ? form.destinatarios_ids : null,
        creado_por: usuario?.nombre,
      }
      const res = await fetch('/api/guardar-evento', {
        method: 'POST', headers: apiHeaders(), body: JSON.stringify(payload)
      })
      const json = await res.json()
      if (json.error) { alert('Error: ' + json.error); setGuardando(false); return }
      await cargarEventos()
      setVista('proximos')
      setForm({ titulo:'', tipo:'reunion', fecha: hoy(), hora_inicio:'', hora_fin:'', descripcion:'', convocados:'todos', docente_id:'', destinatarios_ids:[] })
    } catch { alert('Error al guardar') }
    setGuardando(false)
  }

  const eliminar = async (id: string) => {
    if (!confirm('¿Eliminar este evento?')) return
    const res = await fetch('/api/agenda-eventos', {
      method: 'DELETE', headers: apiHeaders(), body: JSON.stringify({ id }),
    })
    if (res.ok) setEventos(prev => prev.filter(e => e.id !== id))
  }

  const exportarICS = (ev: any) => {
    const pad = (n: number) => String(n).padStart(2, '0')
    const [anio, mes, dia] = ev.fecha.split('-').map(Number)
    let dtStart: string, dtEnd: string
    if (ev.hora_inicio) {
      const [h, m] = ev.hora_inicio.split(':').map(Number)
      dtStart = `${anio}${pad(mes)}${pad(dia)}T${pad(h)}${pad(m)}00`
      if (ev.hora_fin) {
        const [hf, mf] = ev.hora_fin.split(':').map(Number)
        dtEnd = `${anio}${pad(mes)}${pad(dia)}T${pad(hf)}${pad(mf)}00`
      } else {
        dtEnd = `${anio}${pad(mes)}${pad(dia)}T${pad(h+1)}${pad(m)}00`
      }
    } else {
      dtStart = `${anio}${pad(mes)}${pad(dia)}`
      const diaSig = new Date(anio, mes - 1, dia + 1)
      dtEnd = `${diaSig.getFullYear()}${pad(diaSig.getMonth()+1)}${pad(diaSig.getDate())}`
    }
    const uid = `${ev.id || Date.now()}@edugest`
    const ahora = new Date().toISOString().replace(/[-:]/g,'').split('.')[0] + 'Z'
    const descripcion = (ev.descripcion || '').replace(/\n/g, '\\n')
    const ics = [
      'BEGIN:VCALENDAR','VERSION:2.0','PRODID:-//EduGest//Agenda//ES',
      'CALSCALE:GREGORIAN','METHOD:PUBLISH','BEGIN:VEVENT',
      `UID:${uid}`,`DTSTAMP:${ahora}`,
      ev.hora_inicio ? `DTSTART:${dtStart}` : `DTSTART;VALUE=DATE:${dtStart}`,
      ev.hora_inicio ? `DTEND:${dtEnd}`   : `DTEND;VALUE=DATE:${dtEnd}`,
      `SUMMARY:${ev.titulo}`,
      descripcion ? `DESCRIPTION:${descripcion}` : '',
      'END:VEVENT','END:VCALENDAR',
    ].filter(Boolean).join('\r\n')
    const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' })
    const url  = URL.createObjectURL(blob)
    const a    = document.createElement('a')
    a.href = url; a.download = `${ev.titulo.replace(/[^a-z0-9]/gi, '_')}.ics`; a.click()
    URL.revokeObjectURL(url)
  }

  const convocadosLabel = (ev: any) => {
    if (ev.convocados === 'individual') {
      const n = ev.destinatarios_ids?.length || 0
      return `👤 ${n} persona${n !== 1 ? 's' : ''}`
    }
    const map: Record<string,string> = { todos:'Todos', docentes:'Docentes', coordinacion:'Coordinación', secretaria:'Secretaría' }
    return map[ev.convocados] || ev.convocados
  }

  const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

  // ── RENDER ──────────────────────────────────────────────────────────────────
  return (
    <div className="fade-in">

      {/* HEADER */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Agenda del instituto</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Compartida con todo el equipo</div>
        </div>
        {esCoord && (
          <button
            onClick={() => { setForm(f => ({ ...f, fecha: hoy() })); setVista('nuevo') }}
            style={{padding:'9px 14px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
            + Nuevo
          </button>
        )}
      </div>

      {/* TABS */}
      <div style={{overflowX:'auto',WebkitOverflowScrolling:'touch',marginBottom:'16px',marginLeft:'-4px',paddingLeft:'4px'}}>
        <div style={{display:'flex',gap:'6px',minWidth:'max-content'}}>
          {(['proximos','mensual','anual'] as const).map(v => (
            <button key={v} onClick={() => setVista(v)}
              style={{padding:'9px 16px',borderRadius:'20px',border:'1.5px solid',fontSize:'12px',fontWeight:700,cursor:'pointer',
                background:vista===v?'var(--v)':'transparent',color:vista===v?'#fff':'var(--text2)',
                borderColor:vista===v?'var(--v)':'var(--border)',whiteSpace:'nowrap',flexShrink:0}}>
              {v === 'proximos' ? '📋 Próximos' : v === 'mensual' ? '📅 Mensual' : '🗓 Anual'}
            </button>
          ))}
        </div>
      </div>

      {/* ══════════════════════════════════════
          VISTA: PRÓXIMOS
      ══════════════════════════════════════ */}
      {vista === 'proximos' && (
        <>
          {todosProximos.length === 0 && (
            <div style={{textAlign:'center',padding:'48px 20px',color:'var(--text3)',background:'var(--white)',borderRadius:'16px',border:'1.5px solid var(--border)'}}>
              <div style={{fontSize:'32px',marginBottom:'8px'}}>📅</div>
              <div style={{fontWeight:600}}>No hay eventos próximos</div>
              {esCoord && <div style={{fontSize:'13px',marginTop:'4px'}}>Creá el primero con el botón + Nuevo</div>}
            </div>
          )}

          {todosProximos.length > 0 && (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden',marginBottom:'12px'}}>
              {todosProximos.map((ev, i) => {
                const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[7]
                const esHoy = ev.fecha === hoyStr
                const esVirtual = !!ev._virtual
                return (
                  <div key={ev.id} style={{display:'flex',gap:'12px',padding:'14px 16px',
                    borderBottom:i<todosProximos.length-1?'1px solid var(--border)':'none',
                    background:esHoy?'var(--vl)':'transparent'}}>
                    <div style={{flexShrink:0,width:'44px',background:tipo.bg,borderRadius:'12px',padding:'8px 4px',textAlign:'center'}}>
                      <div style={{fontSize:'18px'}}>{tipo.emoji}</div>
                      <div style={{fontSize:'11px',fontWeight:800,color:tipo.color}}>
                        {String(new Date(ev.fecha+'T12:00').getDate()).padStart(2,'0')}
                      </div>
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:'2px'}}>{ev.titulo}</div>
                      <div style={{fontSize:'12px',color:'var(--text3)',display:'flex',gap:'8px',flexWrap:'wrap',alignItems:'center'}}>
                        <span>{new Date(ev.fecha+'T12:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric',month:'short'})}</span>
                        {ev.hora_inicio && <span>· {ev.hora_inicio}{ev.hora_fin ? ` – ${ev.hora_fin}` : ''}</span>}
                        <span style={{padding:'1px 7px',borderRadius:'10px',background:tipo.bg,color:tipo.color,fontSize:'10px',fontWeight:600}}>{tipo.label}</span>
                        {esCoord && !esVirtual && (
                          <span style={{padding:'1px 7px',borderRadius:'10px',background:'var(--bg)',color:'var(--text3)',fontSize:'10px',fontWeight:600}}>
                            {convocadosLabel(ev)}
                          </span>
                        )}
                        {esVirtual && (
                          <span style={{padding:'1px 7px',borderRadius:'10px',background:'#fce7f3',color:'#db2777',fontSize:'10px',fontWeight:600}}>Auto</span>
                        )}
                      </div>
                      {ev.descripcion && <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'4px',lineHeight:1.4}}>{ev.descripcion}</div>}
                    </div>
                    <div style={{display:'flex',flexDirection:'column',gap:'4px',flexShrink:0,alignItems:'flex-end'}}>
                      {!esVirtual && (
                        <button onClick={() => exportarICS(ev)} title="Agregar a Google Calendar / Apple Calendar"
                          style={{background:'var(--vl)',border:'1.5px solid var(--v)',borderRadius:'8px',cursor:'pointer',padding:'4px 8px',fontSize:'11px',fontWeight:700,color:'var(--v)',whiteSpace:'nowrap'}}>
                          📅 +Cal
                        </button>
                      )}
                      {esCoord && !esVirtual && (
                        <button onClick={() => eliminar(ev.id)}
                          style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:'16px',padding:'2px 4px',lineHeight:1}}
                          title="Eliminar">×</button>
                      )}
                    </div>
                  </div>
                )
              })}
            </div>
          )}

          {/* Pasados */}
          {pasados.length > 0 && (
            <>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px',marginTop:'4px'}}>
                Eventos pasados
              </div>
              <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden'}}>
                {pasados.map((ev, i) => {
                  const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[7]
                  return (
                    <div key={ev.id} style={{display:'flex',gap:'12px',padding:'12px 16px',
                      borderBottom:i<pasados.length-1?'1px solid var(--border)':'none',opacity:.55}}>
                      <div style={{fontSize:'20px'}}>{tipo.emoji}</div>
                      <div style={{flex:1}}>
                        <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{ev.titulo}</div>
                        <div style={{fontSize:'11px',color:'var(--text3)'}}>
                          {new Date(ev.fecha+'T12:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}
                        </div>
                      </div>
                      {esCoord && (
                        <button onClick={() => eliminar(ev.id)}
                          style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:'16px',alignSelf:'center'}}
                          title="Eliminar">×</button>
                      )}
                    </div>
                  )
                })}
              </div>
            </>
          )}
        </>
      )}

      {/* ══════════════════════════════════════
          VISTA: MENSUAL
      ══════════════════════════════════════ */}
      {vista === 'mensual' && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>

          {/* Navegación de mes */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'14px'}}>
            <button
              onClick={() => { setDiaSeleccionado(null); if(mesActual===0){setMesActual(11);setAnioActual(a=>a-1)}else setMesActual(m=>m-1) }}
              style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--vl)',border:'none',cursor:'pointer',color:'var(--v)',fontSize:'18px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
              ‹
            </button>
            <div style={{fontSize:'16px',fontWeight:800}}>{MESES[mesActual]} {anioActual}</div>
            <button
              onClick={() => { setDiaSeleccionado(null); if(mesActual===11){setMesActual(0);setAnioActual(a=>a+1)}else setMesActual(m=>m+1) }}
              style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--vl)',border:'none',cursor:'pointer',color:'var(--v)',fontSize:'18px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
              ›
            </button>
          </div>

          {/* Lista compacta de eventos del mes actual */}
          {(() => {
            const eventosMesOrdenados = [
              ...feriadosDelMes.map(([date, nombre]) => ({
                _feriado: true, fecha: date, titulo: nombre,
                tipo: 'feriado', id: `feriado-${date}`
              })),
              ...todosEventosMes,
            ].sort((a, b) => a.fecha.localeCompare(b.fecha))
            if (eventosMesOrdenados.length === 0) return (
              <div style={{marginBottom:'10px',fontSize:'12px',color:'var(--text3)',textAlign:'center',padding:'8px 0'}}>
                Sin eventos este mes
              </div>
            )
            return (
              <div style={{marginBottom:'12px',display:'flex',flexDirection:'column',gap:'4px'}}>
                {eventosMesOrdenados.map(ev => {
                  const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[7]
                  const esFer = !!(ev as any)._feriado
                  const diaSemana = new Date(ev.fecha+'T12:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric'})
                  return (
                    <div key={ev.id}
                      onClick={() => !esFer && handleDiaClick(ev.fecha, eventosDia(parseInt(ev.fecha.split('-')[2])))}
                      style={{display:'flex',alignItems:'center',gap:'8px',padding:'6px 10px',
                        background: esFer ? '#fef3cd' : tipo.bg,
                        border: `1px solid ${esFer ? '#b45309' : tipo.color}`,
                        borderRadius:'8px',cursor:esFer?'default':'pointer'}}>
                      <span style={{fontSize:'12px',flexShrink:0}}>{tipo.emoji}</span>
                      <span style={{flex:1,fontSize:'12px',fontWeight:600,color:esFer?'#633806':tipo.color,
                        overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                        {ev.titulo}
                      </span>
                      <span style={{fontSize:'11px',color:esFer?'#7c4a14':tipo.color,flexShrink:0,opacity:.8,textTransform:'capitalize'}}>
                        {diaSemana}
                      </span>
                    </div>
                  )
                })}
              </div>
            )
          })()}

          {/* Días de la semana — compacto */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'1px',marginBottom:'2px'}}>
            {DIAS_SEMANA.map(d => (
              <div key={d} style={{textAlign:'center',fontSize:'9px',fontWeight:700,color:'var(--text3)',padding:'3px 0'}}>{d}</div>
            ))}
          </div>

          {/* Celdas compactas — mes entero visible */}
          <div style={{display:'grid',gridTemplateColumns:'repeat(7,1fr)',gap:'1px'}}>
            {celdas.map((dia, idx) => {
              if (!dia) return <div key={idx} style={{height:'32px'}} />
              const dateStr = `${anioActual}-${String(mesActual+1).padStart(2,'0')}-${String(dia).padStart(2,'0')}`
              const evsDia = eventosDia(dia)
              const esFeriado = !!feriados[dateStr]
              const esHoy = dateStr === hoyStr
              const seleccionado = diaSeleccionado === dateStr
              const tieneAlgo = evsDia.length > 0 || esFeriado
              const tipoEv = evsDia[0] ? (TIPOS.find(t => t.value === evsDia[0].tipo) || TIPOS[7]) : null

              let cellBg = 'transparent'
              if (seleccionado) cellBg = 'var(--v)'
              else if (esHoy) cellBg = 'var(--vl)'
              else if (esFeriado && evsDia.length === 0) cellBg = '#fef3cd'
              else if (tipoEv) cellBg = tipoEv.bg

              let numColor = 'var(--text)'
              if (seleccionado) numColor = '#fff'
              else if (esHoy) numColor = 'var(--v)'
              else if (esFeriado && !tipoEv) numColor = '#b45309'
              else if (tipoEv) numColor = tipoEv.color

              return (
                <div key={idx}
                  onClick={() => handleDiaClick(dateStr, evsDia)}
                  style={{height:'32px',display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',
                    borderRadius:'6px',background:cellBg,
                    cursor: tieneAlgo || esCoord ? 'pointer' : 'default',
                    border: seleccionado ? '2px solid var(--v)' : '2px solid transparent',
                    transition:'all .12s',position:'relative',gap:'1px'}}>
                  <div style={{fontSize:'11px',fontWeight:esHoy||tieneAlgo?700:400,color:numColor,lineHeight:1}}>{dia}</div>
                  {tieneAlgo && (
                    <div style={{display:'flex',gap:'2px',justifyContent:'center'}}>
                      {esFeriado && <div style={{width:'3px',height:'3px',borderRadius:'50%',background:seleccionado?'rgba(255,255,255,.7)':'#b45309'}} />}
                      {evsDia.slice(0,2).map((ev: any, i: number) => {
                        const t = TIPOS.find(t => t.value === ev.tipo) || TIPOS[7]
                        return <div key={i} style={{width:'3px',height:'3px',borderRadius:'50%',background:seleccionado?'rgba(255,255,255,.7)':t.color}} />
                      })}
                    </div>
                  )}
                </div>
              )
            })}
          </div>

          {/* Panel de detalle del día */}
          {diaSeleccionado && (() => {
            const evsDia = todosEventosMes.filter(e => e.fecha === diaSeleccionado)
            const feriadoNombre = feriados[diaSeleccionado]
            const fechaLabel = new Date(diaSeleccionado + 'T12:00').toLocaleDateString('es-AR', {
              weekday:'long', day:'numeric', month:'long'
            })
            return (
              <div style={{marginTop:'14px',background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:'12px',padding:'14px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
                  <div style={{fontSize:'13px',fontWeight:700,color:'var(--text)',textTransform:'capitalize'}}>{fechaLabel}</div>
                  <div style={{display:'flex',gap:'6px',alignItems:'center'}}>
                    {esCoord && (
                      <button
                        onClick={() => { setForm(f => ({ ...f, fecha: diaSeleccionado })); setVista('nuevo') }}
                        style={{padding:'4px 10px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer'}}>
                        + Evento
                      </button>
                    )}
                    <button onClick={() => setDiaSeleccionado(null)}
                      style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:'18px',lineHeight:1,padding:'0 4px'}}>×</button>
                  </div>
                </div>

                {feriadoNombre && (
                  <div style={{display:'flex',alignItems:'center',gap:'8px',padding:'8px 10px',background:'#fef3cd',border:'1px solid #b45309',borderRadius:'8px',marginBottom:'8px'}}>
                    <span style={{fontSize:'14px'}}>🏖</span>
                    <div>
                      <div style={{fontSize:'12px',fontWeight:700,color:'#633806'}}>Feriado nacional</div>
                      <div style={{fontSize:'11px',color:'#7c4a14'}}>{feriadoNombre} · Sin clases</div>
                    </div>
                  </div>
                )}

                {evsDia.length === 0 && !feriadoNombre && (
                  <div style={{textAlign:'center',padding:'12px',color:'var(--text3)',fontSize:'13px'}}>
                    No hay eventos para este día
                    {esCoord && <div style={{fontSize:'12px',marginTop:'4px'}}>Usá + Evento para agregar uno</div>}
                  </div>
                )}

                <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
                  {evsDia.map(ev => {
                    const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[7]
                    const esVirtual = !!ev._virtual
                    return (
                      <div key={ev.id} style={{display:'flex',gap:'10px',alignItems:'flex-start',padding:'10px',background:'var(--white)',borderRadius:'10px',border:'1px solid var(--border)'}}>
                        <div style={{width:'32px',height:'32px',borderRadius:'8px',background:tipo.bg,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'16px',flexShrink:0}}>
                          {tipo.emoji}
                        </div>
                        <div style={{flex:1,minWidth:0}}>
                          <div style={{fontSize:'13px',fontWeight:700,color:'var(--text)'}}>{ev.titulo}</div>
                          <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px',display:'flex',gap:'6px',flexWrap:'wrap'}}>
                            {ev.hora_inicio && <span>{ev.hora_inicio}{ev.hora_fin ? ` – ${ev.hora_fin}` : ''}</span>}
                            <span style={{padding:'1px 6px',borderRadius:'8px',background:tipo.bg,color:tipo.color,fontSize:'10px',fontWeight:600}}>{tipo.label}</span>
                            {esVirtual && <span style={{padding:'1px 6px',borderRadius:'8px',background:'#fce7f3',color:'#db2777',fontSize:'10px',fontWeight:600}}>Auto</span>}
                            {esCoord && !esVirtual && ev.convocados && (
                              <span style={{padding:'1px 6px',borderRadius:'8px',background:'var(--bg)',color:'var(--text3)',fontSize:'10px',fontWeight:600}}>
                                {convocadosLabel(ev)}
                              </span>
                            )}
                          </div>
                          {ev.descripcion && <div style={{fontSize:'11px',color:'var(--text2)',marginTop:'4px',lineHeight:1.4}}>{ev.descripcion}</div>}
                        </div>
                        {!esVirtual && (
                          <div style={{display:'flex',flexDirection:'column',gap:'4px',alignItems:'flex-end',flexShrink:0}}>
                            <button onClick={() => exportarICS(ev)}
                              style={{background:'var(--vl)',border:'1px solid var(--v)',borderRadius:'6px',cursor:'pointer',padding:'3px 6px',fontSize:'10px',fontWeight:700,color:'var(--v)',whiteSpace:'nowrap'}}>
                              +Cal
                            </button>
                            {esCoord && (
                              <button onClick={() => eliminar(ev.id)}
                                style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:'14px',lineHeight:1}}
                                title="Eliminar">×</button>
                            )}
                          </div>
                        )}
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })()}

          {/* Leyenda */}
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

      {/* ══════════════════════════════════════
          VISTA: ANUAL
      ══════════════════════════════════════ */}
      {vista === 'anual' && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
          {/* Selector de año */}
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
            <button
              onClick={() => setAnioActual(a => a - 1)}
              style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--vl)',border:'none',cursor:'pointer',color:'var(--v)',fontSize:'18px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
              ‹
            </button>
            <div style={{fontSize:'16px',fontWeight:800}}>{anioActual}</div>
            <button
              onClick={() => setAnioActual(a => a + 1)}
              style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--vl)',border:'none',cursor:'pointer',color:'var(--v)',fontSize:'18px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center'}}>
              ›
            </button>
          </div>

          {/* Un bloque por mes */}
          {MESES.map((nombreMes, mIdx) => {
            const mesStr = String(mIdx + 1).padStart(2, '0')

            // Feriados del mes
            const feriadosMes = Object.entries(feriados).filter(([d]) => {
              const [a, m] = d.split('-').map(Number)
              return a === anioActual && m === mIdx + 1
            })

            // Eventos de la DB del mes
            const eventosMes = [...misEventos, ...cumplesCola].filter(e => {
              const [a, m] = e.fecha.split('-').map(Number)
              return a === anioActual && m === mIdx + 1
            })

            const todos = [
              ...feriadosMes.map(([date, nombre]) => ({
                _feriado: true, fecha: date, titulo: nombre,
                tipo: 'feriado', id: `feriado-${date}`
              })),
              ...eventosMes,
            ].sort((a, b) => a.fecha.localeCompare(b.fecha))

            if (todos.length === 0) return null

            return (
              <div key={mIdx} style={{marginBottom:'14px'}}>
                {/* Header del mes */}
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'6px'}}>
                  <div style={{fontSize:'13px',fontWeight:700,color:'var(--v)'}}>{nombreMes}</div>
                  <div style={{flex:1,height:'1px',background:'var(--border)'}} />
                  <div style={{fontSize:'11px',color:'var(--text3)',fontWeight:600}}>{todos.length} evento{todos.length !== 1 ? 's' : ''}</div>
                </div>

                {/* Lista de eventos del mes */}
                <div style={{display:'flex',flexDirection:'column',gap:'3px'}}>
                  {todos.map(ev => {
                    const tipo = TIPOS.find(t => t.value === ev.tipo) || TIPOS[7]
                    const esFer = !!(ev as any)._feriado
                    const dia = new Date(ev.fecha+'T12:00').toLocaleDateString('es-AR',{weekday:'short',day:'numeric'})
                    return (
                      <div key={ev.id} style={{display:'flex',alignItems:'center',gap:'8px',padding:'5px 9px',
                        background:esFer?'#fef3cd':tipo.bg,
                        border:`1px solid ${esFer?'#b45309':tipo.color}`,
                        borderRadius:'7px'}}>
                        <span style={{fontSize:'11px',flexShrink:0}}>{tipo.emoji}</span>
                        <span style={{flex:1,fontSize:'12px',fontWeight:600,color:esFer?'#633806':tipo.color,
                          overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>
                          {ev.titulo}
                        </span>
                        <span style={{fontSize:'10px',color:esFer?'#7c4a14':tipo.color,flexShrink:0,opacity:.8,textTransform:'capitalize'}}>
                          {dia}
                        </span>
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}

          {/* Si no hay ningún evento en todo el año */}
          {[...misEventos, ...cumplesCola].filter(e => e.fecha.startsWith(String(anioActual))).length === 0 &&
           Object.keys(feriados).filter(d => d.startsWith(String(anioActual))).length === 0 && (
            <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>
              Sin eventos registrados para {anioActual}
            </div>
          )}
        </div>
      )}


      {vista === 'nuevo' && esCoord && (
        <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'16px'}}>
            <button onClick={() => setVista('proximos')}
              style={{width:'32px',height:'32px',borderRadius:'8px',background:'var(--bg)',border:'1px solid var(--border)',cursor:'pointer',color:'var(--text2)',fontSize:'16px',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
              ←
            </button>
            <div style={{fontSize:'16px',fontWeight:700}}>Nuevo evento</div>
          </div>

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
            <textarea style={{...IS,resize:'none',lineHeight:1.5}} rows={3}
              value={form.descripcion} onChange={(e:any)=>setForm({...form,descripcion:e.target.value})}
              placeholder="Detalles del evento..." />
          </div>

          <div style={{marginBottom:'16px'}}>
            <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'6px'}}>¿Quiénes son convocados?</div>
            <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
              {[{v:'todos',l:'Todos'},{v:'docentes',l:'Docentes'},{v:'coordinadora',l:'Coordinación'},{v:'secretaria',l:'Secretaría'},{v:'individual',l:'👤 Específicos'}].map(({v,l}) => (
                <button key={v} onClick={() => setForm({...form,convocados:v,destinatarios_ids:[]})}
                  style={{padding:'6px 12px',borderRadius:'20px',border:'1.5px solid',fontSize:'12px',fontWeight:600,cursor:'pointer',
                    background:form.convocados===v?'var(--v)':'transparent',color:form.convocados===v?'#fff':'var(--text2)',
                    borderColor:form.convocados===v?'var(--v)':'var(--border)'}}>
                  {l}
                </button>
              ))}
            </div>
          </div>

          {form.convocados === 'individual' && (
            <div style={{marginBottom:'16px',background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:'10px',padding:'12px'}}>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'8px'}}>
                Seleccioná los convocados
                {form.destinatarios_ids.length > 0 && (
                  <span style={{marginLeft:'8px',fontWeight:700,color:'var(--v)'}}>({form.destinatarios_ids.length} seleccionado{form.destinatarios_ids.length !== 1 ? 's' : ''})</span>
                )}
              </div>
              {cargandoUsuarios ? (
                <div style={{fontSize:'13px',color:'var(--text3)'}}>Cargando usuarios...</div>
              ) : usuariosInstituto.length === 0 ? (
                <div style={{fontSize:'13px',color:'var(--text3)'}}>Sin usuarios disponibles</div>
              ) : (
                <div style={{display:'flex',flexDirection:'column',gap:'4px',maxHeight:'200px',overflowY:'auto'}}>
                  {usuariosInstituto
                    .filter(u => u.id !== usuario?.id)
                    .map(u => {
                      const sel = form.destinatarios_ids.includes(u.id)
                      return (
                        <label key={u.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'8px 10px',borderRadius:'8px',cursor:'pointer',
                          background:sel?'var(--vl)':'transparent',border:`1.5px solid ${sel?'var(--v)':'transparent'}`,transition:'all .12s'}}>
                          <input type="checkbox" checked={sel}
                            onChange={() => setForm(f => ({
                              ...f,
                              destinatarios_ids: sel ? f.destinatarios_ids.filter(x=>x!==u.id) : [...f.destinatarios_ids, u.id]
                            }))}
                            style={{accentColor:'var(--v)',width:'15px',height:'15px',cursor:'pointer'}}
                          />
                          <div style={{flex:1}}>
                            <span style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>{u.nombre}</span>
                            <span style={{fontSize:'11px',color:'var(--text3)',marginLeft:'6px',textTransform:'capitalize'}}>{u.rol}</span>
                          </div>
                          {sel && <span style={{fontSize:'13px',color:'var(--v)'}}>✓</span>}
                        </label>
                      )
                    })}
                </div>
              )}
            </div>
          )}

          <div style={{display:'flex',gap:'10px'}}>
            <button onClick={() => setVista('proximos')}
              style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
              Cancelar
            </button>
            <button onClick={guardar} disabled={guardando}
              style={{flex:2,padding:'12px',background:guardando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
              {guardando ? 'Guardando...' : 'Guardar evento'}
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
