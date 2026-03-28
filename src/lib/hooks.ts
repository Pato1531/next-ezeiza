'use client'

import { useEffect, useState, useCallback } from 'react'
import { createBrowserClient } from '@supabase/ssr'
import type { Alumno, Profesora, Curso, Clase, HorarioItem, AsistenciaClase } from '@/lib/supabase'

function getSupabase() {
  return createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
  )
}

// ── PROFESORA LOGUEADA ──
// Devuelve el registro de profesoras que coincide con el email del usuario logueado
export function useMiProfesora() {
  const [profesora, setProfesora] = useState<Profesora | null>(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const sb = getSupabase()
    sb.auth.getUser().then(async ({ data }) => {
      if (!data?.user?.email) { setLoading(false); return }
      const { data: prof } = await sb.from('profesoras').select('*').eq('email', data.user.email).maybeSingle()
      setProfesora(prof ?? null)
      setLoading(false)
    })
  }, [])

  return { miProfesora: profesora, loading }
}

// ── PROFESORAS ──
export function useProfesoras() {
  const [data, setData] = useState<Profesora[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    const { data: rows, error } = await sb.from('profesoras').select('*').eq('activa', true).order('apellido')
    if (error) console.error('Error cargando profesoras:', error)
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: Partial<Profesora>) => {
    const sb = getSupabase()
    const { error } = await sb.from('profesoras').update(cambios).eq('id', id)
    if (error) { console.error('Error actualizando profesora:', error); return false }
    setData(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p))
    return true
  }

  const agregar = async (nueva: Omit<Profesora, 'id' | 'activa'>) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('profesoras').insert(nueva).select().single()
    if (error) { console.error('Error creando profesora:', error); alert('Error al crear: ' + error.message); return null }
    if (row) setData(prev => [...prev, row as Profesora])
    return row
  }

  return { profesoras: data, loading, actualizar, agregar, recargar: cargar }
}

// ── ALUMNOS ──
export function useAlumnos() {
  const [data, setData] = useState<Alumno[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    const { data: rows, error } = await sb.from('alumnos').select('*').eq('activo', true).order('apellido')
    if (error) console.error('Error cargando alumnos:', error)
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: Partial<Alumno>) => {
    const sb = getSupabase()
    const { error } = await sb.from('alumnos').update(cambios).eq('id', id)
    if (error) { console.error('Error actualizando alumno:', error); return false }
    setData(prev => prev.map(a => a.id === id ? { ...a, ...cambios } : a))
    return true
  }

  const agregar = async (nuevo: Omit<Alumno, 'id' | 'activo'>) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('alumnos').insert(nuevo).select().single()
    if (error) { console.error('Error creando alumno:', error); alert('Error al crear: ' + error.message); return null }
    if (row) setData(prev => [...prev, row as Alumno])
    return row
  }

  return { alumnos: data, loading, actualizar, agregar, recargar: cargar }
}

// ── PAGOS ──
export function usePagos(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!alumnoId) { setLoading(false); return }
    const sb = getSupabase()
    sb.from('pagos_alumnos').select('*').eq('alumno_id', alumnoId).order('created_at', { ascending: false })
      .then(({ data: rows, error }) => {
        if (error) console.error('Error cargando pagos:', error)
        setData(rows ?? [])
        setLoading(false)
      })
  }, [alumnoId])

  const registrar = async (pago: any) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('pagos_alumnos').insert(pago).select().single()
    if (error) { console.error('Error registrando pago:', error); alert('Error: ' + error.message); return null }
    if (row) setData(prev => [row, ...prev])
    return row
  }

  return { pagos: data, loading, registrar }
}

// ── CURSOS ──
export function useCursos() {
  const [data, setData] = useState<Curso[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    const { data: rows, error } = await sb.from('cursos').select('*').eq('activo', true).order('nombre')
    if (error) console.error('Error cargando cursos:', error)
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: Partial<Curso>) => {
    const sb = getSupabase()
    const { error } = await sb.from('cursos').update(cambios).eq('id', id)
    if (error) { console.error('Error actualizando curso:', error); return false }
    setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
    return true
  }

  const agregar = async (nuevo: Omit<Curso, 'id' | 'activo'>) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('cursos').insert(nuevo).select().single()
    if (error) { console.error('Error creando curso:', error); alert('Error al crear: ' + error.message); return null }
    if (row) setData(prev => [...prev, row as Curso])
    return row
  }

  return { cursos: data, loading, actualizar, agregar, recargar: cargar }
}

