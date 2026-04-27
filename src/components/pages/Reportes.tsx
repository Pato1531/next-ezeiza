'use client'
import React from 'react'
import { useState, useEffect, useRef } from 'react'
import { useAlumnos, useProfesoras, useCursos, useLiquidaciones } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'

export default function Reportes() {
  const { usuario } = useAuth()
  const esSecretaria = usuario?.rol === 'secretaria'
  const esCoordinadora = usuario?.rol === 'coordinadora'
  const esDirector = usuario?.rol === 'director'
  const { profesoras } = useProfesoras()
  const { liquidaciones: todasLiqs } = useLiquidaciones()
  const mesActualNombre = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre'][new Date().getMonth()]
  const anioActual = new Date().getFullYear()
  // Liquidaciones confirmadas del mes actual por profesora
  const liqConfirmadas: Record<string,number> = {}
  todasLiqs.filter(l => l.mes === mesActualNombre && l.anio === anioActual).forEach(l => {
    liqConfirmadas[l.profesora_id] = l.total
  })
  const { alumnos } = useAlumnos()
  const { cursos } = useCursos()

  const [ausentes, setAusentes] = useState<any[]>([])
  const [alertas2Cons, setAlertas2Cons] = useState<any[]>([])
  const [alertaEstados, setAlertaEstados] = useState<Record<string,{enviado:boolean,obs:string}>>({})
  const alertaGuardRef = useRef<ReturnType<typeof setTimeout>|null>(null)

  // Cargar estados desde Supabase al montar
  useEffect(() => {
    createClient().from('alertas_ausencias').select('alumno_id,enviado,obs')
      .then(({ data }) => {
        if (data?.length) {
          const m: Record<string,{enviado:boolean,obs:string}> = {}
          data.forEach((r:any) => { m[r.alumno_id] = { enviado: r.enviado||false, obs: r.obs||'' } })
          setAlertaEstados(m)
        }
      }).catch(() => {})
  }, [])

  const setAlertaEstado = (alumnoId: string, campo: 'enviado'|'obs', valor: any) => {
    setAlertaEstados(prev => {
      const next = { ...prev, [alumnoId]: { enviado: prev[alumnoId]?.enviado||false, obs: prev[alumnoId]?.obs||'', [campo]: valor } }
      // Guardar en Supabase con debounce de 800ms
      if (alertaGuardRef.current) clearTimeout(alertaGuardRef.current)
      alertaGuardRef.current = setTimeout(() => {
        const estado = next[alumnoId]
        createClient().from('alertas_ausencias').upsert(
          { alumno_id: alumnoId, enviado: estado.enviado, obs: estado.obs },
          { onConflict: 'alumno_id' }
        ).then().catch(() => {})
      }, 800)
      return next
    })
  }
  const [alumnosConPago, setAlumnosConPago] = useState<Set<string>>(new Set())
  // Asistencia docente dinámica: { profesoraId: porcentaje }
  const [asistenciaProfs, setAsistenciaProfs] = useState<Record<string,number>>({})
  const [avgAsist, setAvgAsist] = useState(0)
  // Ingresos desglosados: cuotas vs matrículas del mes actual
  const [ingresosDetalle, setIngresosDetalle] = useState<{cuotas:number, matriculas:number, totalPagos: any[]}>({cuotas:0, matriculas:0, totalPagos:[]})
  // Altas y bajas del mes
  const [altasDelMes, setAltasDelMes] = useState<any[]>([])
  const [bajasDelMes, setBajasDelMes] = useState<any[]>([])
  const [loadingMovimientos, setLoadingMovimientos] = useState(false)

  // Cargar pagos del mes actual para cobranza
  useEffect(() => {
    if (!alumnos.length) return
    const sb = createClient()
    sb.from('pagos_alumnos').select('alumno_id')
      .eq('mes', mesActualNombre).eq('anio', anioActual)
      .then(({ data }) => setAlumnosConPago(new Set((data||[]).map((r:any) => r.alumno_id))))
      .catch(() => {})
  }, [alumnos.length, mesActualNombre, anioActual])

  // Cargar desglose de ingresos del mes (cuotas vs matrículas)
  useEffect(() => {
    const cargarIngresos = async () => {
      try {
        const sb = createClient()
        const { data } = await sb.from('pagos_alumnos')
          .select('monto, observaciones, alumnos(nombre, apellido, nivel)')
          .eq('mes', mesActualNombre).eq('anio', anioActual)
        const pagos = data || []
        const matriculas = pagos.filter((p:any) => p.observaciones === 'Matrícula de inscripción')
        const cuotas = pagos.filter((p:any) => p.observaciones !== 'Matrícula de inscripción')
        setIngresosDetalle({
          cuotas: cuotas.reduce((s:number, p:any) => s + (p.monto||0), 0),
          matriculas: matriculas.reduce((s:number, p:any) => s + (p.monto||0), 0),
          totalPagos: pagos
        })
      } catch {}
    }
    cargarIngresos()
  }, [mesActualNombre, anioActual, usuario?.instituto_id])

  // Cargar altas y bajas del mes para el reporte de movimientos
  useEffect(() => {
    const cargarMovimientos = async () => {
      setLoadingMovimientos(true)
      try {
        const sb = createClient()
        const inicioMes = `${anioActual}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`
        const finMes = new Date(anioActual, new Date().getMonth()+1, 0).toISOString().split('T')[0]
        const institutoId = usuario?.instituto_id
        const [altasRes, bajasRes] = await Promise.all([
          (institutoId
            ? sb.from('alumnos').select('nombre, apellido, nivel, cuota_mensual, fecha_alta, color')
                .gte('fecha_alta', inicioMes).lte('fecha_alta', finMes).eq('activo', true)
                .eq('instituto_id', institutoId).order('fecha_alta', { ascending: false })
            : sb.from('alumnos').select('nombre, apellido, nivel, cuota_mensual, fecha_alta, color')
                .gte('fecha_alta', inicioMes).lte('fecha_alta', finMes).eq('activo', true)
                .order('fecha_alta', { ascending: false })
          ),
          sb.from('bajas_alumnos').select('alumno_nombre, alumno_apellido, nivel, cuota_mensual, fecha_baja, motivo')
            .gte('fecha_baja', inicioMes).lte('fecha_baja', finMes)
            .order('fecha_baja', { ascending: false })
        ])
        setAltasDelMes(altasRes.data || [])
        setBajasDelMes(bajasRes.data || [])
      } catch {}
      setLoadingMovimientos(false)
    }
    cargarMovimientos()
  }, [mesActualNombre, anioActual, usuario?.instituto_id])

  // Refrescar cuando se registra un pago desde Alumnos
  useEffect(() => {
    const handler = (e: Event) => {
      const detail = (e as CustomEvent).detail
      if (detail?.alumno_id) setAlumnosConPago(prev => new Set([...prev, detail.alumno_id]))
    }
    window.addEventListener('pago-registrado', handler)
    return () => window.removeEventListener('pago-registrado', handler)
  }, [])
  const [loadingAusentes, setLoadingAusentes] = useState(true)

  useEffect(() => { cargarAusentes() }, [])

  const cargarAusentes = async () => {
    setLoadingAusentes(true)
    const sb = createClient()
    try {
    // Traer últimas 2 clases por curso junto con asistencia
    const { data, error } = await sb
      .from('asistencia_clases')
      .select('alumno_id, estado, alumnos(nombre, apellido, color, activo), clases(fecha, curso_id, cursos(nombre))')
      .limit(1000)
    if (!data || error) { setLoadingAusentes(false); return }

    // Filtrar alumnos dados de baja
    const dataActivos = data.filter((a:any) => a.alumnos?.activo !== false)

    // Agrupar por alumno+curso: obtener las últimas 2 clases
    const porAlumnoCurso: Record<string,any[]> = {}
    dataActivos.forEach((a:any) => {
      const key = `${a.alumno_id}_${a.clases?.curso_id}`
      if (!porAlumnoCurso[key]) porAlumnoCurso[key] = []
      porAlumnoCurso[key].push(a)
    })

    // Para cada alumno+curso, ordenar por fecha y evaluar las últimas 2
    const porAlumno: Record<string,any> = {}
    Object.values(porAlumnoCurso).forEach((registros: any[]) => {
      const sorted = registros.sort((a,b) => (b.clases?.fecha||'').localeCompare(a.clases?.fecha||''))
      const ultima = sorted[0]
      const anteultima = sorted[1]
      const alumnoId = ultima.alumno_id
      const alumnoNombre = ultima.alumnos?.nombre
      const alumnoApellido = ultima.alumnos?.apellido
      const color = ultima.alumnos?.color || '#652f8d'
      const cursoNombre = ultima.clases?.cursos?.nombre || '—'
      const cursoId = ultima.clases?.curso_id

      // Si la ÚLTIMA clase el alumno asistió, no mostrar (eliminarlo del reporte)
      if (ultima.estado === 'P' || ultima.estado === 'T') return

      // Si la última fue ausente, mostrarlo
      if (ultima.estado === 'A') {
        if (!porAlumno[alumnoId]) porAlumno[alumnoId] = {
          alumno_id: alumnoId, nombre: alumnoNombre, apellido: alumnoApellido, color, ausencias: []
        }
        porAlumno[alumnoId].ausencias.push({ fecha: ultima.clases?.fecha, curso: cursoNombre, curso_id: cursoId })

        // Si la anteúltima también fue ausente, agregar segunda falta
        if (anteultima && anteultima.estado === 'A') {
          porAlumno[alumnoId].ausencias.push({ fecha: anteultima.clases?.fecha, curso: cursoNombre, curso_id: cursoId })
        }
      }
    })
    const alertas: any[] = []
    Object.values(porAlumno).forEach((al:any) => {
      const porCurso: Record<string,any[]> = {}
      al.ausencias.forEach((a:any) => { if(!porCurso[a.curso_id])porCurso[a.curso_id]=[]; porCurso[a.curso_id].push(a) })
      Object.entries(porCurso).forEach(([, aus]) => {
        const sorted = [...(aus as any[])].sort((a,b)=>a.fecha?.localeCompare(b.fecha))
        if (sorted.length >= 2) {
          alertas.push({ alumno_id:al.alumno_id, nombre:al.nombre, apellido:al.apellido, color:al.color, curso:sorted[0].curso, fechas:sorted.slice(-2).map((u:any)=>u.fecha), total:sorted.length })
        }
      })
    })
    setAusentes(Object.values(porAlumno))
    setAlertas2Cons(alertas)
    } catch { } finally { setLoadingAusentes(false) }
  }

  const exportAusentesPDF = () => {
    const _rhtml = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Ausentes</title>
    <style>body{font-family:sans-serif;padding:24px;font-size:13px}h1{color:#652f8d;font-size:18px}
    .logo{font-size:18px;font-weight:700}.logo span{color:#652f8d}
    .hd{display:flex;justify-content:space-between;border-bottom:2px solid #652f8d;padding-bottom:12px;margin-bottom:18px}
    table{width:100%;border-collapse:collapse}th{border-bottom:2px solid #652f8d;padding:8px;text-align:left;font-size:10px;text-transform:uppercase;color:#652f8d;letter-spacing:.05em}
    td{padding:9px 8px;border-bottom:1px solid #f0edf5}.alerta{background:#fdeaea;color:#c0392b;padding:2px 8px;border-radius:10px;font-size:11px;font-weight:600}
    .warn{background:#fdeaea;border:1px solid #f5c5c5;border-radius:8px;padding:10px 14px;margin-bottom:14px;color:#c0392b}
    </style></head><body>
    <div class="hd"><div class="logo"><span>Next</span> Ezeiza</div><div style="font-size:12px;color:#9b8eaa">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div></div>
    <h1>Reporte de Ausencias</h1>
    ${alertas2Cons.length>0?`<div class="warn">⚠ <strong>${alertas2Cons.length} alumno${alertas2Cons.length!==1?'s':''}</strong> con 2 o más ausencias consecutivas</div>`:''}
    <table><tr><th>Alumno</th><th>Total ausencias</th><th>Alerta</th></tr>
    ${ausentes.filter(a=>a.ausencias.length>0).sort((a,b)=>b.ausencias.length-a.ausencias.length).map(a=>{
      const alerta=alertas2Cons.find(al=>al.alumno_id===a.alumno_id)
      return `<tr><td>${a.nombre} ${a.apellido}</td><td>${a.ausencias.length}</td><td>${alerta?'<span class="alerta">⚠ 2+ consecutivas</span>':'—'}</td></tr>`
    }).join('')}
    </table><script>window.onload=()=>window.print()<\/script></body></html>`
    const _rb = new Blob([_rhtml], {type:'text/html;charset=utf-8'})
    const _ru = URL.createObjectURL(_rb)
    const _rw = window.open(_ru, '_blank')
    if (!_rw) { const _a = document.createElement('a'); _a.href=_ru; _a.download='reporte.html'; _a.click() }
    setTimeout(() => URL.revokeObjectURL(_ru), 10000)
  }

  // totalLiq dinámico: usa liquidación confirmada si existe, sino cálculo base
  const totalLiq = profesoras.reduce((s, p) => {
    const conf = liqConfirmadas[p.id]
    return s + (conf !== undefined ? conf : (p.horas_semana||0) * 4 * (p.tarifa_hora||0))
  }, 0)

  // Calcular asistencia docente dinámicamente desde clases y asistencia_clases
  useEffect(() => {
    if (!profesoras.length) return
    const cargarAsistencia = async () => {
      const sb = createClient()
      // Traer todas las clases con su profesora
      const { data: clases } = await sb.from('clases')
        .select('id, curso_id, cursos(profesora_id)')
        .limit(2000)
      if (!clases?.length) return

      // Traer asistencia de esas clases
      const claseIds = clases.map((c:any) => c.id)
      const { data: asist } = await sb.from('asistencia_clases')
        .select('clase_id, estado')
        .in('clase_id', claseIds)

      // Agrupar por profesora_id → contar clases y alumnos presentes/total
      const porProf: Record<string,{presentes:number,total:number}> = {}
      clases.forEach((cl:any) => {
        const profId = cl.cursos?.profesora_id
        if (!profId) return
        if (!porProf[profId]) porProf[profId] = { presentes:0, total:0 }
        const asistClase = (asist||[]).filter((a:any) => a.clase_id === cl.id)
        asistClase.forEach((a:any) => {
          porProf[profId].total++
          if (a.estado === 'P') porProf[profId].presentes++
        })
      })

      // Calcular % por profesora
      const pcts: Record<string,number> = {}
      profesoras.forEach((p:any) => {
        const d = porProf[p.id]
        if (d && d.total > 0) {
          pcts[p.id] = Math.round((d.presentes / d.total) * 100)
        } else {
          pcts[p.id] = 0 // sin datos
        }
      })
      setAsistenciaProfs(pcts)

      // Promedio general (solo profes con datos)
      const vals = Object.values(pcts).filter(v => v > 0)
      const avg = vals.length ? Math.round(vals.reduce((s,v) => s+v,0) / vals.length) : 0
      setAvgAsist(avg)
    }
    cargarAsistencia()
  }, [profesoras.length])

  // ── EXPORTADORES INDIVIDUALES ──

  const exportAsistenciaCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE DE ASISTENCIA DOCENTE'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [''],
      ['Profesora','Nivel','Hs/semana','Ene','Feb','Mar','Abr','May','Jun','Promedio'],
      ...profesoras.map(p => [
        `${p.nombre} ${p.apellido}`, p.nivel, p.horas_semana,
        95,96,94,95,93,95, '95%'
      ])
    ]
    descargarCSV(rows, 'asistencia_docente')
  }

  const exportAsistenciaPDF = () => {
    const html = `<h1>Asistencia Docente</h1>
    <table><tr><th>Profesora</th><th>Nivel</th><th>Hs/sem</th><th>Promedio</th></tr>
    ${profesoras.map(p=>`<tr><td>${p.nombre} ${p.apellido}</td><td>${p.nivel}</td><td>${p.horas_semana}hs</td><td>95%</td></tr>`).join('')}
    </table>`
    abrirPDF('Asistencia Docente', html)
  }

  const diaHoy = new Date().getDate()
  const getEstadoCobranza = (alumnoId: string) => {
    if (alumnosConPago.has(alumnoId)) return { label: 'Pagado', color: '#2d7a4f' }
    if (diaHoy <= 10) return { label: 'Al día', color: '#b45309' }
    return { label: 'Deudor', color: '#c0392b' }
  }

  const exportCobranzaCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE DE COBRANZA'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [`Mes: ${mesActualNombre} ${anioActual}`],
      ['Pagado: pago registrado · Al día: sin pago del 1-10 · Deudor: sin pago del 11+'],
      [''],
      ['Alumno','Nivel','Cuota mensual','Estado'],
      ...alumnos.map(a => {
        const { label } = getEstadoCobranza(a.id)
        return [`${a.nombre} ${a.apellido}`, a.nivel, `$${a.cuota_mensual?.toLocaleString('es-AR')}`, label]
      })
    ]
    descargarCSV(rows, 'cobranza_alumnos')
  }

  const exportCobranzaPDF = () => {
    const html = `<h1>Cobranza por Alumno — ${mesActualNombre} ${anioActual}</h1>
    <p style="color:#888;font-size:12px">Pagado: pago registrado &bull; Al día: sin pago del 1-10 &bull; Deudor: sin pago del 11+</p>
    <table><tr><th>Alumno</th><th>Nivel</th><th>Cuota</th><th>Estado</th></tr>
    ${alumnos.map(a=>{const e=getEstadoCobranza(a.id);return`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')}</td><td style="color:${e.color};font-weight:600">${e.label}</td></tr>`}).join('')}
    </table>`
    abrirPDF('Cobranza por Alumno', html)
  }

  const exportLiquidacionCSV = () => {
    const totalReal = profesoras.reduce((s,p) => s + (liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)), 0)
    const rows = [
      ['NEXT EZEIZA — REPORTE DE LIQUIDACIÓN'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [`Mes: ${mesActualNombre} ${anioActual}`],
      [''],
      ['Profesora','Nivel','Hs/semana','Tarifa/hora','Total liquidación'],
      ...profesoras.map(p => {
        const liq = liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)
        const estado = liqConfirmadas[p.id] ? 'Confirmada' : 'Estimada'
        return [`${p.nombre} ${p.apellido}`, p.nivel, p.horas_semana, `$${p.tarifa_hora?.toLocaleString('es-AR')}`, `$${liq.toLocaleString('es-AR')} (${estado})`]
      }),
      [''],
      ['','','','TOTAL:', `$${totalReal.toLocaleString('es-AR')}`]
    ]
    descargarCSV(rows, 'liquidacion_docente')
  }

  const exportLiquidacionPDF = () => {
    const totalReal = profesoras.reduce((s,p) => s + (liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)), 0)
    const html = `<h1>Liquidación Docente — ${mesActualNombre} ${anioActual}</h1>
    <table><tr><th>Profesora</th><th>Hs/sem</th><th>Tarifa/h</th><th>Total</th><th>Estado</th></tr>
    ${profesoras.map(p=>{
      const liq = liqConfirmadas[p.id] ?? (p.horas_semana||0)*4*(p.tarifa_hora||0)
      const conf = !!liqConfirmadas[p.id]
      return `<tr><td>${p.nombre} ${p.apellido}</td><td>${p.horas_semana}hs</td><td>$${p.tarifa_hora?.toLocaleString('es-AR')}</td><td style="font-weight:600">$${liq.toLocaleString('es-AR')}</td><td style="color:${conf?'#2d7a4f':'#b45309'}">${conf?'Confirmada':'Estimada'}</td></tr>`
    }).join('')}
    <tr style="font-weight:bold;border-top:2px solid #652f8d"><td colspan="3">Total mensual</td><td>$${totalReal.toLocaleString('es-AR')}</td><td></td></tr>
    </table>`
    abrirPDF('Liquidación Docente', html)
  }

  const exportCursosCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE DE CURSOS'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [''],
      ['Curso','Nivel','Días','Horario','Alumnos'],
      ...cursos.map(c => [c.nombre, c.nivel, c.dias||'—', `${c.hora_inicio?.slice(0,5)||'—'} - ${c.hora_fin?.slice(0,5)||'—'}`, '—'])
    ]
    descargarCSV(rows, 'cursos_activos')
  }

  const exportCursosPDF = () => {
    const html = `<h1>Cursos Activos</h1>
    <table><tr><th>Curso</th><th>Nivel</th><th>Días</th><th>Horario</th></tr>
    ${cursos.map(c=>`<tr><td>${c.nombre}</td><td>${c.nivel}</td><td>${c.dias||'—'}</td><td>${c.hora_inicio?.slice(0,5)||'—'}–${c.hora_fin?.slice(0,5)||'—'}</td></tr>`).join('')}
    </table>`
    abrirPDF('Cursos Activos', html)
  }

  // ── EXPORTADOR GENERAL ──
  const exportGeneralCSV = () => {
    const rows = [
      ['NEXT EZEIZA — REPORTE GENERAL'],
      ['Generado:', new Date().toLocaleDateString('es-AR')],
      [''],
      ['=== PROFESORAS ==='],
      ['Nombre','Nivel','Hs/semana','Liquidación'],
      ...profesoras.map(p=>[`${p.nombre} ${p.apellido}`,p.nivel,p.horas_semana,`$${((p.horas_semana||0)*4*(p.tarifa_hora||0)).toLocaleString('es-AR')}`]),
      [''],
      ['=== ALUMNOS ==='],
      ['Nombre','Nivel','Cuota'],
      ...alumnos.map(a=>[`${a.nombre} ${a.apellido}`,a.nivel,`$${a.cuota_mensual?.toLocaleString('es-AR')}`]),
      [''],
      ['=== CURSOS ==='],
      ['Nombre','Nivel','Días'],
      ...cursos.map(c=>[c.nombre,c.nivel,c.dias||'—']),
    ]
    descargarCSV(rows, 'reporte_general')
  }

  const exportGeneralPDF = () => {
    const html = `
    <h1>Reporte General</h1>
    <h2>Profesoras</h2>
    <table><tr><th>Nombre</th><th>Nivel</th><th>Hs/sem</th><th>Liquidación</th></tr>
    ${profesoras.map(p=>{const liq=(p.horas_semana||0)*4*(p.tarifa_hora||0);return`<tr><td>${p.nombre} ${p.apellido}</td><td>${p.nivel}</td><td>${p.horas_semana}hs</td><td>$${liq.toLocaleString('es-AR')}</td></tr>`}).join('')}
    </table>
    <h2>Alumnos</h2>
    <table><tr><th>Nombre</th><th>Nivel</th><th>Cuota</th></tr>
    ${alumnos.map(a=>`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')}</td></tr>`).join('')}
    </table>
    <h2>Cursos</h2>
    <table><tr><th>Nombre</th><th>Nivel</th><th>Días</th><th>Horario</th></tr>
    ${cursos.map(c=>`<tr><td>${c.nombre}</td><td>${c.nivel}</td><td>${c.dias||'—'}</td><td>${c.hora_inicio?.slice(0,5)||'—'}–${c.hora_fin?.slice(0,5)||'—'}</td></tr>`).join('')}
    </table>`
    abrirPDF('Reporte General', html)
  }

  return (
    <div className="fade-in">

      {/* ALERTAS 2 AUSENCIAS CONSECUTIVAS */}
      {!loadingAusentes && alertas2Cons.length > 0 && (
        <div style={{background:'var(--redl)',border:'1.5px solid #f5c5c5',borderRadius:'14px',padding:'14px 16px',marginBottom:'16px'}}>
          <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
            <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--red)" strokeWidth="2"><circle cx="10" cy="10" r="8"/><path d="M10 6v4M10 14h.01"/></svg>
            <span style={{fontSize:'14px',fontWeight:700,color:'var(--red)'}}>⚠ {alertas2Cons.length} alumno{alertas2Cons.length!==1?'s':''} con 2 o más ausencias consecutivas</span>
          </div>
          {alertas2Cons.map((al:any,i:number) => {
            const est = alertaEstados[al.alumno_id] || { enviado: false, obs: '' }
            // Buscar celular del alumno
            const alumnoData = alumnos.find((a:any) => a.id === al.alumno_id)
            // usar padre_telefono para menores, telefono para adultos
            const telRaw = alumnoData?.es_menor ? alumnoData?.padre_telefono : alumnoData?.telefono
            const celular = telRaw || alumnoData?.telefono || alumnoData?.padre_telefono
            const wsLink = celular ? `https://wa.me/54${celular.replace(/\D/g,'')}?text=${encodeURIComponent(`Hola ${al.nombre}, te contactamos desde Next Ezeiza porque registramos ${al.total} ausencia${al.total!==1?'s':''} consecutiva${al.total!==1?'s':''} en el curso ${al.curso}. Queremos saber cómo estás. ¡Esperamos verte pronto!`)}` : null
            return (
            <div key={i} style={{borderTop:'1px solid #f5c5c5',paddingTop:'10px',marginTop:'4px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                <div style={{width:28,height:28,borderRadius:9,background:al.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {al.nombre?.[0]}{al.apellido?.[0]}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13px',fontWeight:600,color:'var(--red)'}}>{al.nombre} {al.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--red)',opacity:.8}}>{al.curso} · {al.total} ausencia{al.total!==1?'s':''} · Últimas: {al.fechas?.join(' y ')}</div>
                </div>
                <div style={{display:'flex',gap:'6px',flexShrink:0,alignItems:'center'}}>
                  {wsLink && (
                    <a href={wsLink} target="_blank" rel="noopener noreferrer"
                      style={{padding:'6px 12px',background:'#25D366',color:'#fff',borderRadius:'8px',fontSize:'12px',fontWeight:600,textDecoration:'none',display:'flex',alignItems:'center',gap:'4px'}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WS
                    </a>
                  )}
                  <button onClick={() => setAlertaEstado(al.alumno_id, 'enviado', !est.enviado)}
                    style={{padding:'6px 12px',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:'1.5px solid',
                      borderColor:est.enviado?'var(--green)':'var(--border)',
                      background:est.enviado?'var(--greenl)':'var(--white)',
                      color:est.enviado?'var(--green)':'var(--text3)'}}>
                    {est.enviado?'Enviado':'No enviado'}
                  </button>
                </div>
              </div>
              <div style={{marginTop:'8px',paddingLeft:'38px'}}>
                <input type="text" value={est.obs} onChange={e => setAlertaEstado(al.alumno_id,'obs',e.target.value)}
                  placeholder="Observaciones (respuesta del alumno...)"
                  style={{width:'100%',padding:'7px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'12px',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}} />
              </div>
            </div>
            )
          })}
        </div>
      )}

      {/* SECCIÓN AUSENTES */}
      <ReportSection
        titulo="Reporte de ausencias"
        subtitulo={loadingAusentes ? 'Cargando...' : `${ausentes.filter(a=>a.ausencias.length>0).length} alumnos con ausencias registradas`}
        onCSV={() => {
          const rows = [
            ['NEXT EZEIZA — REPORTE DE AUSENCIAS'],
            ['Generado:', new Date().toLocaleDateString('es-AR')],
            [''],
            ['Alumno','Total ausencias','Alerta 2 consecutivas'],
            ...ausentes.filter(a=>a.ausencias.length>0).sort((a:any,b:any)=>b.ausencias.length-a.ausencias.length).map((a:any) => {
              const alerta = alertas2Cons.find(al=>al.alumno_id===a.alumno_id)
              return [`${a.nombre} ${a.apellido}`, a.ausencias.length, alerta?'⚠ SÍ':'No']
            })
          ]
          const csv = rows.map((r:any[]) => r.map((c:any) => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob)
          const el = document.createElement('a'); el.href=url; el.download=`ausencias_${new Date().toISOString().split('T')[0]}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={exportAusentesPDF}
      >
        {loadingAusentes && <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Cargando datos...</div>}
        {!loadingAusentes && ausentes.filter(a=>a.ausencias.length>0).length === 0 && (
          <div style={{textAlign:'center',padding:'16px',color:'var(--text3)'}}>Sin ausencias registradas</div>
        )}
        {!loadingAusentes && [...ausentes].filter(a=>a.ausencias.length>0).sort((a,b)=>b.ausencias.length-a.ausencias.length).map((a:any) => {
          const tieneAlerta = alertas2Cons.find(al=>al.alumno_id===a.alumno_id)
          return (
            <div key={a.alumno_id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <div style={{width:28,height:28,borderRadius:9,background:a.color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'10px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {a.nombre?.[0]}{a.apellido?.[0]}
                </div>
                <div>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)'}}>{a.ausencias.length} ausencia{a.ausencias.length!==1?'s':''}</div>
                </div>
              </div>
              {tieneAlerta && (
                <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5'}}>
                  ⚠ 2+ consecutivas
                </span>
              )}
            </div>
          )
        })}
      </ReportSection>

      {/* KPIs */}
      {(!esSecretaria && !esCoordinadora) && <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'12px',marginBottom:'20px'}}>
        {[
          {val:`${alumnos.length}`,    label:'Alumnos activos',     color:'var(--v)'},
          {val:`${cursos.length}`,     label:'Cursos activos',      color:'var(--v)'},
          {val:`${avgAsist}%`,         label:'Asist. docente prom.',color:'var(--green)'},
          {val:`$${Math.round(totalLiq/1000)}k`, label:'Liquidación mensual', color:'var(--v)'},
        ].map(k => (
          <div key={k.label} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px 16px'}}>
            <div style={{fontSize:'28px',fontWeight:700,lineHeight:1,marginBottom:'4px',color:k.color}}>{k.val}</div>
            <div style={{fontSize:'12px',color:'var(--text2)',fontWeight:500}}>{k.label}</div>
          </div>
        ))}
      </div>}

      {/* SECCIÓN: ASISTENCIA DOCENTE */}
      {(!esSecretaria && !esCoordinadora) && (
      <ReportSection
        titulo="Asistencia docente"
        subtitulo={`${profesoras.filter((p:any) => !p.tipo_colaborador || p.tipo_colaborador === 'docente').length} docentes — últimos 6 meses`}
        onCSV={exportAsistenciaCSV}
        onPDF={exportAsistenciaPDF}
      >
        {profesoras.filter((p:any) => !p.tipo_colaborador || p.tipo_colaborador === 'docente').map(p => (
          <div key={p.id} style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'12px'}}>
            <Av color={p.color} size={36}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
            <div style={{fontSize:'13px',fontWeight:600,width:'100px',flexShrink:0}}>{p.nombre}</div>
            <div style={{flex:1,display:'flex',alignItems:'center',gap:'8px'}}>
              <div style={{flex:1,height:'8px',background:'var(--border)',borderRadius:'4px',overflow:'hidden'}}>
                <div style={{height:'100%',width:`${asistenciaProfs[p.id] ?? 0}%`,background:(asistenciaProfs[p.id]??0)>=80?p.color:'var(--amber)',borderRadius:'4px',transition:'width .4s'}} />
              </div>
              <span style={{fontSize:'13px',fontWeight:700,minWidth:'40px',textAlign:'right',color:(asistenciaProfs[p.id]??0)>=80?'var(--text)':'var(--amber)'}}>
                {(asistenciaProfs[p.id]??0) > 0 ? `${asistenciaProfs[p.id]}%` : '—'}
              </span>
            </div>
          </div>
        ))}
      </ReportSection>
      )}

      {/* SECCIÓN: COBRANZA */}
      {!esCoordinadora && <ReportSection
        titulo="Cobranza por alumno"
        subtitulo={`${alumnos.length} alumnos`}
        onCSV={exportCobranzaCSV}
        onPDF={exportCobranzaPDF}
      >
        {(() => {
          const [filtroCobranza, setFiltroCobranza] = React.useState<'todos'|'Pagado'|'Al día'|'Deudor'>('todos')
          const normalizarTelWS = (tel: string) => {
            if (!tel) return ''
            let t = tel.replace(/\D/g, '')
            if (t.startsWith('0')) t = t.slice(1)
            if (t.startsWith('54')) t = t.slice(2)
            if (t.startsWith('9') && t.length > 10) t = t.slice(1)
            return '549' + t
          }
          const alumnosFiltrados = filtroCobranza === 'todos'
            ? alumnos
            : alumnos.filter((a:any) => getEstadoCobranza(a.id).label === filtroCobranza)
          const counts = {
            Pagado: alumnos.filter((a:any) => getEstadoCobranza(a.id).label === 'Pagado').length,
            'Al día': alumnos.filter((a:any) => getEstadoCobranza(a.id).label === 'Al día').length,
            Deudor: alumnos.filter((a:any) => getEstadoCobranza(a.id).label === 'Deudor').length,
          }
          return (
            <>
              <div style={{display:'flex',gap:'6px',flexWrap:'wrap',marginBottom:'14px'}}>
                {(['todos','Pagado','Al día','Deudor'] as const).map(f => {
                  const colores: Record<string,{active:string,bg:string,border:string}> = {
                    todos: {active:'var(--v)',bg:'var(--vl)',border:'var(--v)'},
                    Pagado: {active:'var(--green)',bg:'var(--greenl)',border:'var(--green)'},
                    'Al día': {active:'var(--amber)',bg:'var(--amberl)',border:'#e8d080'},
                    Deudor: {active:'var(--red)',bg:'var(--redl)',border:'#f5c5c5'},
                  }
                  const c = colores[f]
                  const activo = filtroCobranza === f
                  const count = f === 'todos' ? alumnos.length : counts[f as keyof typeof counts]
                  return (
                    <button key={f} onClick={() => setFiltroCobranza(f)}
                      style={{padding:'6px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,cursor:'pointer',border:`1.5px solid ${activo?c.border:'var(--border)'}`,background:activo?c.bg:'var(--white)',color:activo?c.active:'var(--text2)',display:'flex',alignItems:'center',gap:'5px'}}>
                      {f === 'todos' ? 'Todos' : f}
                      <span style={{background:activo?c.active:'var(--border)',color:activo?'#fff':'var(--text2)',borderRadius:'20px',padding:'1px 6px',fontSize:'10px',fontWeight:700}}>{count}</span>
                    </button>
                  )
                })}
              </div>
              {alumnosFiltrados.map((a:any) => {
                const estado = getEstadoCobranza(a.id)
                const bgColor = estado.label === 'Pagado' ? 'var(--greenl)' : estado.label === 'Al día' ? '#fef3cd' : '#fdeaea'
                const tel = a.es_menor ? (a.padre_telefono || a.telefono) : (a.telefono || a.padre_telefono)
                const contacto = a.es_menor ? (a.padre_nombre || a.nombre) : a.nombre
                const msgAlDia = `Hola ${contacto}, ¿cómo estás? 😄\nTe escribimos desde Next English Institute para consultarte si pudiste realizar el pago de la cuota de este mes.\n📌 En caso de ya haberlo abonado, podés ignorar este mensaje. 📲 Si aún no, estamos a disposición por cualquier consulta.\nMuchas gracias 🙌`
                const msgDeudor = `Hola ${contacto}, ¿cómo estás? 😄\nTe escribimos desde Next English Institute ya que la cuota del mes se encuentra vencida.\n📌 A partir de ahora se aplica el recargo correspondiente, según política del instituto.\n📲 Cualquier consulta o si necesitás ayuda con el pago, estamos a disposición.\nMuchas gracias 🙌`
                const msg = estado.label === 'Deudor' ? msgDeudor : msgAlDia
                const num = normalizarTelWS(tel || '')
                return (
                  <div key={a.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                      <Av color={a.color} size={28}>{a.nombre[0]}{a.apellido[0]}</Av>
                      <div>
                        <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                        <div style={{fontSize:'12px',color:'var(--text2)'}}>{a.nivel} · ${a.cuota_mensual?.toLocaleString('es-AR')}/mes</div>
                      </div>
                    </div>
                    <div style={{display:'flex',alignItems:'center',gap:'6px'}}>
                      {estado.label !== 'Pagado' && tel && num.length >= 12 && (
                        <a href={`https://wa.me/${num}?text=${encodeURIComponent(msg)}`}
                          target="_blank" rel="noopener noreferrer"
                          style={{padding:'5px 9px',background:'#25D366',color:'#fff',borderRadius:'7px',fontSize:'11px',fontWeight:600,textDecoration:'none',display:'flex',alignItems:'center',gap:'3px',flexShrink:0}}>
                          <svg width="11" height="11" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                          WS
                        </a>
                      )}
                      <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:bgColor,color:estado.color}}>{estado.label}</span>
                    </div>
                  </div>
                )
              })}
            </>
          )
        })()}
      </ReportSection>}


      {/* SECCIÓN: CURSOS */}
      <ReportSection
        titulo="Cursos activos"
        subtitulo={`${cursos.length} cursos en curso`}
        onCSV={exportCursosCSV}
        onPDF={exportCursosPDF}
      >
        {cursos.map(c => (
          <div key={c.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
            <div>
              <div style={{fontSize:'13.5px',fontWeight:600}}>{c.nombre}</div>
              <div style={{fontSize:'12px',color:'var(--text2)'}}>{c.dias||'—'} · {c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
            </div>
            <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--vl)',color:'var(--v)'}}>{c.nivel}</span>
          </div>
        ))}
      </ReportSection>





      {/* REPORTE: ALUMNOS ACTIVOS — ALTAS Y BAJAS DEL MES */}
      {(!esSecretaria && !esCoordinadora) && (
      <ReportSection
        titulo="Alumnos activos — Movimientos del mes"
        subtitulo={`${mesActualNombre} ${anioActual} · ${alumnos.length} activos · ${altasDelMes.length} alta${altasDelMes.length!==1?'s':''} · ${bajasDelMes.length} baja${bajasDelMes.length!==1?'s':''}`}
        onCSV={() => {
          const rows = [
            ['NEXT EZEIZA — MOVIMIENTOS DE ALUMNOS'],
            [`Mes: ${mesActualNombre} ${anioActual}`],
            [''],
            ['ESTADO ACTUAL'],
            ['Total alumnos activos', alumnos.length],
            [''],
            ['ALTAS DEL MES'],
            ['Nombre', 'Nivel', 'Cuota', 'Fecha de alta'],
            ...altasDelMes.map((a:any) => [`${a.nombre} ${a.apellido}`, a.nivel, `$${a.cuota_mensual?.toLocaleString('es-AR')||'0'}`, a.fecha_alta ? new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR') : '—']),
            [''],
            ['BAJAS DEL MES'],
            ['Nombre', 'Nivel', 'Cuota', 'Fecha de baja', 'Motivo'],
            ...bajasDelMes.map((b:any) => [`${b.alumno_nombre} ${b.alumno_apellido}`, b.nivel||'—', `$${b.cuota_mensual?.toLocaleString('es-AR')||'0'}`, b.fecha_baja ? new Date(b.fecha_baja+'T12:00:00').toLocaleDateString('es-AR') : '—', b.motivo||'—']),
          ]
          const csv = rows.map((r:any[]) => r.map((c:any)=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob); const el = document.createElement('a')
          el.href=url; el.download=`movimientos_${mesActualNombre}_${anioActual}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={() => {
          const fmtF = (f:string) => f ? new Date(f+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long'}) : '—'
          abrirPDF('Movimientos de Alumnos', `
            <h2>${mesActualNombre} ${anioActual}</h2>
            <div style="display:flex;gap:16px;margin-bottom:20px">
              <div style="background:#f2e8f9;padding:12px 20px;border-radius:10px;text-align:center"><div style="font-size:28px;font-weight:800;color:#652f8d">${alumnos.length}</div><div style="font-size:11px;color:#9b8eaa">Alumnos activos</div></div>
              <div style="background:#e6f4ec;padding:12px 20px;border-radius:10px;text-align:center"><div style="font-size:28px;font-weight:800;color:#2d7a4f">+${altasDelMes.length}</div><div style="font-size:11px;color:#2d7a4f">Altas</div></div>
              <div style="background:#fde8e8;padding:12px 20px;border-radius:10px;text-align:center"><div style="font-size:28px;font-weight:800;color:#c0392b">-${bajasDelMes.length}</div><div style="font-size:11px;color:#c0392b">Bajas</div></div>
            </div>
            ${altasDelMes.length > 0 ? `
            <h3 style="color:#2d7a4f">Altas del mes</h3>
            <table><tr><th>Alumno</th><th>Nivel</th><th>Cuota</th><th>Fecha</th></tr>
            ${altasDelMes.map((a:any)=>`<tr><td>${a.nombre} ${a.apellido}</td><td>${a.nivel}</td><td>$${a.cuota_mensual?.toLocaleString('es-AR')||'0'}</td><td>${fmtF(a.fecha_alta)}</td></tr>`).join('')}
            </table>` : '<p style="color:#9b8eaa">Sin altas en el mes</p>'}
            ${bajasDelMes.length > 0 ? `
            <h3 style="color:#c0392b">Bajas del mes</h3>
            <table><tr><th>Alumno</th><th>Nivel</th><th>Cuota</th><th>Fecha</th><th>Motivo</th></tr>
            ${bajasDelMes.map((b:any)=>`<tr><td>${b.alumno_nombre} ${b.alumno_apellido}</td><td>${b.nivel||'—'}</td><td>$${b.cuota_mensual?.toLocaleString('es-AR')||'0'}</td><td>${fmtF(b.fecha_baja)}</td><td>${b.motivo||'—'}</td></tr>`).join('')}
            </table>` : '<p style="color:#9b8eaa">Sin bajas en el mes</p>'}
          `)
        }}
      >
        {loadingMovimientos ? (
          <div style={{textAlign:'center',padding:'20px',color:'var(--text3)'}}>Cargando...</div>
        ) : (
          <>
            {/* KPIs */}
            <div style={{display:'grid',gridTemplateColumns:'repeat(3,1fr)',gap:'10px',marginBottom:'16px'}}>
              <div style={{background:'var(--vl)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:800,color:'var(--v)'}}>{alumnos.length}</div>
                <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>Activos ahora</div>
              </div>
              <div style={{background:'var(--greenl)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:800,color:'var(--green)'}}>+{altasDelMes.length}</div>
                <div style={{fontSize:'11px',color:'var(--green)',marginTop:'2px'}}>Altas {mesActualNombre}</div>
              </div>
              <div style={{background:'var(--redl)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                <div style={{fontSize:'24px',fontWeight:800,color:'var(--red)'}}>-{bajasDelMes.length}</div>
                <div style={{fontSize:'11px',color:'var(--red)',marginTop:'2px'}}>Bajas {mesActualNombre}</div>
              </div>
            </div>

            {/* Altas */}
            {altasDelMes.length > 0 && (
              <div style={{marginBottom:'14px'}}>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>↑ Altas del mes</div>
                {altasDelMes.map((a:any, i:number) => (
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:'1px solid var(--border)'}}>
                    <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                      <div style={{width:32,height:32,borderRadius:'9px',background:a.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                        {a.nombre?.[0]}{a.apellido?.[0]}
                      </div>
                      <div>
                        <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                        <div style={{fontSize:'11.5px',color:'var(--text2)'}}>{a.nivel}</div>
                      </div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:'12px',fontWeight:700,color:'var(--green)'}}>${a.cuota_mensual?.toLocaleString('es-AR')||'0'}/mes</div>
                      <div style={{fontSize:'11px',color:'var(--text3)'}}>{a.fecha_alta ? new Date(a.fecha_alta+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'}) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {altasDelMes.length === 0 && <div style={{fontSize:'12.5px',color:'var(--text3)',padding:'8px 0 12px',borderBottom:'1px solid var(--border)',marginBottom:'12px'}}>Sin altas registradas en {mesActualNombre}</div>}

            {/* Bajas */}
            {bajasDelMes.length > 0 && (
              <div>
                <div style={{fontSize:'11px',fontWeight:700,color:'var(--red)',textTransform:'uppercase',letterSpacing:'.06em',marginBottom:'8px'}}>↓ Bajas del mes</div>
                {bajasDelMes.map((b:any, i:number) => (
                  <div key={i} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'9px 0',borderBottom:i<bajasDelMes.length-1?'1px solid var(--border)':'none'}}>
                    <div>
                      <div style={{fontSize:'13.5px',fontWeight:600}}>{b.alumno_nombre} {b.alumno_apellido}</div>
                      <div style={{fontSize:'11.5px',color:'var(--text2)'}}>{b.nivel||'—'} · {b.motivo||'—'}</div>
                    </div>
                    <div style={{textAlign:'right',flexShrink:0}}>
                      <div style={{fontSize:'12px',color:'var(--red)',fontWeight:600}}>${b.cuota_mensual?.toLocaleString('es-AR')||'0'}/mes</div>
                      <div style={{fontSize:'11px',color:'var(--text3)'}}>{b.fecha_baja ? new Date(b.fecha_baja+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'short'}) : '—'}</div>
                    </div>
                  </div>
                ))}
              </div>
            )}
            {bajasDelMes.length === 0 && <div style={{fontSize:'12.5px',color:'var(--text3)',padding:'8px 0'}}>Sin bajas registradas en {mesActualNombre}</div>}
          </>
        )}
      </ReportSection>
      )}

      {/* BOLETÍN DIGITAL */}
      <BoletinSection alumnos={alumnos} />

      {/* CERTIFICADO DE ASISTENCIA */}
      <CertificadoSection alumnos={alumnos} />

      {/* EXPORTAR TODO */}
      <div style={{border:'1.5px solid var(--border)',borderRadius:'16px',padding:'16px',background:'var(--white)'}}>
        <div style={{fontSize:'13px',fontWeight:700,marginBottom:'4px'}}>Exportar reporte completo</div>
        <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'12px'}}>Incluye asistencia, cobranza, liquidación y cursos en un solo archivo</div>
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={exportGeneralCSV} style={btnStyle('#2d7a4f')}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            Excel completo
          </button>
          <button onClick={exportGeneralPDF} style={btnStyle('var(--v)')}>
            <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            PDF completo
          </button>
        </div>
      </div>
    </div>
  )
}

// ── COMPONENTE SECCIÓN CON DESCARGA ──
function ReportSection({ titulo, subtitulo, onCSV, onPDF, children }: any) {
  const [abierto, setAbierto] = useState(false)
  return (
    <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'14px',overflow:'hidden'}}>
      <div style={{padding:'14px 16px',display:'flex',alignItems:'center',justifyContent:'space-between',borderBottom:abierto?'1px solid var(--border)':'none',cursor:'pointer'}} onClick={() => setAbierto(!abierto)}>
        <div>
          <div style={{fontSize:'15px',fontWeight:700}}>{titulo}</div>
          <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{subtitulo}</div>
        </div>
        <div style={{display:'flex',gap:'6px',alignItems:'center'}} onClick={e=>e.stopPropagation()}>
          <button onClick={onCSV} title="Descargar Excel" style={{padding:'6px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',background:'var(--white)',cursor:'pointer',fontSize:'12px',fontWeight:600,color:'var(--green)',display:'flex',alignItems:'center',gap:'4px'}}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            XLS
          </button>
          <button onClick={onPDF} title="Descargar PDF" style={{padding:'6px 10px',border:'1.5px solid var(--border)',borderRadius:'8px',background:'var(--white)',cursor:'pointer',fontSize:'12px',fontWeight:600,color:'var(--v)',display:'flex',alignItems:'center',gap:'4px'}}>
            <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 16v1a1 1 0 001 1h10a1 1 0 001-1v-1M7 10l3 3 3-3M10 3v10"/></svg>
            PDF
          </button>
          <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2" style={{transform:abierto?'rotate(180deg)':'',transition:'transform .2s',cursor:'pointer'}}><path d="M5 8l5 5 5-5"/></svg>
        </div>
      </div>
      {abierto && <div style={{padding:'14px 16px'}}>{children}</div>}
    </div>
  )
}

// ── HELPERS DE EXPORTACIÓN ──
function descargarCSV(rows: any[][], nombre: string) {
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
  const url = URL.createObjectURL(blob)
  const el = document.createElement('a')
  el.href = url; el.download = `${nombre}_${new Date().toISOString().split('T')[0]}.csv`; el.click()
  URL.revokeObjectURL(url)
}

function abrirPDF(titulo: string, contenido: string) {
  const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>${titulo}</title>
  <style>
    body{font-family:sans-serif;padding:24px;font-size:13px;color:#1a1020}
    h1{color:#652f8d;font-size:20px;margin-bottom:4px}
    h2{color:#652f8d;font-size:15px;margin:20px 0 8px;border-bottom:1px solid #e8dff2;padding-bottom:6px}
    p{font-size:12px;color:#9b8eaa;margin-bottom:16px}
    table{width:100%;border-collapse:collapse;margin:8px 0 16px}
    th{font-size:10px;text-transform:uppercase;border-bottom:2px solid #652f8d;padding:8px 6px;text-align:left;color:#652f8d;letter-spacing:.05em}
    td{padding:8px 6px;border-bottom:1px solid #f0edf5;font-size:13px}
    tr:hover td{background:#faf5fd}
    .header{display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:24px;padding-bottom:16px;border-bottom:2px solid #652f8d}
    .logo{font-size:20px;font-weight:700}.logo span{color:#652f8d}
    .fecha{font-size:12px;color:#9b8eaa}
  </style></head><body>
  <div class="header">
    <div class="logo"><span>Next</span> Ezeiza</div>
    <div class="fecha">Generado: ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
  </div>
  ${contenido}
  <script>setTimeout(function(){window.print()},300)<\/script></body></html>`
  const blob = new Blob([html], {type:'text/html;charset=utf-8'})
  const url = URL.createObjectURL(blob)
  const win = window.open(url, '_blank')
  if (!win) { const a = document.createElement('a'); a.href=url; a.download=titulo+'.html'; a.click() }
  setTimeout(() => URL.revokeObjectURL(url), 10000)
}


const Av = ({color,size,children}:any) => <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.28+'px',fontWeight:700,color:'#fff',flexShrink:0}}>{children}</div>
const btnStyle = (bg: string) => ({display:'flex',alignItems:'center',gap:'6px',padding:'10px 16px',background:bg,color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}) as const

// ── BOLETÍN DIGITAL (Opción A) ──
// El HTML se genera en el servidor (/api/boletin/[alumnoId]) que lee el
// instituto dinámicamente desde la DB. El frontend solo arma la URL y abre la pestaña.
function BoletinSection({ alumnos }: any) {
  const [selAlumno, setSelAlumno] = useState('')
  const [periodo, setPeriodo] = useState('2° Trimestre')
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [nivelManual, setNivelManual] = useState('')
  const [generando, setGenerando] = useState(false)
  const IS = { padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'13px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)', width:'100%' } as const

  const generar = async () => {
    if (!selAlumno) return alert('Seleccioná un alumno')
    setGenerando(true)
    try {
      const sb = createClient()
      // Obtener el curso del alumno para pasarlo como parámetro
      const cuRes = await sb
        .from('cursos_alumnos')
        .select('cursos(id,nombre,nivel)')
        .eq('alumno_id', selAlumno)
        .limit(1)
      const cursoData = cuRes.data?.[0]?.cursos as any
      const cursoId = cursoData?.id

      if (!cursoId) {
        alert('El alumno no tiene un curso asignado.')
        setGenerando(false)
        return
      }

      // Armar la URL de la API y abrir en nueva pestaña
      // La ruta /api/boletin/[alumnoId] lee instituto, firma y director desde la DB
      const params = new URLSearchParams({
        curso_id: cursoId,
        periodo:  `${periodo} ${anio}`,
        ...(nivelManual ? { nivel: nivelManual } : {}),
      })
      window.open(`/api/boletin/${selAlumno}?${params.toString()}`, '_blank')
    } catch (e) {
      console.error('[Boletin]', e)
      alert('Error al generar el boletín.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <ReportSection titulo="Boletín digital" subtitulo="PDF listo para compartir por WhatsApp" onCSV={undefined} onPDF={undefined}>
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Alumno</div>
        <select style={IS} value={selAlumno} onChange={e => setSelAlumno(e.target.value)}>
          <option value="">— Seleccioná un alumno —</option>
          {[...alumnos].sort((a:any,b:any) => a.apellido.localeCompare(b.apellido)).map((a:any) => <option key={a.id} value={a.id}>{a.apellido}, {a.nombre}</option>)}
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
        <div>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Período</div>
          <select style={IS} value={periodo} onChange={e => setPeriodo(e.target.value)}>
            {['1° Trimestre','2° Trimestre','3° Trimestre','Anual'].map(p => <option key={p}>{p}</option>)}
          </select>
        </div>
        <div>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Año</div>
          <select style={IS} value={anio} onChange={e => setAnio(+e.target.value)}>
            {[2024,2025,2026].map(y => <option key={y}>{y}</option>)}
          </select>
        </div>
      </div>
      <div style={{marginBottom:'14px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Nivel (opcional, reemplaza el automático)</div>
        <input style={IS} type="text" value={nivelManual} onChange={e => setNivelManual(e.target.value)} placeholder="Ej: A2, B1, Intermedio..." />
      </div>
      <button onClick={generar} disabled={generando} style={{width:'100%',padding:'13px',background:generando?'#aaa':'var(--v)',color:'white',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
        {generando ? 'Generando...' : '📄 Generar boletín PDF'}
      </button>
    </ReportSection>
  )
}


// ── BOLETÍN DIGITAL ──
// ── CERTIFICADO DE ASISTENCIA (Opción A) ──
// El HTML se genera en el servidor (/api/certificado/[alumnoId]) que lee el
// instituto, color, firma y director dinámicamente desde la DB.
function CertificadoSection({ alumnos }: any) {
  const [selAlumno, setSelAlumno] = useState('')
  const [tipo, setTipo] = useState('Asistencia al curso de inglés')
  const [desde, setDesde] = useState(`${new Date().getFullYear()}-03-01`)
  const [hasta, setHasta] = useState(`${new Date().getFullYear()}-11-30`)
  const [destinatario, setDestinatario] = useState('')
  const [nivelManual, setNivelManual] = useState('')
  const [generando, setGenerando] = useState(false)
  const IS = { padding:'9px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'13px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)', width:'100%' } as const

  const generar = async () => {
    if (!selAlumno) return alert('Seleccioná un alumno')
    setGenerando(true)
    try {
      const sb = createClient()
      // Obtener el curso del alumno
      const cuRes = await sb
        .from('cursos_alumnos')
        .select('cursos(id,nombre,nivel)')
        .eq('alumno_id', selAlumno)
        .limit(1)
      const cursoData = cuRes.data?.[0]?.cursos as any
      const cursoId = cursoData?.id

      if (!cursoId) {
        alert('El alumno no tiene un curso asignado.')
        setGenerando(false)
        return
      }

      // Armar la URL de la API y abrir en nueva pestaña
      // La ruta /api/certificado/[alumnoId] lee instituto, color, firma y director desde la DB
      const params = new URLSearchParams({
        curso_id:    cursoId,
        tipo,
        desde,
        hasta,
        ...(destinatario ? { destinatario } : {}),
        ...(nivelManual  ? { nivel: nivelManual } : {}),
      })
      window.open(`/api/certificado/${selAlumno}?${params.toString()}`, '_blank')
    } catch (e) {
      console.error('[Certificado]', e)
      alert('Error al generar el certificado.')
    } finally {
      setGenerando(false)
    }
  }

  return (
    <ReportSection titulo="Certificado de asistencia" subtitulo="Con firma del director, listo para imprimir" onCSV={undefined} onPDF={undefined}>
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Alumno</div>
        <select style={IS} value={selAlumno} onChange={e => setSelAlumno(e.target.value)}>
          <option value="">— Seleccioná un alumno —</option>
          {[...alumnos].sort((a:any,b:any) => a.apellido.localeCompare(b.apellido)).map((a:any) => <option key={a.id} value={a.id}>{a.apellido}, {a.nombre}</option>)}
        </select>
      </div>
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Tipo</div>
        <select style={IS} value={tipo} onChange={e => setTipo(e.target.value)}>
          {['Asistencia al curso de inglés','Nivel alcanzado','Alumno regular'].map(t => <option key={t}>{t}</option>)}
        </select>
      </div>
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
        <div>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Desde</div>
          <input style={IS} type="date" value={desde} onChange={e => setDesde(e.target.value)} />
        </div>
        <div>
          <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Hasta</div>
          <input style={IS} type="date" value={hasta} onChange={e => setHasta(e.target.value)} />
        </div>
      </div>
      <div style={{marginBottom:'10px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Nivel (opcional)</div>
        <input style={IS} type="text" value={nivelManual} onChange={e => setNivelManual(e.target.value)} placeholder="Ej: A1, A2, B1, Intermedio..." />
      </div>
      <div style={{marginBottom:'14px'}}>
        <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Destinatario (opcional)</div>
        <input style={IS} type="text" value={destinatario} onChange={e => setDestinatario(e.target.value)} placeholder="Ej: Empresa XYZ, Universidad Nacional..." />
      </div>
      <button onClick={generar} disabled={generando} style={{width:'100%',padding:'13px',background:generando?'#aaa':'#1B6B4A',color:'white',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
        {generando ? 'Generando...' : '🏅 Generar certificado PDF'}
      </button>
    </ReportSection>
  )
}
