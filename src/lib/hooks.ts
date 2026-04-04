'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profesora, Alumno, Curso, Clase, HorarioItem, Pago, AsistenciaClase } from '@/lib/supabase'

// Store mínimo solo para compatibilidad con código que lo importa directamente
export const store: Record<string, any[]> = {}
export const storeTs: Record<string, number> = {}
export function invalidateStore() {}
export function clearStore() {}

// ── PROFESORAS ──
export function useProfesoras() {
  const [data, setData] = useState<Profesora[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('profesoras').select('*').eq('activa', true).order('apellido')
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: Partial<Profesora>) => {
    const sb = createClient()
    const { error } = await sb.from('profesoras').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p))
    return !error
  }

  const agregar = async (nueva: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('profesoras').insert(nueva).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const recargar = cargar

  return { profesoras: data, loading: isLoading, actualizar, agregar, recargar }
}

// ── ALUMNOS ──
export function useAlumnos() {
  const [data, setData] = useState<Alumno[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('alumnos').select('*').eq('activo', true).order('apellido')
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: Partial<Alumno>) => {
    const sb = createClient()
    const { error } = await sb.from('alumnos').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(a => a.id === id ? { ...a, ...cambios } : a))
    return !error
  }

  const agregar = async (nuevo: any) => {
    const datos = {
      nombre: nuevo.nombre, apellido: nuevo.apellido,
      edad: nuevo.edad || null, telefono: nuevo.telefono || null,
      email: nuevo.email || null, nivel: nuevo.nivel || 'Básico',
      cuota_mensual: nuevo.cuota_mensual || 0, es_menor: nuevo.es_menor || false,
      padre_nombre: nuevo.padre_nombre || null, padre_telefono: nuevo.padre_telefono || null,
      padre_email: nuevo.padre_email || null, color: nuevo.color || '#652f8d', activo: true,
    }
    try {
      const res = await fetch('/api/crear-alumno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      })
      const json = await res.json()
      if (json.error) return null
      if (json.data) setData(prev => [...prev, json.data])
      return json.data
    } catch { return null }
  }

  const recargar = cargar

  return { alumnos: data, loading: isLoading, actualizar, agregar, recargar }
}

// ── CURSOS ──
export function useCursos() {
  const [data, setData] = useState<Curso[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('cursos').select('*').eq('activo', true).order('nombre')
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const actualizar = async (id: string, cambios: Partial<Curso>) => {
    const sb = createClient()
    const { error } = await sb.from('cursos').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
    return !error
  }

  const agregar = async (nuevo: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('cursos').insert(nuevo).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('cursos').update({ activo: false }).eq('id', id)
    if (!error) setData(prev => prev.filter(c => c.id !== id))
    return !error
  }

  return { cursos: data, loading: isLoading, actualizar, agregar, eliminar }
}

// ── PAGOS DE UN ALUMNO ──
export function usePagos(alumnoId: string) {
  const [data, setData] = useState<Pago[]>([])

  useEffect(() => {
    if (!alumnoId) return
    createClient().from('pagos_alumnos').select('*').eq('alumno_id', alumnoId)
      .order('created_at', { ascending: false })
      .then(({ data }) => setData(data ?? []))
  }, [alumnoId])

  const registrar = async (pago: any) => {
    try {
      const res = await fetch('/api/registrar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pago)
      })
      const json = await res.json()
      if (json.error) return null
      const row = json.data
      if (row) setData(prev => {
        const sinDup = prev.filter(p => !(p.mes === row.mes && p.anio === row.anio))
        return [row, ...sinDup]
      })
      return row
    } catch { return null }
  }

  return { pagos: data, registrar }
}

