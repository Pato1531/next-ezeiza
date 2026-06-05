'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useAlumnos, useProfesoras, useCursos, useMiProfesora, store } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'
import { showToast } from '../Toast'
import { apiHeaders } from '@/lib/hooks'

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
  const { miProfesora } = useMiProfesora()

  const [alumnosSinCurso, setAlumnosSinCurso] = useState(0)
  const [cuotasPendientes, setCuotasPendientes] = useState(0)
  const [alertasAusencia, setAlertasAusencia] = useState<any[]>([])
  const [alertasTest, setAlertasTest] = useState<any[]>([])
  const [resolviendoTest, setResolviendoTest] = useState<string|null>(null)
  const [confirmandoTest, setConfirmandoTest] = useState<string|null>(null)
  const [loading, setLoading] = useState(true)
  const [resMesProfIdx, setResMesProfIdx] = useState(new Date().getMonth())
  const [resMesProfAnio, setResMesProfAnio] = useState(new Date().getFullYear())
  const [resumenProfesoras, setResumenProfesoras] = useState<any[]>([])
  const [loadingResumenProf, setLoadingResumenProf] = useState(false)
  const [proximosEventos, setProximosEventos] = useState<any[]>([])
  const [cumpleanos, setCumpleanos] = useState<any[]>([])
  const [asistModal, setAsistModal] = useState<{curso: any; alumnos: any[]} | null>(null)
  const [asistEstados, setAsistEstados] = useState<Record<string,'P'|'A'|'T'>>({})
  const [asistTema, setAsistTema] = useState('')
  const [asistGuardando, setAsistGuardando] = useState(false)

  // ── Estado extra para vista profesora ────────────────────────────────────
  const [clasesYaRegistradas, setClasesYaRegistradas] = useState<Set<string>>(new Set())
  const [totalAlumnosProf, setTotalAlumnosProf] = useState(0)
  const [alumnosAusentesProf, setAlumnosAusentesProf] = useState<any[]>([])
  const [examensPendientes, setExamensPendientes] = useState<any[]>([])

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
    const matchDia = diaVariants.some(v => d.includes(v))
    // Si es profesora, solo mostrar sus propios cursos
    if (usuario?.rol === 'profesora' && miProfesora) {
      return matchDia && c.profesora_id === miProfesora.id
    }
    return matchDia
  }).sort((a,b) => (a.hora_inicio||'').localeCompare(b.hora_inicio||''))

  useEffect(() => {
    if (usuario?.rol !== 'profesora' || !miProfesora?.id) return
    const cargarDatosProf = async () => {
      const sb = createClient()
      // Fecha local (no UTC) para evitar mismatch de timezone
      const ahora = new Date()
      const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`

      // 1. Cursos de esta profesora
      const { data: cursosProf } = await sb.from('cursos').select('id,nombre').eq('profesora_id', miProfesora.id)
      const cursoIds = (cursosProf || []).map((c: any) => c.id)
      if (cursoIds.length === 0) return

      // 2. Total alumnos únicos
      const { data: rels } = await sb.from('cursos_alumnos').select('alumno_id').in('curso_id', cursoIds)
      const alumnoIds = [...new Set((rels || []).map((r: any) => r.alumno_id))]
      setTotalAlumnosProf(alumnoIds.length)

      // 3. Clases ya registradas hoy por esta profesora
      const { data: clasesHoy } = await sb.from('clases').select('id,curso_id').in('curso_id', cursoIds).eq('fecha', hoyStr)
      setClasesYaRegistradas(new Set((clasesHoy || []).map((c: any) => c.curso_id)))

      // 4. Alumnos con 2+ ausencias consecutivas en sus cursos
      const alertasProf: any[] = []
      await Promise.all(cursoIds.map(async (curso_id: string) => {
        const { data: clases } = await sb.from('clases').select('id').eq('curso_id', curso_id).order('fecha', { ascending: false }).limit(8)
        if (!clases?.length) return
        const claseIds = clases.map((c: any) => c.id)
        const alumnosCurso = (rels || []).filter((r: any) => r.alumno_id).map((r: any) => r.alumno_id)
        const { data: asist } = await sb.from('asistencia_clases').select('alumno_id,clase_id,estado').in('clase_id', claseIds).in('alumno_id', alumnosCurso)
        const porAlumno: Record<string, Record<string, string>> = {}
        asist?.forEach((a: any) => {
          if (!porAlumno[a.alumno_id]) porAlumno[a.alumno_id] = {}
          porAlumno[a.alumno_id][a.clase_id] = a.estado
        })
        alumnosCurso.forEach((alumno_id: string) => {
          const reg = porAlumno[alumno_id] || {}
          let cons = 0
          for (const clase of clases) {
            const estado = reg[clase.id]
            if (estado === 'A') cons++
            else if (estado === 'P' || estado === 'T') break
          }
          if (cons >= 2 && !alertasProf.find(a => a.id === alumno_id)) {
            alertasProf.push({ id: alumno_id, consecutivas: cons })
          }
        })
      }))
      // Resolver nombres
      if (alertasProf.length > 0) {
        const { data: als } = await sb.from('alumnos').select('id,nombre,apellido,color').in('id', alertasProf.map(a => a.id))
        setAlumnosAusentesProf(alertasProf.map(a => {
          const al = als?.find((x: any) => x.id === a.id)
          return { ...a, nombre: al?.nombre || '—', apellido: al?.apellido || '', color: al?.color || '#652f8d' }
        }).slice(0, 5))
      }

      // 5. Exámenes próximos sin notas cargadas (próximos 30 días)
      const en30 = new Date(); en30.setDate(en30.getDate() + 30)
      const { data: exams } = await sb.from('examenes').select('id,nombre,fecha,tipo,cursos(nombre)').in('curso_id', cursoIds).gte('fecha', hoyStr).lte('fecha', en30.toISOString().split('T')[0]).order('fecha').limit(5)
      setExamensPendientes(exams || [])
    }
    cargarDatosProf()
  }, [miProfesora?.id, usuario?.rol])

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
      const ahora = new Date()
      const hoyStr = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
      const { data } = await sb.from('agenda_eventos')
        .select('*').gte('fecha', hoyStr).order('fecha').order('hora_inicio').limit(20)
      const todos = data || []
      // Filtrar según visibilidad del usuario — mismo criterio que Agenda.tsx
      const rol = usuario?.rol
      const uid = usuario?.id
      const esCoord = rol === 'director' || rol === 'coordinadora' || rol === 'secretaria'
      const visibles = todos.filter((ev: any) => {
        if (esCoord) return true
        if (ev.convocados === 'todos') return true
        if (ev.convocados === 'individual') {
          const lista: string[] = Array.isArray(ev.destinatarios_ids)
            ? ev.destinatarios_ids.map((x: any) => String(x))
            : []
          return lista.length > 0 && lista.includes(String(uid || ''))
        }
        if (ev.convocados === 'docentes' && rol === 'profesora') return true
        if (ev.convocados === 'coordinacion' && rol === 'coordinadora') return true
        if (ev.convocados === 'secretaria' && rol === 'secretaria') return true
        return false
      })
      setProximosEventos(visibles.slice(0, 5))
    }
    cargarEventos()
  }, [usuario?.id, usuario?.rol])

  useEffect(() => {
    const cargarCumpleanos = async () => {
      const sb = createClient()
      const hoy = new Date()
      let query

      if (usuario?.rol === 'profesora' && miProfesora?.id) {
        // Profesora: solo alumnos de sus propios cursos
        const { data: cursosProf } = await sb
          .from('cursos').select('id').eq('profesora_id', miProfesora.id)
        const cursoIds = (cursosProf || []).map((c: any) => c.id)
        if (cursoIds.length === 0) { setCumpleanos([]); return }
        const { data: relaciones } = await sb
          .from('cursos_alumnos').select('alumno_id').in('curso_id', cursoIds)
        const alumnoIds = [...new Set((relaciones || []).map((r: any) => r.alumno_id))]
        if (alumnoIds.length === 0) { setCumpleanos([]); return }
        query = sb.from('alumnos')
          .select('id, nombre, apellido, fecha_nacimiento, color')
          .eq('activo', true).not('fecha_nacimiento', 'is', null)
          .in('id', alumnoIds)
      } else {
        // Director/coordinadora/secretaria: todos los alumnos
        query = sb.from('alumnos')
          .select('id, nombre, apellido, fecha_nacimiento, color')
          .eq('activo', true).not('fecha_nacimiento', 'is', null)
      }

      const { data: als } = await query
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
  }, [miProfesora?.id, usuario?.rol])

  useEffect(() => {
    if (!alumnos.length) return
    cargarAlertas()
  }, [alumnos.length, usuario?.instituto_id])

  // Alertas de test: useEffect propio, no depende de alumnos.length
  // Para profesora espera a que miProfesora esté cargada y filtra server-side
  useEffect(() => {
    if (!usuario?.instituto_id) return
    if (usuario?.rol === 'profesora' && !miProfesora?.id) return
    const cargar = async () => {
      try {
        const h: Record<string,string> = { ...apiHeaders() }
        if (usuario?.rol === 'profesora' && miProfesora?.id) h['x-profesora-id'] = miProfesora.id
        const res = await fetch('/api/alertas-test', { headers: h })
        if (res.ok) { const j = await res.json(); setAlertasTest(j.data || []) }
      } catch {}
    }
    cargar()
  }, [usuario?.instituto_id, miProfesora?.id])

  useEffect(() => {
    if (!usuario?.rol || !['director','coordinadora'].includes(usuario.rol)) return
    if (!profesoras.length) return
    if (!usuario?.instituto_id) return
    const cargar = async () => {
      setLoadingResumenProf(true)
      const sb = createClient()
      const mesStr = String(resMesProfIdx + 1).padStart(2,'0')
      const inicioMes = `${resMesProfAnio}-${mesStr}-01`
      const finMes = new Date(resMesProfAnio, resMesProfIdx + 1, 0).toISOString().split('T')[0]

      const [cursosRes, clasesRes] = await Promise.all([
        sb.from('cursos').select('id,nombre,profesora_id,hora_inicio,hora_fin')
          .eq('instituto_id', usuario.instituto_id),
        sb.from('clases').select('id,curso_id')
          .eq('instituto_id', usuario.instituto_id)
          .gte('fecha', inicioMes).lte('fecha', finMes),
      ])
      const todosCursos = cursosRes.data || []
      const clasesMes = clasesRes.data || []

      if (!clasesMes.length) { setResumenProfesoras([]); setLoadingResumenProf(false); return }

      const claseIds = clasesMes.map((c:any) => c.id)
      const { data: asistMes } = await sb.from('asistencia_clases')
        .select('clase_id,estado').in('clase_id', claseIds)

      const resultado = profesoras
        .map((prof:any) => {
          const cursosDeProd = todosCursos.filter((c:any) => c.profesora_id === prof.id)
          const cursoIdsDeProd = new Set(cursosDeProd.map((c:any) => c.id))
          const clasesDeProd = clasesMes.filter((cl:any) => cursoIdsDeProd.has(cl.curso_id))
          if (!clasesDeProd.length) return null
          const claseIdsDeProd = new Set(clasesDeProd.map((cl:any) => cl.id))
          const asistDeProd = (asistMes||[]).filter((a:any) => claseIdsDeProd.has(a.clase_id))
          const presentes = asistDeProd.filter((a:any) => a.estado === 'P' || a.estado === 'T').length
          const asistPct = asistDeProd.length > 0 ? Math.round((presentes / asistDeProd.length) * 100) : 0
          let horas = 0
          clasesDeProd.forEach((cl:any) => {
            const curso = cursosDeProd.find((c:any) => c.id === cl.curso_id)
            if (curso?.hora_inicio && curso?.hora_fin) {
              const [h1,m1] = curso.hora_inicio.split(':').map(Number)
              const [h2,m2] = curso.hora_fin.split(':').map(Number)
              horas += ((h2*60+m2) - (h1*60+m1)) / 60
            }
          })
          return { id: prof.id, nombre: prof.nombre, apellido: prof.apellido, color: prof.color||'#652f8d', clases: clasesDeProd.length, horas: Math.round(horas*10)/10, asistPct, cursos: cursosDeProd.length }
        })
        .filter(Boolean)
        .sort((a:any,b:any) => b.clases - a.clases)

      setResumenProfesoras(resultado as any[])
      setLoadingResumenProf(false)
    }
    cargar()
  }, [usuario?.rol, usuario?.instituto_id, profesoras.length, resMesProfIdx, resMesProfAnio])

  const abrirAsistencia = async (curso: any) => {
    const sb = createClient()
    const { data } = await sb.from('cursos_alumnos')
      .select('alumnos(id, nombre, apellido, color)')
      .eq('curso_id', curso.id)
    const lista = (data || []).map((r: any) => r.alumnos).filter(Boolean)
    const estados: Record<string,'P'|'A'|'T'> = {}
    lista.forEach((a: any) => { estados[a.id] = 'P' })
    setAsistEstados(estados)
    setAsistTema('')
    setAsistModal({ curso, alumnos: lista })
  }

  const guardarAsistencia = async () => {
    if (!asistModal) return
    setAsistGuardando(true)
    const ahora = new Date()
    const hoy = `${ahora.getFullYear()}-${String(ahora.getMonth()+1).padStart(2,'0')}-${String(ahora.getDate()).padStart(2,'0')}`
    const sb = createClient()
    try {
      // Crear clase
      const { data: claseData, error: claseErr } = await sb.from('clases').insert({
        curso_id: asistModal.curso.id,
        fecha: hoy,
        tema: asistTema.trim() || 'Clase del día',
      }).select().single()
      if (claseErr) throw claseErr
      // Registrar asistencia de cada alumno
      const inserts = asistModal.alumnos.map((a: any) => ({
        clase_id: claseData.id,
        alumno_id: a.id,
        estado: asistEstados[a.id] || 'P',
      }))
      await sb.from('asistencia_clases').insert(inserts)
      showToast(`✓ Asistencia de ${asistModal.curso.nombre} guardada`)
      setClasesYaRegistradas(prev => new Set([...prev, asistModal.curso.id]))
      setAsistModal(null)
    } catch (e: any) {
      showToast('Error al guardar: ' + e.message, 'error')
    }
    setAsistGuardando(false)
  }

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
          if (consecutivas >= 2 && !alertasMap[alumno_id]) {
            const al = alumnos.find(a => a.id === alumno_id)
            const cur = cursos.find(c => c.id === curso_id)
            if (al) {
              alertasMap[alumno_id] = {
                nombre: al.nombre, apellido: al.apellido,
                color: al.color || '#652f8d',
                consecutivas,
                curso: cur?.nombre || '',
              }
            } else {
              // Alumno no está en el store aún — guardarlo con datos mínimos para buscarlo después
              alertasMap[alumno_id] = {
                nombre: alumno_id, apellido: '',
                color: '#652f8d', consecutivas,
                curso: cur?.nombre || '',
                _pendingLookup: true,
              } as any
            }
          }
        })
      }))

      // Resolver alumnos que no estaban en el store
      const pendientes = Object.entries(alertasMap).filter(([, v]) => (v as any)._pendingLookup)
      if (pendientes.length > 0) {
        const ids = pendientes.map(([id]) => id)
        const { data: alumnosDB } = await sb.from('alumnos').select('id,nombre,apellido,color').in('id', ids)
        alumnosDB?.forEach((a: any) => {
          if (alertasMap[a.id]) {
            alertasMap[a.id] = { ...alertasMap[a.id], nombre: a.nombre, apellido: a.apellido, color: a.color || '#652f8d' }
            delete (alertasMap[a.id] as any)._pendingLookup
          }
        })
      }
      setAlertasAusencia(Object.values(alertasMap).filter((v: any) => !v._pendingLookup).slice(0, 10))
    } catch (e) {
      console.error('[Dashboard] alertas ausencias:', e)
    }

    // alertas-test cargadas en su propio useEffect

    setLoading(false)
  }

  // ── Cumpleaños del equipo (colaboradores) — próximos 60 días ──
  const cumpleanosEquipo = (() => {
    const hoyMs = new Date().setHours(0, 0, 0, 0)
    return profesoras
      .filter((p: any) => !!p.fecha_nacimiento)
      .map((p: any) => {
        const [, mm, dd] = (p.fecha_nacimiento as string).split('-')
        const m = parseInt(mm) - 1
        const d = parseInt(dd)
        const anio = new Date().getFullYear()
        let cumple = new Date(anio, m, d).setHours(0, 0, 0, 0)
        if (cumple < hoyMs) cumple = new Date(anio + 1, m, d).setHours(0, 0, 0, 0)
        const diff = Math.round((cumple - hoyMs) / 86400000)
        return { ...p, diasParaCumple: diff, fechaStr: `${dd}/${mm}` }
      })
      .filter((p: any) => p.diasParaCumple <= 120)
      .sort((a: any, b: any) => a.diasParaCumple - b.diasParaCumple)
  })()

  // ── VISTA PROFESORA ──
  if (usuario?.rol === 'profesora') {
    const clasesHoyProf = cursosHoy.length
    const clasesRegistradas = cursosHoy.filter(c => clasesYaRegistradas.has(c.id)).length
    const clasesPendientes = clasesHoyProf - clasesRegistradas

    return (
      <div className="fade-in">
        {/* Saludo */}
        <div style={{marginBottom:'20px'}}>
          <div style={{fontSize:'13px',color:'var(--text2)',fontWeight:500}}>Hola, {usuario?.nombre.split(' ')[0]} 👋</div>
          <div style={{fontSize:'22px',fontWeight:700,letterSpacing:'-.3px',marginTop:'2px'}}>
            {today.toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})}
          </div>
        </div>

        {/* KPIs rápidos */}
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'20px'}}>
          <KpiCard val={totalAlumnosProf} label="Mis alumnos" color="var(--v)" />
          <KpiCard val={cursosHoy.length} label={cursosHoy.length === 1 ? 'Clase hoy' : 'Clases hoy'} color="var(--v)" />
        </div>

        {/* Estado asistencia del día */}
        {cursosHoy.length > 0 && (
          <div style={{padding:'13px 16px',background: clasesPendientes === 0 ? 'var(--greenl)' : 'var(--amberl)',border:`1.5px solid ${clasesPendientes === 0 ? '#a3e0bc' : '#e8d080'}`,borderRadius:'14px',marginBottom:'18px',display:'flex',alignItems:'center',gap:'10px'}}>
            <span style={{fontSize:'18px'}}>{clasesPendientes === 0 ? '✅' : '📋'}</span>
            <div style={{flex:1}}>
              <div style={{fontSize:'13.5px',fontWeight:700,color:clasesPendientes === 0 ? 'var(--green)' : 'var(--amber)'}}>
                {clasesPendientes === 0
                  ? 'Asistencia del día completa'
                  : `${clasesPendientes} clase${clasesPendientes !== 1 ? 's' : ''} sin registrar hoy`}
              </div>
              <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>
                {clasesRegistradas} de {clasesHoyProf} registrada{clasesHoyProf !== 1 ? 's' : ''}
              </div>
            </div>
          </div>
        )}

        {/* Clases de hoy con botón asistencia */}
        <SL style={{marginBottom:'10px'}}>{diaHoy ? `Clases de hoy · ${diaHoy}` : 'Clases del día'}</SL>
        {cursosHoy.length === 0 ? (
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'20px',textAlign:'center',color:'var(--text3)',marginBottom:'18px'}}>
            {today.getDay() === 0 ? '🌅 Hoy es domingo' : 'No hay clases programadas para hoy'}
          </div>
        ) : (
          <div style={{marginBottom:'18px'}}>
            {cursosHoy.map(c => {
              const col = NIVEL_COL[c.nivel] ?? NIVEL_COL['Básico']
              const yaRegistrada = clasesYaRegistradas.has(c.id)
              return (
                <div key={c.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:`1.5px solid ${yaRegistrada ? '#a3e0bc' : 'var(--border)'}`,borderRadius:'14px',marginBottom:'8px'}}>
                  <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
                    <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{(c.nivel||'').slice(0,3).toUpperCase()}</span>
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
                    <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
                  </div>
                  {yaRegistrada
                    ? <span style={{padding:'5px 10px',background:'var(--greenl)',color:'var(--green)',borderRadius:'8px',fontSize:'11px',fontWeight:700,flexShrink:0}}>✓ Cargada</span>
                    : <button onClick={() => abrirAsistencia(c)} style={{padding:'6px 11px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'8px',fontSize:'11px',fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>Asistencia</button>
                  }
                </div>
              )
            })}
          </div>
        )}

        {/* Alumnos con ausencias consecutivas */}
        {alumnosAusentesProf.length > 0 && (
          <div style={{marginBottom:'20px'}}>
            <SL style={{marginBottom:'10px'}}>Ausencias a seguir</SL>
            {alumnosAusentesProf.map((al: any, i: number) => (
              <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'11px 14px',background:'var(--white)',border:'1.5px solid #f5c5c5',borderRadius:'14px',marginBottom:'8px'}}>
                <Av color={al.color} nombre={al.nombre} apellido={al.apellido} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>{al.consecutivas} faltas seguidas</div>
                </div>
                <span style={{padding:'3px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',flexShrink:0}}>{al.consecutivas} ausencias</span>
              </div>
            ))}
          </div>
        )}

        {/* Alertas de test de unidades — solo para la profesora */}
        {alertasTest.length > 0 && (
          <div style={{marginBottom:'20px'}}>
            <SL style={{marginBottom:'10px'}}>Evaluaciones pendientes</SL>
            {alertasTest.map((a: any) => (
              <div key={a.id} style={{
                display:'flex',alignItems:'flex-start',gap:'12px',padding:'12px 14px',
                background:'var(--white)',border:'1.5px solid #c4b5fd',borderRadius:'14px',marginBottom:'8px'
              }}>
                <span style={{fontSize:'20px',flexShrink:0}}>📝</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:700,color:'#5b21b6',marginBottom:'2px'}}>
                    Evaluación pendiente — {a.curso_nombre}
                  </div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>
                    {a.unidades?.join(' · ')}
                  </div>
                </div>
                <button
                  onClick={() => marcarTestTomado(a.id)}
                  disabled={resolviendoTest === a.id}
                  style={{
                    padding:'5px 12px',borderRadius:'20px',border:'none',cursor:'pointer',
                    background: confirmandoTest === a.id ? '#fef3c7' : '#ede9fe',
                    color: confirmandoTest === a.id ? '#b45309' : '#5b21b6',
                    fontSize:'11px',fontWeight:700,flexShrink:0,
                    opacity: resolviendoTest === a.id ? 0.5 : 1,
                    transition:'all .2s'
                  }}
                >
                  {resolviendoTest === a.id ? 'Guardando...' : confirmandoTest === a.id ? '¿Confirmás? Tocá de nuevo' : 'Marcar como tomado'}
                </button>
              </div>
            ))}
          </div>
        )}

        {/* Exámenes próximos */}
        {examensPendientes.length > 0 && (
          <div style={{marginBottom:'20px'}}>
            <SL style={{marginBottom:'10px'}}>Próximos exámenes</SL>
            {examensPendientes.map((ex: any) => {
              const fechaEx = new Date(ex.fecha + 'T12:00:00')
              const diff = Math.round((fechaEx.getTime() - new Date().setHours(0,0,0,0)) / 86400000)
              const esHoy = diff === 0
              return (
                <div key={ex.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'11px 14px',background:'var(--white)',border:`1.5px solid ${esHoy ? '#d4a8e8' : 'var(--border)'}`,borderRadius:'14px',marginBottom:'8px'}}>
                  <div style={{width:40,height:40,borderRadius:12,background:'#f2e8f9',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'18px',flexShrink:0}}>📝</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13.5px',fontWeight:600}}>{ex.nombre}</div>
                    <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'2px'}}>
                      {(ex.cursos as any)?.nombre || ''} · {ex.tipo === 'midterm' ? 'Midterm' : ex.tipo === 'final' ? 'Final' : ex.tipo}
                    </div>
                  </div>
                  <div style={{textAlign:'right',flexShrink:0}}>
                    <div style={{fontSize:'12px',fontWeight:700,color: esHoy ? 'var(--v)' : 'var(--text2)'}}>
                      {esHoy ? 'Hoy' : diff === 1 ? 'Mañana' : `En ${diff}d`}
                    </div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>{fmt(ex.fecha)}</div>
                  </div>
                </div>
              )
            })}
          </div>
        )}

        {/* Cumpleaños próximos de sus alumnos */}
        {cumpleanos.length > 0 && (
          <div style={{marginBottom:'20px'}}>
            <SL style={{marginBottom:'10px'}}>Cumpleaños de mis alumnos</SL>
            <div style={{background:'var(--white)',border:'1.5px solid #fce7f3',borderRadius:'16px',overflow:'hidden'}}>
              {cumpleanos.slice(0,5).map((cu:any,idx:number) => (
                <div key={cu.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 16px',borderBottom:idx < Math.min(cumpleanos.length,5)-1 ?'1px solid #fce7f3':'none',background:cu.diasParaCumple===0?'#fff0f8':'transparent'}}>
                  <Av color={cu.color||'#db2777'} nombre={cu.nombre} apellido={cu.apellido} size={34} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:600}}>{cu.nombre} {cu.apellido}</div>
                    <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>
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

        {/* Cumpleaños del equipo */}
        {cumpleanosEquipo.length > 0 && (
          <div style={{marginBottom:'20px'}}>
            <SL style={{marginBottom:'10px'}}>Cumpleaños del equipo</SL>
            <div style={{background:'var(--white)',border:'1.5px solid #fce7f3',borderRadius:'16px',overflow:'hidden'}}>
              {cumpleanosEquipo.map((co: any, idx: number) => (
                <div key={co.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 16px',
                  borderBottom:idx<cumpleanosEquipo.length-1?'1px solid #fce7f3':'none',
                  background:co.diasParaCumple===0?'#fff0f8':'transparent'}}>
                  <Av color={co.color||'#db2777'} nombre={co.nombre} apellido={co.apellido} size={34} />
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'13px',fontWeight:600}}>{co.nombre} {co.apellido}</div>
                    <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>
                      {co.diasParaCumple===0 ? <span style={{color:'#db2777',fontWeight:700}}>🎉 Hoy</span>
                      : co.diasParaCumple===1 ? <span style={{color:'#db2777',fontWeight:600}}>Mañana</span>
                      : `En ${co.diasParaCumple} días`}
                    </div>
                  </div>
                  <div style={{background:'#fce7f3',color:'#db2777',padding:'3px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:700,flexShrink:0}}>{co.fechaStr}</div>
                </div>
              ))}
            </div>
          </div>
        )}

        {/* Próximos eventos */}
        {proximosEventos.length > 0 && (
          <>
            <SL style={{marginBottom:'10px'}}>Próximos eventos</SL>
            <div style={{marginBottom:'18px'}}>
              {proximosEventos.map((ev:any) => <EventoCard key={ev.id} ev={ev} />)}
            </div>
          </>
        )}

        {asistModal && (
          <ModalAsistencia
            modal={asistModal}
            estados={asistEstados}
            setEstados={setAsistEstados}
            tema={asistTema}
            setTema={setAsistTema}
            guardando={asistGuardando}
            onGuardar={guardarAsistencia}
            onCerrar={() => setAsistModal(null)}
          />
        )}
      </div>
    )
  }

  // ── VISTA GENERAL ──
  const marcarTestTomado = async (id: string) => {
    // Primer toque: mostrar confirmación
    if (confirmandoTest !== id) {
      setConfirmandoTest(id)
      setTimeout(() => setConfirmandoTest(p => p === id ? null : p), 4000)
      return
    }
    // Segundo toque: ejecutar
    setConfirmandoTest(null)
    setResolviendoTest(id)
    try {
      await fetch('/api/alertas-test', {
        method: 'PATCH',
        headers: apiHeaders(),
        body: JSON.stringify({ id }),
      })
      setAlertasTest(prev => prev.filter(a => a.id !== id))
    } catch (e) {
      console.error('[Dashboard] marcar test tomado:', e)
    }
    setResolviendoTest(null)
  }

  // Alertas de test filtradas por rol
  const alertasTestDocente = alertasTest.filter((a: any) => a.profesora_id === miProfesora?.id)
  const alertasTestGestion = alertasTest // director, coordinadora y secretaria ven todas

  const alertasUrgentes = alertasAusencia.length > 0 || alumnosSinCurso > 0 || cuotasPendientes > 0 || cumpleanos.some((c:any) => c.diasParaCumple === 0) || alertasTest.length > 0

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
              {[alertasAusencia.length>0,alumnosSinCurso>0,cuotasPendientes>0].filter(Boolean).length + cumpleanos.filter((c:any)=>c.diasParaCumple===0).length + alertasTest.length} pendiente{[alertasAusencia.length>0,alumnosSinCurso>0,cuotasPendientes>0].filter(Boolean).length + cumpleanos.filter((c:any)=>c.diasParaCumple===0).length + alertasTest.length !== 1 ? 's' : ''}
            </span>
          </div>
          <div style={{display:'flex',flexDirection:'column',gap:'8px'}}>
            {alertasAusencia.length > 0 && (
              <Alerta tipo="red" icono="⚠">
                <strong>{alertasAusencia.length} alumno{alertasAusencia.length!==1?'s':''}</strong> con ausencias consecutivas
              </Alerta>
            )}

            {/* Detalle expandido de ausencias — visible para director, secretaria, coordinadora */}
            {alertasAusencia.length > 0 && (usuario?.rol === 'director' || usuario?.rol === 'secretaria' || usuario?.rol === 'coordinadora') && (
              <div style={{display:'flex',flexDirection:'column',gap:'6px',marginTop:'2px'}}>
                {alertasAusencia.map((al:any, i:number) => (
                  <div key={i} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 14px',background:'var(--white)',border:'1.5px solid #f5c5c5',borderRadius:'14px'}}>
                    <Av color={al.color} nombre={al.nombre} apellido={al.apellido} size={36} />
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'13.5px',fontWeight:600}}>{al.nombre} {al.apellido}</div>
                      <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'1px'}}>
                        {al.curso ? al.curso + ' · ' : ''}{al.consecutivas} falta{al.consecutivas!==1?'s':''} seguida{al.consecutivas!==1?'s':''}
                      </div>
                    </div>
                    <span style={{padding:'3px 8px',borderRadius:'10px',fontSize:'11px',fontWeight:600,background:'var(--redl)',color:'var(--red)',flexShrink:0}}>
                      {al.consecutivas}×
                    </span>
                  </div>
                ))}
              </div>
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

            {/* ── Alertas test de unidades — docente ve sus propios cursos ── */}
            {usuario?.rol === 'profesora' && alertasTestDocente.map((a: any) => (
              <div key={a.id} style={{
                display:'flex',alignItems:'flex-start',gap:'12px',padding:'12px 14px',
                background:'var(--white)',border:'1.5px solid #c4b5fd',borderRadius:'14px'
              }}>
                <span style={{fontSize:'20px',flexShrink:0}}>📝</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:700,color:'#5b21b6',marginBottom:'2px'}}>
                    Evaluación pendiente — {a.curso_nombre}
                  </div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>
                    {a.unidades?.join(' · ')}
                  </div>
                </div>
                <button
                  onClick={() => marcarTestTomado(a.id)}
                  disabled={resolviendoTest === a.id}
                  style={{
                    padding:'5px 12px',borderRadius:'20px',border:'none',cursor:'pointer',
                    background: confirmandoTest === a.id ? '#fef3c7' : '#ede9fe',
                    color: confirmandoTest === a.id ? '#b45309' : '#5b21b6',
                    fontSize:'11px',fontWeight:700,
                    flexShrink:0,opacity: resolviendoTest === a.id ? 0.5 : 1,
                    transition:'all .2s'
                  }}
                >
                  {resolviendoTest === a.id ? 'Guardando...' : confirmandoTest === a.id ? '¿Confirmás? Tocá de nuevo' : 'Marcar como tomado'}
                </button>
              </div>
            ))}

            {/* ── Alertas test de unidades — director y coordinadora ven todas ── */}
            {(usuario?.rol === 'director' || usuario?.rol === 'coordinadora' || usuario?.rol === 'secretaria') && alertasTestGestion.map((a: any) => (
              <div key={a.id} style={{
                display:'flex',alignItems:'flex-start',gap:'12px',padding:'12px 14px',
                background:'var(--white)',border:'1.5px solid #c4b5fd',borderRadius:'14px'
              }}>
                <span style={{fontSize:'20px',flexShrink:0}}>📝</span>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:700,color:'#5b21b6',marginBottom:'2px'}}>
                    {a.profesora_nombre} tiene evaluación pendiente — {a.curso_nombre}
                  </div>
                  <div style={{fontSize:'12px',color:'var(--text2)'}}>
                    {a.unidades?.join(' · ')}
                  </div>
                </div>
                <button
                  onClick={() => marcarTestTomado(a.id)}
                  disabled={resolviendoTest === a.id}
                  style={{
                    padding:'5px 12px',borderRadius:'20px',border:'none',cursor:'pointer',
                    background: confirmandoTest === a.id ? '#fef3c7' : '#ede9fe',
                    color: confirmandoTest === a.id ? '#b45309' : '#5b21b6',
                    fontSize:'11px',fontWeight:700,
                    flexShrink:0,opacity: resolviendoTest === a.id ? 0.5 : 1,
                    transition:'all .2s'
                  }}
                >
                  {resolviendoTest === a.id ? 'Guardando...' : confirmandoTest === a.id ? '¿Confirmás? Tocá de nuevo' : 'Marcar como tomado'}
                </button>
              </div>
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
                <button onClick={() => abrirAsistencia(c)} style={{padding:'6px 11px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'8px',fontSize:'11px',fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
                  Asistencia
                </button>
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


      {/* ── ZONA 4B: CUMPLEAÑOS COLABORADORES ── */}
      {cumpleanosEquipo.length > 0 && (
        <div style={{marginBottom:'20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <SL>Cumpleaños del equipo</SL>
            <span style={{fontSize:'11px',color:'var(--text3)',fontWeight:500}}>4 meses</span>
          </div>
          <div style={{background:'var(--white)',border:'1.5px solid #fce7f3',borderRadius:'16px',overflow:'hidden'}}>
            <div style={{background:'linear-gradient(135deg,#fce7f3,#fff0f8)',padding:'10px 16px',borderBottom:'1px solid #fce7f3',display:'flex',alignItems:'center',gap:'8px'}}>
              <span style={{fontSize:'18px'}}>🎂</span>
              <span style={{fontSize:'12px',fontWeight:700,color:'#db2777'}}>{cumpleanosEquipo.length} próximo{cumpleanosEquipo.length !== 1 ? 's' : ''}</span>
            </div>
            {cumpleanosEquipo.map((co: any, idx: number) => (
              <div key={co.id} style={{display:'flex',alignItems:'center',gap:'12px',padding:'10px 16px',
                borderBottom:idx<cumpleanosEquipo.length-1?'1px solid #fce7f3':'none',
                background:co.diasParaCumple===0?'#fff0f8':'transparent'}}>
                <Av color={co.color||'#db2777'} nombre={co.nombre} apellido={co.apellido} size={36} />
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13px',fontWeight:600}}>{co.nombre} {co.apellido}</div>
                  <div style={{fontSize:'11.5px',color:'var(--text2)',marginTop:'2px'}}>
                    {co.diasParaCumple===0 ? <span style={{color:'#db2777',fontWeight:700}}>🎉 Hoy</span>
                    : co.diasParaCumple===1 ? <span style={{color:'#db2777',fontWeight:600}}>Mañana</span>
                    : `En ${co.diasParaCumple} días`}
                  </div>
                </div>
                <div style={{background:'#fce7f3',color:'#db2777',padding:'3px 10px',borderRadius:'20px',fontSize:'12px',fontWeight:700,flexShrink:0}}>{co.fechaStr}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── RESUMEN POR PROFESORA ── */}
      {['director','coordinadora'].includes(usuario?.rol||'') && (
        <div style={{marginBottom:'20px'}}>
          <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px'}}>
            <SL>Actividad docente</SL>
            <div style={{display:'flex',alignItems:'center',gap:'5px'}}>
              <button onClick={() => { const m = resMesProfIdx===0?11:resMesProfIdx-1; const a = resMesProfIdx===0?resMesProfAnio-1:resMesProfAnio; setResMesProfIdx(m); setResMesProfAnio(a) }}
                style={{width:'24px',height:'24px',borderRadius:'7px',border:'1.5px solid var(--border)',background:'var(--white)',cursor:'pointer',fontSize:'13px',color:'var(--text2)'}}>‹</button>
              <span style={{fontSize:'11px',fontWeight:500,minWidth:'80px',textAlign:'center'}}>
                {['Ene','Feb','Mar','Abr','May','Jun','Jul','Ago','Sep','Oct','Nov','Dic'][resMesProfIdx]} {resMesProfAnio}
              </span>
              <button onClick={() => { const m = resMesProfIdx===11?0:resMesProfIdx+1; const a = resMesProfIdx===11?resMesProfAnio+1:resMesProfAnio; setResMesProfIdx(m); setResMesProfAnio(a) }}
                style={{width:'24px',height:'24px',borderRadius:'7px',border:'1.5px solid var(--border)',background:'var(--white)',cursor:'pointer',fontSize:'13px',color:'var(--text2)'}}>›</button>
            </div>
          </div>
          {loadingResumenProf ? (
            <div style={{padding:'18px',textAlign:'center',color:'var(--text3)',fontSize:'13px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px'}}>Cargando...</div>
          ) : resumenProfesoras.length === 0 ? (
            <div style={{padding:'18px',textAlign:'center',color:'var(--text3)',fontSize:'13px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px'}}>Sin clases registradas este mes</div>
          ) : (
            <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden'}}>
              <div style={{display:'grid',gridTemplateColumns:'1fr 50px 50px 54px',padding:'7px 14px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
                {['Docente','Cl.','Hs.','Asist.'].map(h => (
                  <span key={h} style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',textAlign: h==='Docente'?'left':'center'}}>{h}</span>
                ))}
              </div>
              {resumenProfesoras.map((p:any, i:number) => (
                <div key={p.id} style={{display:'grid',gridTemplateColumns:'1fr 50px 50px 54px',alignItems:'center',padding:'9px 14px',borderBottom: i<resumenProfesoras.length-1?'1px solid var(--border)':'none'}}>
                  <div style={{display:'flex',alignItems:'center',gap:'8px',minWidth:0}}>
                    <Av color={p.color} nombre={p.nombre} apellido={p.apellido} size={30} />
                    <div style={{minWidth:0}}>
                      <div style={{fontSize:'13px',fontWeight:600,overflow:'hidden',textOverflow:'ellipsis',whiteSpace:'nowrap'}}>{p.nombre} {p.apellido}</div>
                      <div style={{fontSize:'10px',color:'var(--text3)'}}>{p.cursos} curso{p.cursos!==1?'s':''}</div>
                    </div>
                  </div>
                  <div style={{textAlign:'center',fontSize:'13px',fontWeight:600}}>{p.clases}</div>
                  <div style={{textAlign:'center',fontSize:'13px',fontWeight:600}}>{p.horas}h</div>
                  <div style={{textAlign:'center',fontSize:'13px',fontWeight:700,color:p.asistPct>=80?'var(--green)':p.asistPct>=60?'var(--amber)':'var(--red)'}}>{p.asistPct}%</div>
                </div>
              ))}
              <div style={{display:'grid',gridTemplateColumns:'1fr 50px 50px 54px',padding:'8px 14px',borderTop:'1.5px solid var(--border)',background:'var(--bg)'}}>
                <span style={{fontSize:'11px',fontWeight:700,color:'var(--text2)'}}>Total</span>
                <span style={{textAlign:'center',fontSize:'12px',fontWeight:700,color:'var(--v)'}}>{resumenProfesoras.reduce((s:number,p:any)=>s+p.clases,0)}</span>
                <span style={{textAlign:'center',fontSize:'12px',fontWeight:700,color:'var(--v)'}}>{Math.round(resumenProfesoras.reduce((s:number,p:any)=>s+p.horas,0)*10)/10}h</span>
                <span style={{textAlign:'center',fontSize:'12px',fontWeight:700,color:'var(--text2)'}}>
                  {Math.round(resumenProfesoras.reduce((s:number,p:any)=>s+p.asistPct,0)/resumenProfesoras.length)}%
                </span>
              </div>
            </div>
          )}
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

      {/* MODAL ASISTENCIA RÁPIDA */}
      {asistModal && (
        <ModalAsistencia
          modal={asistModal}
          estados={asistEstados}
          setEstados={setAsistEstados}
          tema={asistTema}
          setTema={setAsistTema}
          guardando={asistGuardando}
          onGuardar={guardarAsistencia}
          onCerrar={() => setAsistModal(null)}
        />
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

const CursoCardConBoton = ({c, col, onAsistencia}:any) => (
  <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'13px 14px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'8px'}}>
    <div style={{width:42,height:42,borderRadius:13,background:col.bg,display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
      <span style={{fontSize:'10px',fontWeight:700,color:col.text}}>{(c.nivel||'').slice(0,3).toUpperCase()}</span>
    </div>
    <div style={{flex:1,minWidth:0}}>
      <div style={{fontSize:'14px',fontWeight:600}}>{c.nombre}</div>
      <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{c.hora_inicio?.slice(0,5)||'—'}–{c.hora_fin?.slice(0,5)||'—'}</div>
    </div>
    <button onClick={onAsistencia} style={{padding:'6px 11px',background:'var(--vl)',color:'var(--v)',border:'1px solid #d4a8e8',borderRadius:'8px',fontSize:'11px',fontWeight:700,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
      Asistencia
    </button>
  </div>
)

function ModalAsistencia({ modal, estados, setEstados, tema, setTema, guardando, onGuardar, onCerrar }: any) {
  const { curso, alumnos } = modal
  const presentes = Object.values(estados).filter(e => e === 'P').length
  const ausentes = Object.values(estados).filter(e => e === 'A').length
  return (
    <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.5)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:500}} onClick={e=>{if(e.target===e.currentTarget)onCerrar()}}>
      <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'24px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'80vh',overflowY:'auto'}}>
        <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 16px'}}/>
        <div style={{fontSize:'17px',fontWeight:700,marginBottom:'4px'}}>{curso.nombre}</div>
        <div style={{fontSize:'12px',color:'var(--text2)',marginBottom:'16px'}}>
          {new Date().toLocaleDateString('es-AR',{weekday:'long',day:'numeric',month:'long'})} · {curso.hora_inicio?.slice(0,5)}
        </div>
        {/* Tema */}
        <input
          type="text"
          value={tema}
          onChange={e => setTema(e.target.value)}
          placeholder="Tema de la clase (opcional)"
          style={{width:'100%',padding:'10px 13px',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontFamily:'inherit',outline:'none',color:'var(--text)',background:'var(--white)',marginBottom:'14px',boxSizing:'border-box'}}
        />
        {/* Resumen */}
        <div style={{display:'flex',gap:'8px',marginBottom:'12px'}}>
          <div style={{flex:1,padding:'8px',background:'var(--greenl)',borderRadius:'10px',textAlign:'center'}}>
            <div style={{fontSize:'18px',fontWeight:700,color:'var(--green)'}}>{presentes}</div>
            <div style={{fontSize:'11px',color:'var(--text3)'}}>Presentes</div>
          </div>
          <div style={{flex:1,padding:'8px',background:'var(--redl)',borderRadius:'10px',textAlign:'center'}}>
            <div style={{fontSize:'18px',fontWeight:700,color:'var(--red)'}}>{ausentes}</div>
            <div style={{fontSize:'11px',color:'var(--text3)'}}>Ausentes</div>
          </div>
          <div style={{flex:1,padding:'8px',background:'var(--amberl)',borderRadius:'10px',textAlign:'center'}}>
            <div style={{fontSize:'18px',fontWeight:700,color:'var(--amber)'}}>{Object.values(estados).filter(e=>e==='T').length}</div>
            <div style={{fontSize:'11px',color:'var(--text3)'}}>Tarde</div>
          </div>
        </div>
        {/* Lista de alumnos */}
        <div style={{display:'flex',flexDirection:'column',gap:'6px',marginBottom:'16px'}}>
          {alumnos.map((a: any) => {
            const est = estados[a.id] || 'P'
            return (
              <div key={a.id} style={{display:'flex',alignItems:'center',gap:'10px',padding:'10px 12px',borderRadius:'12px',border:'1.5px solid var(--border)',background:'var(--white)'}}>
                <div style={{width:34,height:34,borderRadius:10,background:a.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#fff',flexShrink:0}}>
                  {a.nombre[0]}{a.apellido[0]}
                </div>
                <div style={{flex:1,minWidth:0}}>
                  <div style={{fontSize:'13.5px',fontWeight:600}}>{a.nombre} {a.apellido}</div>
                </div>
                <div style={{display:'flex',gap:'4px'}}>
                  {(['P','A','T'] as const).map(e => (
                    <button key={e} onClick={() => setEstados((prev: any) => ({...prev,[a.id]:e}))}
                      style={{width:'30px',height:'28px',borderRadius:'8px',border:'1.5px solid',fontSize:'12px',fontWeight:700,cursor:'pointer',
                        borderColor: est===e ? (e==='P'?'var(--green)':e==='A'?'var(--red)':'var(--amber)') : 'var(--border)',
                        background: est===e ? (e==='P'?'var(--greenl)':e==='A'?'var(--redl)':'var(--amberl)') : 'transparent',
                        color: est===e ? (e==='P'?'var(--green)':e==='A'?'var(--red)':'var(--amber)') : 'var(--text3)'
                      }}>{e}</button>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
        {alumnos.length === 0 && <div style={{textAlign:'center',padding:'20px',color:'var(--text3)',fontSize:'13px'}}>Sin alumnos asignados a este curso</div>}
        <div style={{display:'flex',gap:'10px'}}>
          <button onClick={onCerrar} style={{flex:1,padding:'12px',background:'transparent',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer',color:'var(--text2)'}}>Cancelar</button>
          <button onClick={onGuardar} disabled={guardando||alumnos.length===0} style={{flex:2,padding:'12px',background:guardando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:700,cursor:guardando?'not-allowed':'pointer'}}>
            {guardando ? 'Guardando...' : 'Confirmar clase'}
          </button>
        </div>
      </div>
    </div>
  )
}

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