// ── ALUMNOS DE UN CURSO ──
export function useCursoAlumnos(cursoId: string) {
  const [data, setData] = useState<Alumno[]>([])

  useEffect(() => {
    if (!cursoId) return
    const sb = getSupabase()
    sb.from('cursos_alumnos').select('alumno_id, alumnos(*)').eq('curso_id', cursoId)
      .then(({ data: rows, error }) => {
        if (error) { console.error('Error cargando alumnos del curso:', error); return }
        const al = rows?.map((r: any) => r.alumnos).filter(Boolean) ?? []
        setData(al)
      })
  }, [cursoId])

  const agregar = async (alumnoId: string) => {
    const sb = getSupabase()
    const { error } = await sb.from('cursos_alumnos').insert({ curso_id: cursoId, alumno_id: alumnoId })
    if (error) { console.error('Error agregando alumno:', error); return false }
    const sb2 = getSupabase()
    const { data: alumno } = await sb2.from('alumnos').select('*').eq('id', alumnoId).single()
    if (alumno) setData(prev => [...prev, alumno as Alumno])
    return true
  }

  const quitar = async (alumnoId: string) => {
    const sb = getSupabase()
    const { error } = await sb.from('cursos_alumnos').delete().eq('curso_id', cursoId).eq('alumno_id', alumnoId)
    if (error) { console.error('Error quitando alumno:', error); return false }
    setData(prev => prev.filter(a => a.id !== alumnoId))
    return true
  }

  return { alumnosCurso: data, agregar, quitar }
}

// ── CLASES ──
export function useClases(cursoId: string) {
  const [data, setData] = useState<Clase[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!cursoId) { setLoading(false); return }
    const sb = getSupabase()
    const { data: rows, error } = await sb.from('clases').select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
    if (error) console.error('Error cargando clases:', error)
    setData(rows ?? [])
    setLoading(false)
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (clase: Omit<Clase, 'id'>) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('clases').insert(clase).select().single()
    if (error) { console.error('Error creando clase:', error); alert('Error: ' + error.message); return null }
    if (row) setData(prev => [row as Clase, ...prev])
    return row
  }

  return { clases: data, loading, agregar, recargar: cargar }
}

// ── ASISTENCIA DE UNA CLASE ──
export function useAsistencia(claseId: string) {
  const [data, setData] = useState<AsistenciaClase[]>([])

  useEffect(() => {
    if (!claseId) return
    const sb = getSupabase()
    sb.from('asistencia_clases').select('*').eq('clase_id', claseId)
      .then(({ data: rows }) => setData(rows ?? []))
  }, [claseId])

  const registrar = async (alumnoId: string, estado: 'P' | 'A' | 'T', obs?: string) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('asistencia_clases')
      .upsert({ clase_id: claseId, alumno_id: alumnoId, estado, observacion: obs }, { onConflict: 'clase_id,alumno_id' })
      .select().single()
    if (error) { console.error('Error registrando asistencia:', error); return }
    if (row) setData(prev => {
      const idx = prev.findIndex(a => a.alumno_id === alumnoId)
      if (idx >= 0) { const n = [...prev]; n[idx] = row as AsistenciaClase; return n }
      return [...prev, row as AsistenciaClase]
    })
  }

  return { asistencia: data, registrar }
}

// ── EXAMENES ──
export function useExamenes(cursoId: string) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!cursoId) { setLoading(false); return }
    const sb = getSupabase()
    const { data: rows } = await sb.from('examenes').select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (examen: any) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('examenes').insert(examen).select().single()
    if (error) { alert('Error: ' + error.message); return null }
    if (row) setData(prev => [row, ...prev])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = getSupabase()
    await sb.from('examenes').delete().eq('id', id)
    setData(prev => prev.filter(e => e.id !== id))
  }

  return { examenes: data, loading, agregar, eliminar, recargar: cargar }
}