// ── ALUMNOS DE UN CURSO ──
export function useCursoAlumnos(cursoId: string) {
  const [data, setData] = useState<Alumno[]>([])
  const retryRef = useRef(0)

  const cargar = useCallback(async () => {
    if (!cursoId) return
    try {
      const { data, error } = await createClient()
        .from('cursos_alumnos').select('alumno_id, alumnos(*)').eq('curso_id', cursoId)
      if (error) throw error
      setData(data?.map((r: any) => r.alumnos).filter(Boolean) ?? [])
      retryRef.current = 0
    } catch {
      if (retryRef.current < 3) {
        retryRef.current++
        setTimeout(cargar, 2000 * retryRef.current)
      }
    }
  }, [cursoId])

  useEffect(() => { retryRef.current = 0; cargar() }, [cargar])

  const agregar = async (alumnoId: string) => {
    await createClient().from('cursos_alumnos').upsert(
      { curso_id: cursoId, alumno_id: alumnoId, fecha_ingreso: new Date().toISOString().split('T')[0] },
      { onConflict: 'curso_id,alumno_id', ignoreDuplicates: true }
    )
    cargar()
    return true
  }

  const quitar = async (alumnoId: string) => {
    setData(prev => prev.filter(a => a.id !== alumnoId))
    await createClient().from('cursos_alumnos').delete()
      .eq('curso_id', cursoId).eq('alumno_id', alumnoId)
    return true
  }

  return { alumnosCurso: data, agregar, quitar, recargar: cargar }
}

// ── CLASES ──
export function useClases(cursoId: string) {
  const [data, setData] = useState<Clase[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    if (!cursoId) { setIsLoading(false); return }
    const { data } = await createClient().from('clases')
      .select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
    setData(data ?? [])
    setIsLoading(false)
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (clase: any) => {
    const { data: row, error } = await createClient().from('clases').insert(clase).select().single()
    if (row && !error) setData(prev => [row, ...prev])
    return row
  }

  const actualizar = async (id: string, cambios: any) => {
    const { error } = await createClient().from('clases').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
    return !error
  }

  return { clases: data, loading: isLoading, agregar, actualizar, recargar: cargar }
}

// ── ASISTENCIA ──
export function useAsistencia(cursoId: string) {
  const [data, setData] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    if (!cursoId) return
    createClient().from('asistencia_clases').select('clase_id, alumno_id, estado')
      .then(({ data: rows }) => {
        const m: Record<string, Record<string, string>> = {}
        rows?.forEach((r: any) => {
          if (!m[r.clase_id]) m[r.clase_id] = {}
          m[r.clase_id][r.alumno_id] = r.estado
        })
        setData(m)
      })
  }, [cursoId])

  const guardar = async (claseId: string, alumnoId: string, estado: string) => {
    await createClient().from('asistencia_clases')
      .upsert({ clase_id: claseId, alumno_id: alumnoId, estado }, { onConflict: 'clase_id,alumno_id' })
    setData(prev => ({ ...prev, [claseId]: { ...(prev[claseId] || {}), [alumnoId]: estado } }))
  }

  return { asistencias: data, guardar }
}

// ── MI PROFESORA ──
export function useMiProfesora() {
  const [data, setData] = useState<Profesora | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setIsLoading(false); return }
      sb.from('profesoras').select('*').ilike('email', user.email || '').limit(1)
        .then(({ data: rows }) => {
          if (rows?.length) { setData(rows[0]); setIsLoading(false); return }
          sb.from('usuarios').select('nombre').eq('id', user.id).single()
            .then(({ data: u }) => {
              if (!u) { setIsLoading(false); return }
              sb.from('profesoras').select('*').ilike('nombre', `%${u.nombre.split(' ')[0]}%`).limit(1)
                .then(({ data: rows2 }) => { setData(rows2?.[0] ?? null); setIsLoading(false) })
            })
        })
    })
  }, [])

  return { miProfesora: data, loading: isLoading }
}

// ── EXAMENES ──
export function useExamenes(cursoId: string) {
  const [data, setData] = useState<any[]>([])

  const cargar = useCallback(async () => {
    if (!cursoId) return
    const { data } = await createClient().from('examenes').select('*').eq('curso_id', cursoId).order('fecha')
    setData(data ?? [])
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (ex: any) => {
    const { data: row, error } = await createClient().from('examenes').insert(ex).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    await createClient().from('examenes').delete().eq('id', id)
    setData(prev => prev.filter(e => e.id !== id))
  }

  return { examenes: data, agregar, eliminar, recargar: cargar }
}

// ── NOTAS EXAMEN ──
export function useNotasExamen(examenId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!examenId) return
    createClient().from('notas_examenes').select('*').eq('examen_id', examenId)
      .then(({ data }) => setData(data ?? []))
  }, [examenId])

  const guardarNota = async (alumnoId: string, campos: any) => {
    const { data: row } = await createClient().from('notas_examenes')
      .upsert({ examen_id: examenId, alumno_id: alumnoId, ...campos }, { onConflict: 'examen_id,alumno_id' })
      .select().single()
    if (row) setData(prev => {
      const idx = prev.findIndex((n: any) => n.alumno_id === alumnoId)
      if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
      return [...prev, row]
    })
  }

  return { notas: data, guardarNota }
}

