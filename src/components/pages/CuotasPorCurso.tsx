'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useCursos, useAlumnos } from '@/lib/hooks'

const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

export default function CuotasPorCurso() {
  const { cursos }  = useCursos()
  const { alumnos } = useAlumnos()
  const [selCursoId, setSelCursoId] = useState<string>('')
  const [alumnosCurso, setAlumnosCurso] = useState<any[]>([])
  const [loadingAlumnos, setLoadingAlumnos] = useState(false)
  const [nuevaCuota, setNuevaCuota] = useState('')
  const [aplicando, setAplicando] = useState(false)
  const [resultado, setResultado] = useState<{ ok: number; err: number } | null>(null)
  const [seleccionados, setSeleccionados] = useState<Set<string>>(new Set())
  const [modoAplicar, setModoAplicar] = useState<'todos'|'seleccion'>('todos')

  // Cargar alumnos del curso seleccionado
  useEffect(() => {
    if (!selCursoId) { setAlumnosCurso([]); return }
    const cargar = async () => {
      setLoadingAlumnos(true)
      const sb = createClient()
      const { data } = await sb
        .from('cursos_alumnos')
        .select('alumnos(id, nombre, apellido, cuota_mensual, color)')
        .eq('curso_id', selCursoId)
      const lista = (data || []).map((r: any) => r.alumnos).filter(Boolean)
      setAlumnosCurso(lista)
      setLoadingAlumnos(false)
      setResultado(null)
      setNuevaCuota('')
      setSeleccionados(new Set())
      setModoAplicar('todos')
    }
    cargar()
  }, [selCursoId])

  const cursoSel = cursos.find(c => c.id === selCursoId)

  // Cuota promedio y distribución del curso
  const cuotas = alumnosCurso.map(a => a.cuota_mensual || 0).filter(v => v > 0)
  const cuotaPromedio = cuotas.length > 0 ? Math.round(cuotas.reduce((s, v) => s + v, 0) / cuotas.length) : 0
  const cuotaMin = cuotas.length > 0 ? Math.min(...cuotas) : 0
  const cuotaMax = cuotas.length > 0 ? Math.max(...cuotas) : 0
  const hayDiferentes = cuotaMin !== cuotaMax && cuotas.length > 1

  // Aplicar cuota masiva a todos los alumnos del curso
  const aplicarCuota = async () => {
    const cuota = parseFloat(nuevaCuota)
    if (isNaN(cuota) || cuota <= 0) return alert('Ingresá un monto válido mayor a 0')
    const destino = modoAplicar === 'seleccion' && seleccionados.size > 0
      ? alumnosCurso.filter(a => seleccionados.has(a.id))
      : alumnosCurso
    if (destino.length === 0) return alert('Seleccioná al menos un alumno')
    if (!window.confirm(`¿Aplicar $${cuota.toLocaleString('es-AR')} a ${destino.length} alumno${destino.length!==1?'s':''}?`)) return

    setAplicando(true)
    const sb = createClient()
    let ok = 0, err = 0

    for (const al of destino) {
      try {
        // Guardar en historial
        await sb.from('cuotas_historial').insert({
          alumno_id:      al.id,
          cuota_anterior: al.cuota_mensual || 0,
          cuota_nueva:    cuota,
          vigente_desde:  new Date().toISOString().split('T')[0],
        })
        // Actualizar cuota del alumno
        const { error } = await sb.from('alumnos').update({ cuota_mensual: cuota }).eq('id', al.id)
        if (error) err++
        else ok++
      } catch { err++ }
    }

    // Actualizar estado local
    const idsActualizados = new Set(destino.map((a:any) => a.id))
    setAlumnosCurso(prev => prev.map(a => idsActualizados.has(a.id) ? { ...a, cuota_mensual: cuota } : a))
    setResultado({ ok, err })
    setAplicando(false)
    if (ok > 0) setNuevaCuota('')
  }

  // Aplicar cuota individual
  const aplicarIndividual = async (alumnoId: string, cuotaActual: number, cuotaNueva: number) => {
    if (isNaN(cuotaNueva) || cuotaNueva <= 0) return
    if (cuotaNueva === cuotaActual) return
    const sb = createClient()
    await sb.from('cuotas_historial').insert({
      alumno_id: alumnoId, cuota_anterior: cuotaActual,
      cuota_nueva: cuotaNueva, vigente_desde: new Date().toISOString().split('T')[0],
    })
    await sb.from('alumnos').update({ cuota_mensual: cuotaNueva }).eq('id', alumnoId)
    setAlumnosCurso(prev => prev.map(a => a.id === alumnoId ? { ...a, cuota_mensual: cuotaNueva } : a))
  }

  return (
    <div className="fade-in">
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'20px',fontWeight:700}}>Cuotas por curso</div>
        <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>
          Actualizá las cuotas de todos los alumnos de un curso en un solo paso
        </div>
      </div>

      {/* Selector de curso */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'6px'}}>
          Seleccioná un curso
        </div>
        <select style={IS} value={selCursoId} onChange={e => setSelCursoId(e.target.value)}>
          <option value="">— Elegí un curso —</option>
          {[...cursos].sort((a, b) => a.nombre.localeCompare(b.nombre)).map(c => (
            <option key={c.id} value={c.id}>
              {c.nombre} — {c.nivel} {c.dias ? `· ${c.dias}` : ''}
            </option>
          ))}
        </select>
      </div>

      {selCursoId && (
        <>
          {loadingAlumnos ? (
            <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>Cargando alumnos...</div>
          ) : alumnosCurso.length === 0 ? (
            <div style={{textAlign:'center',padding:'48px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',color:'var(--text3)'}}>
              <div style={{fontSize:'24px',marginBottom:'8px'}}>👤</div>
              <div style={{fontWeight:600}}>Este curso no tiene alumnos asignados</div>
            </div>
          ) : (
            <>
              {/* Resumen del curso */}
              <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'8px',marginBottom:'14px'}}>
                {[
                  { label:'Alumnos',        val: alumnosCurso.length, color:'var(--v)'     },
                  { label:'Cuota promedio', val: `$${cuotaPromedio.toLocaleString('es-AR')}`, color:'var(--v)' },
                  { label:'Rango',          val: hayDiferentes ? `$${cuotaMin.toLocaleString('es-AR')} – $${cuotaMax.toLocaleString('es-AR')}` : 'Uniforme', color: hayDiferentes ? 'var(--amber)' : 'var(--green)' },
                ].map(k => (
                  <div key={k.label} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                    <div style={{fontSize:'16px',fontWeight:800,color:k.color}}>{k.val}</div>
                    <div style={{fontSize:'10px',color:'var(--text3)',fontWeight:600,marginTop:'2px'}}>{k.label}</div>
                  </div>
                ))}
              </div>

              {/* Actualización masiva */}
              <div style={{background:'var(--vl)',border:'1.5px solid var(--v)',borderRadius:'14px',padding:'16px',marginBottom:'14px'}}>
                <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px',flexWrap:'wrap',gap:'8px'}}>
                  <div style={{fontSize:'13px',fontWeight:700,color:'var(--v)'}}>Actualizar cuota</div>
                  <div style={{display:'flex',gap:'4px'}}>
                    {(['todos','seleccion'] as const).map(m => (
                      <button key={m} onClick={() => setModoAplicar(m)}
                        style={{padding:'5px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1.5px solid',
                          borderColor: modoAplicar===m ? 'var(--v)' : 'var(--border)',
                          background: modoAplicar===m ? 'var(--v)' : 'var(--white)',
                          color: modoAplicar===m ? '#fff' : 'var(--text2)'}}>
                        {m === 'todos' ? `Todos (${alumnosCurso.length})` : `Selección (${seleccionados.size})`}
                      </button>
                    ))}
                  </div>
                </div>
                <div style={{display:'flex',gap:'8px',alignItems:'flex-start',flexWrap:'wrap'}}>
                  <div style={{flex:1,minWidth:'140px'}}>
                    <input
                      type="number"
                      min="0"
                      step="500"
                      value={nuevaCuota}
                      onChange={e => setNuevaCuota(e.target.value)}
                      placeholder={`Cuota actual: $${cuotaPromedio.toLocaleString('es-AR')}`}
                      style={IS}
                    />
                  </div>
                  <button
                    onClick={aplicarCuota}
                    disabled={aplicando || !nuevaCuota}
                    style={{
                      padding:'10px 20px',
                      background: aplicando || !nuevaCuota ? '#aaa' : 'var(--v)',
                      color:'#fff', border:'none', borderRadius:'10px',
                      fontSize:'14px', fontWeight:600,
                      cursor: aplicando || !nuevaCuota ? 'not-allowed' : 'pointer',
                      whiteSpace:'nowrap',
                    }}
                  >
                    {aplicando ? 'Aplicando...' : modoAplicar === 'seleccion' && seleccionados.size > 0 ? `Aplicar a ${seleccionados.size} seleccionados` : `Aplicar a ${alumnosCurso.length} alumnos`}
                  </button>
                </div>
                <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'8px'}}>
                  ⚠ Actualiza la cuota de todos los alumnos del curso y registra el cambio en el historial.
                </div>

                {resultado && (
                  <div style={{
                    marginTop:'10px', padding:'10px 14px', borderRadius:'8px', fontSize:'13px', fontWeight:500,
                    background: resultado.err === 0 ? 'var(--greenl)' : 'var(--amberl)',
                    color:      resultado.err === 0 ? 'var(--green)'  : 'var(--amber)',
                  }}>
                    {resultado.err === 0
                      ? `✓ Cuota actualizada en ${resultado.ok} alumno${resultado.ok !== 1 ? 's' : ''}`
                      : `${resultado.ok} actualizados, ${resultado.err} con error`}
                  </div>
                )}
              </div>

              {/* Lista individual editable */}
              <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',overflow:'hidden'}}>
                <div style={{display:'grid',gridTemplateColumns:'36px 1fr 140px',background:'var(--bg)',borderBottom:'1.5px solid var(--border)',padding:'10px 16px',alignItems:'center'}}>
                  <input type="checkbox"
                    checked={seleccionados.size === alumnosCurso.length && alumnosCurso.length > 0}
                    onChange={e => setSeleccionados(e.target.checked ? new Set(alumnosCurso.map((a:any)=>a.id)) : new Set())}
                    style={{width:16,height:16,cursor:'pointer'}}
                  />
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase'}}>Alumno</div>
                  <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',textAlign:'center'}}>Cuota mensual</div>
                </div>
                {alumnosCurso.map((a: any) => (
                  <div key={a.id} style={{display:'grid',gridTemplateColumns:'36px 1fr 140px',padding:'10px 16px',borderBottom:'1px solid var(--border)',alignItems:'center',background:seleccionados.has(a.id)?'var(--vl)':'transparent'}}>
                    <input type="checkbox"
                      checked={seleccionados.has(a.id)}
                      onChange={e => setSeleccionados(prev => { const n = new Set(prev); e.target.checked ? n.add(a.id) : n.delete(a.id); return n })}
                      style={{width:16,height:16,cursor:'pointer'}}
                    />
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:32,height:32,borderRadius:'10px',background:a.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                        {a.nombre?.[0]}{a.apellido?.[0]}
                      </div>
                      <div>
                        <div style={{fontSize:'14px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                      </div>
                    </div>
                    <div style={{textAlign:'center'}}>
                      <input
                        type="number"
                        min="0"
                        step="500"
                        defaultValue={a.cuota_mensual || 0}
                        onBlur={e => {
                          const val = parseFloat(e.target.value) || 0
                          aplicarIndividual(a.id, a.cuota_mensual || 0, val)
                        }}
                        style={{
                          width:'120px', padding:'7px 10px',
                          border:'1.5px solid var(--border)', borderRadius:'8px',
                          fontSize:'14px', fontWeight:600, textAlign:'center',
                          fontFamily:'Inter,sans-serif', outline:'none',
                          color:'var(--text)', background:'var(--white)',
                        }}
                      />
                    </div>
                  </div>
                ))}
              </div>
              <div style={{fontSize:'11px',color:'var(--text3)',textAlign:'center',marginTop:'8px'}}>
                Los cambios individuales se guardan automáticamente al salir del campo
              </div>
            </>
          )}
        </>
      )}

      {!selCursoId && (
        <div style={{textAlign:'center',padding:'48px 24px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',color:'var(--text3)'}}>
          <div style={{fontSize:'32px',marginBottom:'8px'}}>💰</div>
          <div style={{fontWeight:600,marginBottom:'4px'}}>Seleccioná un curso para empezar</div>
          <div style={{fontSize:'13px'}}>
            Podés actualizar las cuotas de todos los alumnos de un curso de forma masiva,
            o editarlas individualmente.
          </div>
        </div>
      )}
    </div>
  )
}
