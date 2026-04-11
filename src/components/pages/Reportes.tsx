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
  }, [mesActualNombre, anioActual])

  // Cargar altas y bajas del mes para el reporte de movimientos
  useEffect(() => {
    const cargarMovimientos = async () => {
      setLoadingMovimientos(true)
      try {
        const sb = createClient()
        const inicioMes = `${anioActual}-${String(new Date().getMonth()+1).padStart(2,'0')}-01`
        const finMes = new Date(anioActual, new Date().getMonth()+1, 0).toISOString().split('T')[0]
        const [altasRes, bajasRes] = await Promise.all([
          sb.from('alumnos').select('nombre, apellido, nivel, cuota_mensual, fecha_alta, color')
            .gte('fecha_alta', inicioMes).lte('fecha_alta', finMes).eq('activo', true)
            .order('fecha_alta', { ascending: false }),
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
  }, [mesActualNombre, anioActual])

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

  const totalLiq = profesoras.reduce((s,p) => s + (p.horas_semana||0) * 4 * (p.tarifa_hora||0), 0)

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
        subtitulo={`${profesoras.length} docentes — últimos 6 meses`}
        onCSV={exportAsistenciaCSV}
        onPDF={exportAsistenciaPDF}
      >
        {profesoras.map(p => (
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

            {/* SECCIÓN: LIQUIDACIÓN */}
      {(!esSecretaria && !esCoordinadora) && (
      <ReportSection
        titulo="Liquidación docente"
        subtitulo={`Total estimado: $${totalLiq.toLocaleString('es-AR')}`}
        onCSV={exportLiquidacionCSV}
        onPDF={exportLiquidacionPDF}
      >
        {[...profesoras].sort((a,b)=>(b.horas_semana||0)-(a.horas_semana||0)).map(p => {
          // Usar liquidación confirmada si existe, sino cálculo base
          const liqConfirmada = liqConfirmadas[p.id]
          const liqBase = (p.horas_semana||0)*4*(p.tarifa_hora||0)
          const liqMostrar = liqConfirmada !== undefined ? liqConfirmada : liqBase
          const tieneAjuste = liqConfirmada !== undefined && liqConfirmada !== liqBase
          return (
            <div key={p.id} style={{display:'flex',alignItems:'center',justifyContent:'space-between',padding:'10px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
                <Av color={p.color} size={28}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
                <div>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{p.nombre} {p.apellido}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{p.horas_semana}hs/sem · ${p.tarifa_hora?.toLocaleString('es-AR')}/h
                    {tieneAjuste && <span style={{marginLeft:'6px',color:'var(--amber)',fontWeight:600}}>· Con ajustes</span>}
                  </div>
                </div>
              </div>
              <div style={{textAlign:'right'}}>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>${liqMostrar.toLocaleString('es-AR')}</div>
                {tieneAjuste && <div style={{fontSize:'11px',color:'var(--text3)'}}>base ${liqBase.toLocaleString('es-AR')}</div>}
              </div>
            </div>
          )
        })}
        <div style={{display:'flex',justifyContent:'space-between',padding:'12px 0',marginTop:'4px'}}>
          <span style={{fontSize:'15px',fontWeight:700}}>Total mensual</span>
          <span style={{fontSize:'18px',fontWeight:700,color:'var(--v)'}}>
            ${profesoras.reduce((s,p) => {
              const conf = liqConfirmadas[p.id]
              return s + (conf !== undefined ? conf : (p.horas_semana||0)*4*(p.tarifa_hora||0))
            }, 0).toLocaleString('es-AR')}
          </span>
        </div>
      </ReportSection>
      )}

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


      {/* SECCIÓN: INGRESOS MENSUALES */}
      {(!esSecretaria && !esCoordinadora) && (
      <ReportSection
        titulo="Ingresos mensuales"
        subtitulo={`${mesActualNombre} ${anioActual} · ${ingresosDetalle.totalPagos.length} pagos cobrados`}
        onCSV={() => {
          const esperado = alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0)
          const rows = [
            ['NEXT EZEIZA — INGRESOS MENSUALES'],
            [`Mes: ${mesActualNombre} ${anioActual}`, '', ''],
            [''],
            ['Concepto','Cantidad','Monto'],
            ['Cuotas cobradas', ingresosDetalle.totalPagos.filter((p:any)=>p.observaciones!=='Matrícula de inscripción').length, `$${ingresosDetalle.cuotas.toLocaleString('es-AR')}`],
            ['Matrículas cobradas', ingresosDetalle.totalPagos.filter((p:any)=>p.observaciones==='Matrícula de inscripción').length, `$${ingresosDetalle.matriculas.toLocaleString('es-AR')}`],
            ['Total cobrado', ingresosDetalle.totalPagos.length, `$${(ingresosDetalle.cuotas+ingresosDetalle.matriculas).toLocaleString('es-AR')}`],
            [''],
            ['Ingresos esperados/mes (cuotas)', '', `$${esperado.toLocaleString('es-AR')}`],
            ['Liquidación docente/mes', '', `$${totalLiq.toLocaleString('es-AR')}`],
            ['Margen estimado', '', `$${(esperado-totalLiq).toLocaleString('es-AR')}`],
          ]
          const csv = rows.map((r:any[]) => r.map((c:any)=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob); const el = document.createElement('a')
          el.href=url; el.download=`ingresos_${mesActualNombre}_${anioActual}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={() => {
          const esperado = alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0)
          const totalCobrado = ingresosDetalle.cuotas + ingresosDetalle.matriculas
          const margen = esperado - totalLiq
          abrirPDF('Ingresos Mensuales', `
            <h2>${mesActualNombre} ${anioActual} — Resumen de ingresos</h2>
            <table>
              <tr><th>Concepto</th><th>Cantidad</th><th>Monto</th></tr>
              <tr><td>Cuotas cobradas</td><td>${ingresosDetalle.totalPagos.filter((p:any)=>p.observaciones!=='Matrícula de inscripción').length}</td><td style="font-weight:700;color:#2d7a4f">$${ingresosDetalle.cuotas.toLocaleString('es-AR')}</td></tr>
              <tr><td>Matrículas cobradas</td><td>${ingresosDetalle.totalPagos.filter((p:any)=>p.observaciones==='Matrícula de inscripción').length}</td><td style="font-weight:700;color:#1a6b8a">$${ingresosDetalle.matriculas.toLocaleString('es-AR')}</td></tr>
              <tr style="background:#f2e8f9"><td style="font-weight:700">Total cobrado</td><td>${ingresosDetalle.totalPagos.length}</td><td style="font-weight:700;color:#652f8d">$${totalCobrado.toLocaleString('es-AR')}</td></tr>
            </table>
            <h2>Proyección mensual</h2>
            <table>
              <tr><th>Concepto</th><th>Monto</th></tr>
              <tr><td>Ingresos esperados (cuotas)</td><td style="font-weight:700;color:#2d7a4f">$${esperado.toLocaleString('es-AR')}</td></tr>
              <tr><td>Liquidación docente</td><td style="font-weight:700;color:#c0392b">$${totalLiq.toLocaleString('es-AR')}</td></tr>
              <tr style="background:#f2e8f9"><td style="font-weight:700">Margen estimado</td><td style="font-weight:700;color:#652f8d">$${margen.toLocaleString('es-AR')}</td></tr>
            </table>
          `)
        }}
      >
        {/* Desglose cuotas vs matrículas */}
        {(() => {
          const esperado = alumnos.reduce((s,a)=>s+(a.cuota_mensual||0),0)
          const totalCobrado = ingresosDetalle.cuotas + ingresosDetalle.matriculas
          const margen = esperado - totalLiq
          return (
            <>
              {/* Título del mes */}
              <div style={{fontSize:'12px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'12px'}}>
                Cobrado en {mesActualNombre} {anioActual}
              </div>
              {/* Cuotas y matrículas */}
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'14px'}}>
                <div style={{background:'var(--greenl)',borderRadius:'12px',padding:'14px'}}>
                  <div style={{fontSize:'10.5px',fontWeight:700,color:'var(--green)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'6px'}}>Cuotas del mes</div>
                  <div style={{fontSize:'22px',fontWeight:800,color:'var(--green)'}}>${Math.round(ingresosDetalle.cuotas/1000)}k</div>
                  <div style={{fontSize:'11px',color:'var(--green)',marginTop:'2px',opacity:.8}}>{ingresosDetalle.totalPagos.filter((p:any)=>p.observaciones!=='Matrícula de inscripción').length} pagos</div>
                </div>
                <div style={{background:'#e0f0f7',borderRadius:'12px',padding:'14px'}}>
                  <div style={{fontSize:'10.5px',fontWeight:700,color:'#1a6b8a',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'6px'}}>Matrículas del mes</div>
                  <div style={{fontSize:'22px',fontWeight:800,color:'#1a6b8a'}}>${ingresosDetalle.matriculas > 0 ? Math.round(ingresosDetalle.matriculas/1000)+'k' : '0'}</div>
                  <div style={{fontSize:'11px',color:'#1a6b8a',marginTop:'2px',opacity:.8}}>{ingresosDetalle.totalPagos.filter((p:any)=>p.observaciones==='Matrícula de inscripción').length} inscripciones</div>
                </div>
              </div>
              {/* Total cobrado */}
              <div style={{background:'var(--vl)',borderRadius:'12px',padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'10px'}}>
                <span style={{fontSize:'13px',fontWeight:600,color:'var(--v)'}}>Total cobrado {mesActualNombre}</span>
                <span style={{fontSize:'20px',fontWeight:800,color:'var(--v)'}}>${totalCobrado.toLocaleString('es-AR')}</span>
              </div>
              {/* Resta a cobrar */}
              {(() => {
                const restaCuotas = esperado - ingresosDetalle.cuotas
                const resta = restaCuotas > 0 ? restaCuotas : 0
                const pct = esperado > 0 ? Math.round((ingresosDetalle.cuotas / esperado) * 100) : 0
                return (
                  <div style={{background:'var(--amberl)',borderRadius:'12px',padding:'12px 14px',display:'flex',justifyContent:'space-between',alignItems:'center',marginBottom:'14px',border:'1px solid #e8d080'}}>
                    <div>
                      <span style={{fontSize:'13px',fontWeight:600,color:'var(--amber)'}}>Resta cobrar en cuotas</span>
                      <div style={{fontSize:'11px',color:'var(--amber)',opacity:.8,marginTop:'2px'}}>{pct}% cobrado de {alumnos.length} alumnos</div>
                    </div>
                    <span style={{fontSize:'20px',fontWeight:800,color:'var(--amber)'}}>${resta.toLocaleString('es-AR')}</span>
                  </div>
                )
              })()}
              {/* Separador proyección */}
              <div style={{fontSize:'12px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em',marginBottom:'12px',marginTop:'4px'}}>
                Proyección mensual
              </div>
              <div style={{display:'grid',gridTemplateColumns:'1fr 1fr 1fr',gap:'10px'}}>
                {[
                  {label:'Ingresos esperados',val:`$${Math.round(esperado/1000)}k`,color:'var(--green)'},
                  {label:'Liquidación docente',val:`$${Math.round(totalLiq/1000)}k`,color:'var(--red)'},
                  {label:'Margen estimado',val:`$${Math.round(margen/1000)}k`,color:margen>=0?'var(--v)':'var(--red)'},
                ].map(k=>(
                  <div key={k.label} style={{background:'var(--bg)',borderRadius:'12px',padding:'12px',textAlign:'center'}}>
                    <div style={{fontSize:'20px',fontWeight:700,color:k.color}}>{k.val}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{k.label}</div>
                  </div>
                ))}
              </div>
            </>
          )
        })()}
      </ReportSection>
      )}

      {/* SECCIÓN: REPORTE POR PROFESORA */}
      {(!esSecretaria && !esCoordinadora) && (
      <ReportSection
        titulo="Reporte por docente"
        subtitulo={`${profesoras.length} docentes activas`}
        onCSV={() => {
          const rows = [
            ['NEXT EZEIZA — REPORTE POR DOCENTE'],
            ['Generado:', new Date().toLocaleDateString('es-AR')],
            [''],
            ['Docente','Nivel','Hs/semana','Hs/mes','Tarifa/hora','Liquidación','Cursos a cargo'],
            ...profesoras.map(p => {
              const liq = (p.horas_semana||0)*4*(p.tarifa_hora||0)
              const cursosProf = cursos.filter(c => c.profesora_id === p.id)
              return [`${p.nombre} ${p.apellido}`, p.nivel, p.horas_semana, (p.horas_semana||0)*4, `$${p.tarifa_hora?.toLocaleString('es-AR')}`, `$${liq.toLocaleString('es-AR')}`, cursosProf.map(c=>c.nombre).join(' | ')]
            })
          ]
          const csv = rows.map((r:any[]) => r.map((c:any)=>`"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
          const blob = new Blob(['\uFEFF'+csv],{type:'text/csv;charset=utf-8;'})
          const url = URL.createObjectURL(blob); const el = document.createElement('a')
          el.href=url; el.download=`reporte_docentes_${new Date().toISOString().split('T')[0]}.csv`; el.click()
          URL.revokeObjectURL(url)
        }}
        onPDF={() => abrirPDF('Reporte por Docente', `
          <table><tr><th>Docente</th><th>Hs/sem</th><th>Tarifa/h</th><th>Liquidación</th><th>Cursos</th></tr>
          ${profesoras.map(p=>{
            const liq=(p.horas_semana||0)*4*(p.tarifa_hora||0)
            const cursosProf=cursos.filter(c=>c.profesora_id===p.id)
            return`<tr><td>${p.nombre} ${p.apellido}</td><td>${p.horas_semana}hs</td><td>$${p.tarifa_hora?.toLocaleString('es-AR')}</td><td style="font-weight:700;color:#652f8d">$${liq.toLocaleString('es-AR')}</td><td style="font-size:11px">${cursosProf.map(c=>c.nombre).join('<br>')}</td></tr>`
          }).join('')}
          <tr style="font-weight:bold;border-top:2px solid #652f8d"><td colspan="3">Total liquidación</td><td style="color:#652f8d">$${totalLiq.toLocaleString('es-AR')}</td><td></td></tr>
          </table>
        `)}
      >
        {profesoras.map(p => {
          const liq = (p.horas_semana||0)*4*(p.tarifa_hora||0)
          const cursosProf = cursos.filter(c => c.profesora_id === p.id)
          return (
            <div key={p.id} style={{padding:'12px 0',borderBottom:'1px solid var(--border)'}}>
              <div style={{display:'flex',alignItems:'center',gap:'10px',marginBottom:'6px'}}>
                <Av color={p.color} size={32}>{p.initials||`${p.nombre[0]}${p.apellido[0]}`}</Av>
                <div style={{flex:1}}>
                  <div style={{fontSize:'14px',fontWeight:600}}>{p.nombre} {p.apellido}</div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>{p.nivel} · {p.horas_semana}hs/sem · ${p.tarifa_hora?.toLocaleString('es-AR')}/h</div>
                </div>
                <div style={{fontSize:'15px',fontWeight:700,color:'var(--v)'}}>${liq.toLocaleString('es-AR')}</div>
              </div>
              {cursosProf.length > 0 && (
                <div style={{display:'flex',gap:'5px',flexWrap:'wrap',paddingLeft:'42px'}}>
                  {cursosProf.map(c=>(
                    <span key={c.id} style={{padding:'2px 8px',borderRadius:'8px',fontSize:'11px',fontWeight:500,background:'var(--vl)',color:'var(--v)'}}>{c.nombre}</span>
                  ))}
                </div>
              )}
            </div>
          )
        })}
      </ReportSection>
      )}

      {/* MÉTODOS DE PAGO */}
      <MetodosPagoSection alumnos={alumnos} mesActualNombre={mesActualNombre} anioActual={anioActual} />

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

// ── MÉTODOS DE PAGO ──
function MetodosPagoSection({ alumnos, mesActualNombre, anioActual }: any) {
  const { usuario } = useAuth()
  const esSecretaria = usuario?.rol === 'secretaria'
  const esCoordinadora = usuario?.rol === 'coordinadora'
  const esDirector = usuario?.rol === 'director'
  const [pagos, setPagos] = useState<any[]>([])
  const [mes, setMes] = useState(mesActualNombre)
  const [anio, setAnio] = useState(anioActual)
  const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  useEffect(() => {
    const sb = createClient()
    sb.from('pagos_alumnos').select('monto,metodo,alumno_id').eq('mes', mes).eq('anio', anio)
      .then(({ data }) => setPagos(data || []))
      .catch(() => {})
  }, [mes, anio])

  const metodos = ['Efectivo','Transferencia','MercadoPago']
  const totales = metodos.map(m => ({
    metodo: m,
    cantidad: pagos.filter(p => p.metodo === m).length,
    monto: pagos.filter(p => p.metodo === m).reduce((s, p) => s + (p.monto || 0), 0)
  }))
  const totalGeneral = pagos.reduce((s, p) => s + (p.monto || 0), 0)
  const IS = { padding:'8px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'13px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const
  const COLORES: Record<string,string> = { Efectivo: '#2d7a4f', Transferencia: '#1a73e8', MercadoPago: '#652f8d' }

  if (esSecretaria || esCoordinadora) return null
  return (
    <ReportSection titulo="Métodos de pago" subtitulo={`${pagos.length} pagos · ${mes} ${anio}`}
      onCSV={() => {
        const rows = [['NEXT EZEIZA — MÉTODOS DE PAGO'],[`${mes} ${anio}`],[''],['Método','Cantidad','Monto'],
          ...totales.map(t => [t.metodo, t.cantidad, `$${t.monto.toLocaleString('es-AR')}`]),
          ['','TOTAL', `$${totalGeneral.toLocaleString('es-AR')}`]]
        const csv = rows.map(r => r.map(c => `"${String(c)}"`).join(',')).join('\n')
        const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
        const url = URL.createObjectURL(blob)
        const a = document.createElement('a'); a.href=url; a.download=`metodos-${mes}-${anio}.csv`; a.click()
        URL.revokeObjectURL(url)
      }}
      onPDF={() => {
        const filas = totales.map(t => `<tr><td>${t.metodo}</td><td style="text-align:center">${t.cantidad}</td><td style="text-align:right;font-weight:700;color:${COLORES[t.metodo]}">$${t.monto.toLocaleString('es-AR')}</td><td style="text-align:right;color:#9b8eaa">${totalGeneral > 0 ? Math.round(t.monto/totalGeneral*100) : 0}%</td></tr>`).join('')
        abrirPDF(`Métodos de pago ${mes} ${anio}`, `<h2>Métodos de pago — ${mes} ${anio}</h2><p>${pagos.length} pagos · Total: $${totalGeneral.toLocaleString('es-AR')}</p><table><tr><th>Método</th><th>Cantidad</th><th>Monto</th><th>%</th></tr>${filas}</table>`)
      }}>
      <div style={{display:'flex',gap:'8px',marginBottom:'14px'}}>
        <select style={IS} value={mes} onChange={e => setMes(e.target.value)}>{MESES.map(m => <option key={m}>{m}</option>)}</select>
        <select style={IS} value={anio} onChange={e => setAnio(+e.target.value)}>{[2024,2025,2026,2027].map(y => <option key={y}>{y}</option>)}</select>
      </div>
      {totales.map(t => (
        <div key={t.metodo} style={{marginBottom:'12px'}}>
          <div style={{display:'flex',justifyContent:'space-between',fontSize:'13px',marginBottom:'5px'}}>
            <span style={{fontWeight:600,color:'var(--text)'}}>{t.metodo}</span>
            <span style={{fontWeight:700,color:COLORES[t.metodo]}}>${t.monto.toLocaleString('es-AR')} <span style={{fontSize:'11px',color:'var(--text3)',fontWeight:400}}>({t.cantidad} pagos)</span></span>
          </div>
          <div style={{height:'8px',background:'var(--border)',borderRadius:'10px',overflow:'hidden'}}>
            <div style={{height:'100%',width:`${totalGeneral > 0 ? Math.round(t.monto/totalGeneral*100) : 0}%`,background:COLORES[t.metodo],borderRadius:'10px'}} />
          </div>
        </div>
      ))}
      {pagos.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--text3)'}}>Sin pagos en {mes} {anio}</div>}
      {totalGeneral > 0 && <div style={{display:'flex',justifyContent:'space-between',paddingTop:'12px',borderTop:'1.5px solid var(--border)',fontWeight:700}}><span>Total recaudado</span><span style={{color:'var(--v)'}}>${totalGeneral.toLocaleString('es-AR')}</span></div>}
    </ReportSection>
  )
}

// ── Firma del director — lazy getter para no bloquear el módulo ──
let _firmaCache: string | null = null
function getFirmaDirector() {
  if (!_firmaCache) _firmaCache = 'data:image/png;base64,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'
  return _firmaCache
}


// ── BOLETÍN DIGITAL ──
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
    const sb = createClient()
    const al = alumnos.find((a: any) => a.id === selAlumno)
    if (!al) { setGenerando(false); return }
    const [exRes, cuRes] = await Promise.all([
      sb.from('notas_examenes').select('*, examenes(nombre,fecha)').eq('examenes.anio', anio),
      sb.from('cursos_alumnos').select('cursos(nombre)').eq('alumno_id', selAlumno).limit(1)
    ])
    const notas = (exRes.data || []).filter((n: any) => n.alumno_id === selAlumno)
    const curso = cuRes.data?.[0]?.cursos?.nombre || '—'
    const promedio = notas.length ? Math.round(notas.reduce((s: number, n: any) => s + (n.nota || 0), 0) / notas.length) : null
    const aprobados = notas.filter((n: any) => (n.nota || 0) >= 60 && !n.ausente).length
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Boletín ${al.nombre} ${al.apellido}</title>
    <style>body{font-family:Arial,sans-serif;padding:0;margin:0;background:#f5f0fa}
    .wrap{max-width:480px;margin:20px auto;background:white;border-radius:20px;overflow:hidden;box-shadow:0 8px 32px rgba(101,47,141,.15)}
    .hdr{background:linear-gradient(135deg,#652f8d,#8b4fc4);padding:24px;color:white;display:flex;align-items:center;gap:16px}
    .logo{font-size:18px;font-weight:900}.logo span{opacity:.7;font-weight:400}
    .av{width:50px;height:50px;border-radius:14px;background:rgba(255,255,255,.2);display:flex;align-items:center;justify-content:center;font-size:18px;font-weight:800;flex-shrink:0}
    .body{padding:20px}
    .sec-title{font-size:10px;font-weight:700;color:#9b8eaa;text-transform:uppercase;letter-spacing:.06em;margin-bottom:10px;padding-bottom:6px;border-bottom:1px solid #f0edf5}
    .kpis{display:flex;gap:10px;background:#f9f5fd;border-radius:12px;padding:14px;margin-bottom:16px}
    .kpi{flex:1;text-align:center}.kpi-val{font-size:22px;font-weight:800;color:#652f8d}.kpi-lab{font-size:10px;color:#9b8eaa;font-weight:600;text-transform:uppercase;margin-top:2px}
    .examen-row{display:flex;align-items:center;justify-content:space-between;padding:10px 0;border-bottom:1px solid #f0edf5}
    .nota{width:40px;height:40px;border-radius:12px;display:flex;align-items:center;justify-content:center;font-size:15px;font-weight:800}
    .ap{background:#e6f4ec;color:#2d7a4f}.de{background:#fdeaea;color:#c0392b}.aus{background:#fef3cd;color:#b45309}
    .footer{background:#faf7fd;padding:14px;text-align:center;font-size:11px;color:#9b8eaa;border-top:1px solid #f0edf5}
    @media print{body{background:white}.wrap{box-shadow:none;margin:0;border-radius:0}}
    </style></head><body><div class="wrap">
    <div class="hdr">
      <div class="av">${al.nombre[0]}${al.apellido[0]}</div>
      <div><div class="logo">Next <span>Ezeiza</span></div>
      <div style="font-size:15px;font-weight:800;margin-top:4px">${al.nombre} ${al.apellido}</div>
      <div style="font-size:12px;opacity:.8">${curso} · ${periodo} ${anio}</div>
      ${al.dni ? `<div style="font-size:11px;opacity:.65;margin-top:2px">DNI: ${al.dni}</div>` : ''}</div>
    </div>
    <div class="body">
      <div class="kpis">
        <div class="kpi"><div class="kpi-val">${nivelManual||al.nivel||'—'}</div><div class="kpi-lab">Nivel</div></div>
        <div class="kpi"><div class="kpi-val">${promedio ?? '—'}</div><div class="kpi-lab">Promedio</div></div>
        <div class="kpi"><div class="kpi-val">${aprobados}/${notas.length}</div><div class="kpi-lab">Aprobados</div></div>
      </div>
      <div class="sec-title">Evaluaciones</div>
      ${notas.length === 0 ? '<p style="color:#9b8eaa;font-size:13px">Sin exámenes registrados para este período.</p>' :
        notas.map((n: any) => {
          const cls = n.ausente ? 'aus' : (n.nota||0) >= 60 ? 'ap' : 'de'
          const estado = n.ausente ? 'Ausente' : (n.nota||0) >= 60 ? 'Aprobado' : 'Desaprobado'
          return `<div class="examen-row"><div><div style="font-size:13px;font-weight:700">${n.examenes?.nombre||'Examen'}</div><div style="font-size:11px;color:#9b8eaa;margin-top:2px">${n.examenes?.fecha ? new Date(n.examenes.fecha+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long'}) : '—'} · <span style="color:${cls === 'ap' ? '#2d7a4f' : cls === 'de' ? '#c0392b' : '#b45309'};font-weight:600">${estado}</span></div></div><div class="nota ${cls}">${n.ausente ? '—' : n.nota ?? '—'}</div></div>`
        }).join('')}
    </div>
    <div class="footer">Next Ezeiza English Institute · Ezeiza, Buenos Aires · ${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div>
    <div style="padding:20px;text-align:center;border-top:1px solid #f0edf5"><img src="${getFirmaDirector()}" style="width:110px;height:55px;object-fit:contain;display:block;margin:0 auto 6px" /><div style="font-size:13px;font-weight:700;color:#1a1020">Patricio Manganella</div><div style="font-size:11px;color:#9b8eaa">Director</div></div>
    </div><script>setTimeout(function(){window.print()},400)</script></body></html>`
    const blob = new Blob([html], {type:'text/html;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
    setGenerando(false)
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

// ── CERTIFICADO DE ASISTENCIA ──
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
    const al = alumnos.find((a: any) => a.id === selAlumno)
    if (!al) { setGenerando(false); return }
    const sb = createClient()
    const cuRes = await sb.from('cursos_alumnos').select('cursos(nombre)').eq('alumno_id', selAlumno).limit(1)
    const curso = cuRes.data?.[0]?.cursos?.nombre || '—'
    const fmtDesde = new Date(desde+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})
    const fmtHasta = new Date(hasta+'T12:00:00').toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})
    const hoy = new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})
    const num = Math.floor(Math.random()*9000)+1000
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Certificado ${al.nombre} ${al.apellido}</title>
    <style>body{font-family:Arial,sans-serif;padding:40px;margin:0;background:white}
    .hdr{text-align:center;border-bottom:4px solid #652f8d;padding-bottom:20px;margin-bottom:28px}
    .logo{font-size:24px;font-weight:900;color:#1a1020}.logo span{color:#652f8d}
    .inst{font-size:12px;color:#9b8eaa;letter-spacing:.1em;text-transform:uppercase;margin-top:4px}
    h1{font-size:16px;font-weight:800;text-transform:uppercase;letter-spacing:.1em;color:#652f8d;text-align:center;margin:28px 0 20px}
    .cuerpo{font-size:14px;color:#1a1020;line-height:1.9;text-align:center;max-width:500px;margin:0 auto 28px}
    .nombre{font-size:26px;font-weight:900;color:#1a1020;font-style:italic;display:block;margin:8px 0}
    .datos{display:flex;justify-content:center;gap:32px;background:#f9f5fd;border-radius:14px;padding:16px;margin:20px 0 28px}
    .dato{text-align:center}.dato-val{font-size:20px;font-weight:800;color:#652f8d}.dato-lab{font-size:10px;color:#9b8eaa;font-weight:700;text-transform:uppercase;margin-top:3px}
    .firmas{display:flex;justify-content:center;gap:60px;margin-top:40px;padding-top:20px;border-top:1px solid #f0edf5}
    .firma{text-align:center}.firma-linea{width:120px;border-top:1.5px solid #1a1020;margin:0 auto 8px}
    .firma-nombre{font-size:12px;font-weight:700;color:#1a1020}.firma-cargo{font-size:11px;color:#9b8eaa}
    .sello{width:70px;height:70px;border-radius:50%;border:3px solid #652f8d;display:flex;align-items:center;justify-content:center;margin:0 auto;font-size:10px;font-weight:700;color:#652f8d;text-align:center;line-height:1.3}
    .num{font-size:11px;color:#9b8eaa;text-align:right;margin-bottom:4px}
    @media print{body{padding:24px}}
    </style></head><body>
    <div class="num">Cert. N° ${num} · ${hoy}</div>
    <div class="hdr"><div class="logo">Next <span>Ezeiza</span></div><div class="inst">English Institute</div></div>
    <h1>Certificado de ${tipo}</h1>
    <div class="cuerpo">
      La dirección del instituto certifica que<br>
      <span class="nombre">${al.nombre} ${al.apellido}</span>${al.dni ? ` <span style="font-size:14px;font-weight:400;font-style:normal;color:#9b8eaa">DNI: ${al.dni}</span>` : ''}
      es alumno/a regular del curso de inglés <strong>${curso}</strong>,
      con asistencia registrada en el período comprendido entre el <strong>${fmtDesde}</strong> y el <strong>${fmtHasta}</strong>.
      ${destinatario ? `<br><br>El presente certificado se emite a solicitud del/la interesado/a para ser presentado ante <strong>${destinatario}</strong>.` : ''}
    </div>
    <div class="datos">
      <div class="dato"><div class="dato-val">${nivelManual||al.nivel||'—'}</div><div class="dato-lab">Nivel</div></div>
      <div class="dato"><div class="dato-val">${curso}</div><div class="dato-lab">Curso</div></div>
    </div>
    <div style="font-size:12px;color:#9b8eaa;text-align:center;margin-bottom:32px">Ezeiza, Buenos Aires · ${hoy}</div>
    <div class="firmas">
      <div class="firma"><div class="sello">NEXT<br>EZEIZA<br>★</div></div>
      <div class="firma"><img src="${getFirmaDirector()}" style="width:110px;height:55px;object-fit:contain;display:block;margin:0 auto 4px" /><div class="firma-nombre">Patricio Manganella</div><div class="firma-cargo">Director · Next Ezeiza</div></div>
    </div>
    <script>setTimeout(function(){window.print()},400)</script></body></html>`
    const blob = new Blob([html], {type:'text/html;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
    setGenerando(false)
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