// ── HORARIO ──
export function useHorario() {
  const [data, setData] = useState<HorarioItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await createClient().from('horario').select('*').eq('activo', true).order('hora_inicio')
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (item: any) => {
    const { data: row, error } = await createClient().from('horario').insert(item).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    const { error } = await createClient().from('horario').delete().eq('id', id)
    if (!error) setData(prev => prev.filter(h => h.id !== id))
    return !error
  }

  return { horario: data, loading: isLoading, agregar, eliminar, recargar: cargar }
}

// ── COMUNICADOS ──
export function useComunicados() {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    const { data } = await createClient().from('comunicados')
      .select('*').eq('activo', true).order('created_at', { ascending: false })
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (c: any) => {
    const { data: row } = await createClient().from('comunicados').insert(c).select().single()
    if (row) setData(prev => [row, ...prev])
    return row
  }

  const eliminar = async (id: string) => {
    await createClient().from('comunicados').update({ activo: false }).eq('id', id)
    setData(prev => prev.filter(c => c.id !== id))
  }

  return { comunicados: data, loading: isLoading, agregar, eliminar, recargar: cargar }
}

// ── HISTORIAL CURSOS ──
export function useHistorialCursos(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!alumnoId) return
    createClient().from('historial_cursos').select('*')
      .eq('alumno_id', alumnoId).order('fecha', { ascending: false }).limit(10)
      .then(({ data, error }) => { if (!error) setData(data ?? []) }).catch(() => {})
  }, [alumnoId])

  const registrar = async (h: any) => {
    createClient().from('historial_cursos').insert(h).catch(() => {})
  }

  return { historial: data, registrar }
}

// ── CUOTAS HISTORIAL ──
export function useCuotasHistorial(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!alumnoId) return
    createClient().from('cuotas_historial').select('*')
      .eq('alumno_id', alumnoId).order('vigente_desde', { ascending: false }).limit(10)
      .then(({ data, error }) => { if (!error) setData(data ?? []) }).catch(() => {})
  }, [alumnoId])

  const registrarCambio = async (cambio: any) => {
    createClient().from('cuotas_historial').insert(cambio).catch(() => {})
  }

  return { historial: data, registrarCambio }
}

// ── HORAS HISTORIAL ──
export function useHorasHistorial(profesoraId?: string) {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    let q = sb.from('horas_historial').select('*').order('vigente_desde', { ascending: false })
    if (profesoraId) q = (q as any).eq('profesora_id', profesoraId)
    q.limit(50).then(({ data }) => { setData(data ?? []); setIsLoading(false) })
  }, [profesoraId])

  const registrarCambio = async (cambio: any) => {
    await createClient().from('horas_historial').insert(cambio)
  }

  return { historial: data, loading: isLoading, registrarCambio }
}

// ── LIQUIDACIONES ──
export function useLiquidaciones(profesoraId?: string) {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    let q = sb.from('liquidaciones').select('*')
      .order('anio', { ascending: false }).order('created_at', { ascending: false })
    if (profesoraId) q = (q as any).eq('profesora_id', profesoraId)
    q.limit(24).then(({ data }) => { setData(data ?? []); setIsLoading(false) })
  }, [profesoraId])

  const guardar = async (liq: any) => {
    const { data: row, error } = await createClient().from('liquidaciones')
      .upsert(liq, { onConflict: 'profesora_id,mes,anio' }).select().single()
    if (error) return null
    setData(prev => {
      const idx = prev.findIndex(l => l.mes === liq.mes && l.anio === liq.anio)
      if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
      return [row, ...prev]
    })
    return row
  }

  return { liquidaciones: data, loading: isLoading, guardar }
}