export function useNotasExamen(examenId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!examenId) return
    const sb = getSupabase()
    sb.from('notas_examenes').select('*').eq('examen_id', examenId)
      .then(({ data: rows }) => setData(rows ?? []))
  }, [examenId])

  const guardarNota = async (alumnoId: string, campos: {
    nota?: number|null, ausente?: boolean, observacion?: string,
    escrito?: number|null, oral?: number|null, listening?: number|null
  }) => {
    const sb = getSupabase()
    const { data: row } = await sb.from('notas_examenes')
      .upsert({ examen_id: examenId, alumno_id: alumnoId, ...campos }, { onConflict: 'examen_id,alumno_id' })
      .select().single()
    if (row) setData(prev => {
      const idx = prev.findIndex(n => n.alumno_id === alumnoId)
      if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
      return [...prev, row]
    })
  }

  return { notas: data, guardarNota }
}
export function useHorario() {
  const [data, setData] = useState<HorarioItem[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    const { data: rows, error } = await sb.from('horario').select('*').eq('activo', true).order('hora_inicio')
    if (error) console.error('Error cargando horario:', error)
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (item: Omit<HorarioItem, 'id'>) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('horario').insert({ ...item, activo: true }).select().single()
    if (error) { console.error('Error creando horario:', error); alert('Error: ' + error.message); return null }
    if (row) setData(prev => [...prev, row as HorarioItem])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = getSupabase()
    const { error } = await sb.from('horario').delete().eq('id', id)
    if (error) { console.error('Error eliminando horario:', error); return false }
    setData(prev => prev.filter(h => h.id !== id))
    return true
  }

  return { horario: data, loading, agregar, eliminar, recargar: cargar }
}

// ── COMUNICADOS ──
export function useComunicados() {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    const { data: rows } = await sb.from('comunicados').select('*').eq('activo', true).order('created_at', { ascending: false })
    setData(rows ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (c: any) => {
    const sb = getSupabase()
    const { data: row } = await sb.from('comunicados').insert(c).select().single()
    if (row) setData(prev => [row, ...prev])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = getSupabase()
    await sb.from('comunicados').update({ activo: false }).eq('id', id)
    setData(prev => prev.filter(c => c.id !== id))
  }

  return { comunicados: data, loading, agregar, eliminar, recargar: cargar }
}

// ── HISTORIAL CURSOS ──
export function useHistorialCursos(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    let q = sb.from('historial_cursos').select('*').order('fecha', { ascending: false })
    if (alumnoId) q = q.eq('alumno_id', alumnoId)
    const { data: rows } = await q
    setData(rows ?? [])
  }, [alumnoId])

  useEffect(() => { cargar() }, [cargar])

  const registrar = async (h: any) => {
    const sb = getSupabase()
    await sb.from('historial_cursos').insert(h)
    cargar()
  }

  return { historial: data, registrar, recargar: cargar }
}

// ── CUOTAS HISTORIAL ──
export function useCuotasHistorial(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    let q = sb.from('cuotas_historial').select('*').order('vigente_desde', { ascending: false })
    if (alumnoId) q = q.eq('alumno_id', alumnoId)
    const { data: rows } = await q.limit(50)
    setData(rows ?? [])
    setLoading(false)
  }, [alumnoId])

  useEffect(() => { cargar() }, [cargar])

  const registrarCambio = async (cambio: any) => {
    const sb = getSupabase()
    await sb.from('cuotas_historial').insert(cambio)
    cargar()
  }

  return { historial: data, loading, registrarCambio, recargar: cargar }
}

// ── HORAS HISTORIAL ──
export function useHorasHistorial(profesoraId?: string) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    let q = sb.from('horas_historial').select('*').order('vigente_desde', { ascending: false })
    if (profesoraId) q = q.eq('profesora_id', profesoraId)
    const { data: rows } = await q.limit(50)
    setData(rows ?? [])
    setLoading(false)
  }, [profesoraId])

  useEffect(() => { cargar() }, [cargar])

  const registrarCambio = async (cambio: any) => {
    const sb = getSupabase()
    await sb.from('horas_historial').insert(cambio)
    cargar()
  }

  return { historial: data, loading, registrarCambio, recargar: cargar }
}

// ── LIQUIDACIONES ──
export function useLiquidaciones(profesoraId?: string) {
  const [data, setData] = useState<any[]>([])
  const [loading, setLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = getSupabase()
    let q = sb.from('liquidaciones').select('*').order('anio', { ascending: false }).order('created_at', { ascending: false })
    if (profesoraId) q = q.eq('profesora_id', profesoraId)
    const { data: rows } = await q.limit(24)
    setData(rows ?? [])
    setLoading(false)
  }, [profesoraId])

  useEffect(() => { cargar() }, [cargar])

  const guardar = async (liq: any) => {
    const sb = getSupabase()
    const { data: row, error } = await sb.from('liquidaciones')
      .upsert(liq, { onConflict: 'profesora_id,mes,anio' })
      .select().single()
    if (error) { console.error(error); return null }
    cargar()
    return row
  }

  return { liquidaciones: data, loading, guardar, recargar: cargar }
}
