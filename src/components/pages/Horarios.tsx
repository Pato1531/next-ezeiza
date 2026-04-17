'use client'
import { useState, useEffect } from 'react'
import { useProfesoras, useCursos, useMiProfesora, useAlumnos } from '@/lib/hooks'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

const DIAS = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábado']
const DIAS_S = ['Lun','Mar','Mié','Jue','Vie','Sáb']

function parseDias(diasStr: string): number[] {
  if (!diasStr) return []
  const resultado: number[] = []
  const partes = diasStr.split(/[,/]|\sy\s|\sY\s/).map((s:string) => s.trim())
  for (const parte of partes) {
    const idx = DIAS.findIndex(d =>
      d.toLowerCase() === parte.toLowerCase() ||
      d.toLowerCase().startsWith(parte.toLowerCase().slice(0,3)) ||
      parte.toLowerCase().startsWith(d.toLowerCase().slice(0,3))
    )
    if (idx >= 0 && !resultado.includes(idx)) resultado.push(idx)
  }
  return resultado
}

export default function Horarios() {
  const { cursos, loading: loadC } = useCursos()
  const { profesoras } = useProfesoras()
  const { miProfesora, loading: loadP } = useMiProfesora()
  const { usuario } = useAuth()
  const [vista, setVista] = useState<'semana'|'prof'>('semana')
  const [filtroProf, setFiltroProf] = useState<string|null>(null)
  // Conteo de alumnos por curso
  const [alumnosPorCurso, setAlumnosPorCurso] = useState<Record<string,number>>({})
  const esProfesora = usuario?.rol === 'profesora'
  const loading = loadC || (esProfesora && loadP)

  useEffect(() => {
    if (!cursos.length) return
    const sb = createClient()
    sb.from('cursos_alumnos').select('curso_id').then(({ data }) => {
      const conteo: Record<string,number> = {}
      ;(data || []).forEach((r: any) => {
        conteo[r.curso_id] = (conteo[r.curso_id] || 0) + 1
      })
      setAlumnosPorCurso(conteo)
    }).catch(() => {})
  }, [cursos.length])

  const hexRgb = (h: string, a: number) => {
    try {
      const r=parseInt(h.slice(1,3),16),g=parseInt(h.slice(3,5),16),b=parseInt(h.slice(5,7),16)
      return `rgba(${r},${g},${b},${a})`
    } catch { return `rgba(100,100,100,${a})` }
  }

  const slots = cursos.flatMap((curso:any) => {
    const dias = parseDias(curso.dias || '')
    return dias.map(dia => ({
      id: `${curso.id}-${dia}`,
      curso_id: curso.id,
      curso_nombre: curso.nombre,
      profesora_id: curso.profesora_id,
      nivel: curso.nivel,
      dia_semana: dia,
      hora_inicio: curso.hora_inicio || '',
      hora_fin: curso.hora_fin || '',
    }))
  })

  const slotsFiltrados = esProfesora && miProfesora
    ? slots.filter((s:any) => s.profesora_id === miProfesora.id)
    : filtroProf
      ? slots.filter((s:any) => s.profesora_id === filtroProf)
      : slots

  const turnos = [...new Set(slotsFiltrados.map((s:any) => s.hora_inicio))].filter(Boolean).sort() as string[]
  // Para celdas vacías: todos los turnos del día en la vista semana completa
  const todosLosTurnos = [...new Set(slots.map((s:any) => s.hora_inicio))].filter(Boolean).sort() as string[]

  const NIVEL_COL: Record<string,string> = {
    'Básico':'#b45309','Intermedio':'#1a6b8a','Advanced':'#2d7a4f','Cambridge':'#652f8d'
  }

  // Totales por día para el resumen
  const totalesPorDia = DIAS.map((_, di) => slotsFiltrados.filter((s:any) => s.dia_semana === di).length)
  const totalAlumnosDia = DIAS.map((_, di) => {
    const cursoIds = [...new Set(slotsFiltrados.filter((s:any) => s.dia_semana === di).map((s:any) => s.curso_id))]
    return cursoIds.reduce((sum, id) => sum + (alumnosPorCurso[id] || 0), 0)
  })

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',gap:'8px',flexWrap:'wrap'}}>
        <div style={{display:'flex',gap:'4px',background:'var(--surface2,#f0eee8)',padding:'3px',borderRadius:'10px'}}>
          {!esProfesora && <Tab active={vista==='semana'} onClick={() => setVista('semana')}>Semana</Tab>}
          {!esProfesora && <Tab active={vista==='prof'} onClick={() => setVista('prof')}>Por docente</Tab>}
          {esProfesora && <Tab active={true} onClick={() => {}}>Mi horario</Tab>}
        </div>
        {/* Resumen rápido de ocupación */}
        {!esProfesora && vista === 'semana' && (
          <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>
            {slots.length} clases · {Object.values(alumnosPorCurso).reduce((a,b)=>a+b,0)} inscriptos totales
          </div>
        )}
      </div>

      {vista === 'semana' && !esProfesora && (
        <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'14px',alignItems:'center'}}>
          <span style={{fontSize:'11.5px',color:'var(--text3)',fontWeight:500}}>Filtrar:</span>
          {profesoras.map((p:any) => (
            <button key={p.id} onClick={() => setFiltroProf(filtroProf===p.id?null:p.id)}
              style={{display:'flex',alignItems:'center',gap:'5px',padding:'4px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:500,cursor:'pointer',border:'1.5px solid',
                borderColor:filtroProf===p.id?p.color:'var(--border)',
                background:filtroProf===p.id?p.color:'var(--white)',
                color:filtroProf===p.id?'#fff':'var(--text2)',
                opacity:filtroProf&&filtroProf!==p.id?0.4:1}}>
              <div style={{width:7,height:7,borderRadius:'50%',background:filtroProf===p.id?'#fff':p.color}} />
              {p.nombre.split(' ')[0]}
            </button>
          ))}
          {filtroProf && <button onClick={() => setFiltroProf(null)} style={{padding:'4px 10px',borderRadius:'20px',fontSize:'12px',border:'1px solid var(--border)',background:'var(--white)',cursor:'pointer',color:'var(--text3)'}}>✕ Limpiar</button>}
        </div>
      )}

      {/* Chips de resumen por día */}
      {(vista === 'semana' || esProfesora) && !filtroProf && (
        <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'6px',marginBottom:'12px'}}>
          {DIAS_S.map((d, di) => (
            <div key={d} style={{textAlign:'center',padding:'6px 4px',background:totalesPorDia[di]>0?'var(--vl)':'var(--bg)',borderRadius:'10px',border:`1px solid ${totalesPorDia[di]>0?'#d4a8e8':'var(--border)'}`}}>
              <div style={{fontSize:'10px',fontWeight:700,color:totalesPorDia[di]>0?'var(--v)':'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em'}}>{d}</div>
              {totalesPorDia[di] > 0 ? (
                <>
                  <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)',lineHeight:1.2,marginTop:'2px'}}>{totalesPorDia[di]}</div>
                  <div style={{fontSize:'9px',color:'var(--text3)',marginTop:'1px'}}>{totalAlumnosDia[di]} al.</div>
                </>
              ) : (
                <div style={{fontSize:'10px',color:'var(--text3)',marginTop:'4px',fontStyle:'italic'}}>libre</div>
              )}
            </div>
          ))}
        </div>
      )}

      {(vista === 'semana' || esProfesora) && (
        <div style={{overflowX:'auto',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px'}}>
          <div style={{minWidth:'480px'}}>
            <div style={{display:'grid',gridTemplateColumns:'54px repeat(6,1fr)',borderBottom:'1.5px solid var(--border)'}}>
              <div/>
              {DIAS_S.map(d => (
                <div key={d} style={{padding:'10px 4px',textAlign:'center',fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em'}}>{d}</div>
              ))}
            </div>
            {turnos.length === 0 && (
              <div style={{padding:'32px',textAlign:'center',color:'var(--text3)',fontSize:'13px'}}>
                {esProfesora ? 'No tenés clases asignadas aún' : 'No hay cursos con horario asignado'}
              </div>
            )}
            {(esProfesora ? turnos : todosLosTurnos).map((turno:string) => (
              <div key={turno} style={{display:'grid',gridTemplateColumns:'54px repeat(6,1fr)',borderBottom:'1px solid var(--border)'}}>
                <div style={{fontSize:'10px',color:'var(--text3)',padding:'6px 4px',textAlign:'right',display:'flex',alignItems:'center',justifyContent:'flex-end',fontWeight:500}}>
                  {turno?.slice(0,5)}
                </div>
                {[0,1,2,3,4,5].map(dia => {
                  const items = slotsFiltrados.filter((s:any) => s.dia_semana===dia && s.hora_inicio===turno)
                  const hayAlgo = slots.some((s:any) => s.dia_semana===dia && s.hora_inicio===turno)
                  return (
                    <div key={dia} style={{borderLeft:'1px solid var(--border)',padding:'3px',minHeight:'58px',background:!hayAlgo&&!esProfesora?'var(--bg)':'transparent'}}>
                      {items.map((s:any) => {
                        const prof = profesoras.find((x:any) => x.id===s.profesora_id)
                        const col = prof?.color ?? NIVEL_COL[s.nivel] ?? '#888'
                        const cantAlumnos = alumnosPorCurso[s.curso_id] || 0
                        return (
                          <div key={s.id} style={{borderRadius:'8px',padding:'4px 6px',background:hexRgb(col,.13),borderLeft:`3px solid ${col}`,height:'100%',display:'flex',flexDirection:'column',gap:'1px'}}>
                            <div style={{fontSize:'10px',fontWeight:700,color:col,lineHeight:1.2}}>{s.curso_nombre}</div>
                            {!esProfesora && <div style={{fontSize:'9px',color:col,opacity:.7}}>{prof?.nombre.split(' ')[0]||'—'}</div>}
                            <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginTop:'auto'}}>
                              <div style={{fontSize:'8.5px',color:col,opacity:.55}}>{s.hora_fin?.slice(0,5)}</div>
                              {cantAlumnos > 0 && (
                                <div style={{fontSize:'9px',fontWeight:700,color:col,background:hexRgb(col,.2),borderRadius:'6px',padding:'0 4px',lineHeight:'14px'}}>
                                  {cantAlumnos}
                                </div>
                              )}
                            </div>
                          </div>
                        )
                      })}
                      {items.length === 0 && !esProfesora && (
                        <div style={{height:'100%',display:'flex',alignItems:'center',justifyContent:'center',opacity:.25}}>
                          <div style={{width:'8px',height:'1px',background:'var(--text3)'}}/>
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            ))}
          </div>
        </div>
      )}

      {vista === 'prof' && !esProfesora && (
        <div>
          {profesoras.map((p:any) => {
            const mis = slots.filter((s:any) => s.profesora_id===p.id)
            if (mis.length === 0) return null
            const cursosUnicos = [...new Set(mis.map((s:any) => s.curso_nombre))]
            const totalAlumnos = [...new Set(mis.map((s:any) => s.curso_id))].reduce((sum, id) => sum + (alumnosPorCurso[id] || 0), 0)
            const hsPorCurso = cursos
              .filter((c:any) => c.profesora_id === p.id)
              .reduce((sum:number, c:any) => {
                try {
                  const [ah,am] = (c.hora_inicio||'').split(':').map(Number)
                  const [bh,bm] = (c.hora_fin||'').split(':').map(Number)
                  const diasCount = parseDias(c.dias||'').length
                  return sum + ((bh*60+bm - ah*60-am)/60) * diasCount
                } catch { return sum }
              }, 0)
            return (
              <div key={p.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'12px',overflow:'hidden'}}>
                <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',display:'flex',alignItems:'center',gap:'10px'}}>
                  <Av color={p.color} size={36}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
                  <div style={{flex:1}}>
                    <div style={{fontWeight:700,fontSize:'14px'}}>{p.nombre} {p.apellido}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)'}}>{Math.round(hsPorCurso*10)/10}hs/sem · {cursosUnicos.length} cursos</div>
                  </div>
                  {totalAlumnos > 0 && (
                    <div style={{textAlign:'center',padding:'4px 12px',background:'var(--vl)',borderRadius:'10px'}}>
                      <div style={{fontSize:'16px',fontWeight:700,color:'var(--v)'}}>{totalAlumnos}</div>
                      <div style={{fontSize:'9px',color:'var(--text3)'}}>alumnos</div>
                    </div>
                  )}
                </div>
                <div style={{display:'grid',gridTemplateColumns:'repeat(6,1fr)',gap:'6px',padding:'12px 16px'}}>
                  {DIAS_S.map((d:string,di:number) => {
                    const del = mis.filter((s:any) => s.dia_semana===di)
                    return (
                      <div key={d}>
                        <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textAlign:'center',marginBottom:'4px',textTransform:'uppercase'}}>{d}</div>
                        {del.length===0
                          ? <div style={{fontSize:'10px',color:'var(--text3)',textAlign:'center',padding:'6px 0',fontStyle:'italic'}}>Libre</div>
                          : del.map((s:any) => (
                            <div key={s.id} style={{borderRadius:'8px',padding:'5px 6px',marginBottom:'3px',background:hexRgb(p.color,.1),borderLeft:`3px solid ${p.color}`}}>
                              <div style={{fontSize:'10px',fontWeight:700,color:p.color,lineHeight:1.2}}>{s.curso_nombre}</div>
                              <div style={{display:'flex',justifyContent:'space-between',alignItems:'center',marginTop:'2px'}}>
                                <div style={{fontSize:'9px',color:p.color,opacity:.7}}>{s.hora_inicio?.slice(0,5)}</div>
                                {alumnosPorCurso[s.curso_id] > 0 && (
                                  <div style={{fontSize:'9px',fontWeight:700,color:p.color,opacity:.8}}>{alumnosPorCurso[s.curso_id]}al</div>
                                )}
                              </div>
                            </div>
                          ))
                        }
                      </div>
                    )
                  })}
                </div>
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

const Tab = ({children,active,onClick}:any) => <button onClick={onClick} style={{padding:'6px 14px',borderRadius:'8px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'none',background:active?'var(--white)':'transparent',color:active?'var(--text)':'var(--text2)',boxShadow:active?'0 1px 3px rgba(0,0,0,.08)':'none'}}>{children}</button>
const Av = ({color,size,children}:any) => <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:Math.max(10,size*.28)+'px',fontWeight:700,color:'#fff',flexShrink:0}}>{children}</div>
