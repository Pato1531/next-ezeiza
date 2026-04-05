'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { devError, devLog } from '@/lib/debug'
import { createClient } from '@/lib/supabase'
import type { Profesora, Alumno, Curso, Clase, HorarioItem, Pago, AsistenciaClase } from '@/lib/supabase'

// ── STUBS para compatibilidad ─────────────────────────────────────────────────
export const store: Record<string, any[]> = {}
export const storeTs: Record<string, number> = {}
export function invalidateStore() {}
export function clearStore() {}

// ── useRefetchOnFocus ─────────────────────────────────────────────────────────
//
// Reglas implementadas:
// 1. visibilitychange y focus se manejan por separado — cada uno puede
//    disparar el refetch de forma independiente
// 2. lastRun se actualiza DESPUÉS del refetch exitoso, no antes
//    → si falla, el próximo intento no queda bloqueado
// 3. Throttle de 2s para evitar duplicados cuando llegan juntos
// 4. running.current evita requests paralelos
// 5. refetchRef siempre apunta al callback más reciente sin recrear listeners
// 6. Cleanup correcto en unmount
//
function useRefetchOnFocus(refetch: () => Promise<void> | void, label = 'hook') {
  const refetchRef = useRef(refetch)
  const lastRun = useRef(0)
  const running = useRef(false)

  useEffect(() => { refetchRef.current = refetch })

  useEffect(() => {
    const run = async () => {
      if (running.current) return
      if (Date.now() - lastRun.current < 2000) return
      running.current = true
      try {
        devLog('[refetch] ' + label)
        await refetchRef.current()
        lastRun.current = Date.now()
      } catch (e: any) {
        devError('[refetch error] ' + label + ': ' + (e?.message ?? String(e)))
      } finally {
        running.current = false
      }
    }

    const handleVisibility = () => { if (document.visibilityState === 'visible') run() }
    const handleFocus = () => { run() }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('focus', handleFocus)
    return () => {
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('focus', handleFocus)
    }
  }, [])
}

// ── useCursos ─────────────────────────────────────────────────────────────────
export function useCursos() {
  const [data, setData] = useState<Curso[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient()
        .from('cursos').select('*').eq('activo', true).order('nombre')
      if (error) console.error('[useCursos]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useCursos] catch', e?.message)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'cursos')

  const actualizar = async (id: string, cambios: Partial<Curso>) => {
    const { error } = await createClient().from('cursos').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
    return !error
  }

  const agregar = async (nuevo: any) => {
    const { data: row, error } = await createClient().from('cursos').insert(nuevo).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    const { error } = await createClient().from('cursos').update({ activo: false }).eq('id', id)
    if (!error) setData(prev => prev.filter(c => c.id !== id))
    return !error
  }

  return { cursos: data, loading: isLoading, actualizar, agregar, eliminar }
}

// ── useAlumnos ────────────────────────────────────────────────────────────────
export function useAlumnos() {
  const [data, setData] = useState<Alumno[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient()
        .from('alumnos').select('*').eq('activo', true).order('apellido')
      if (error) console.error('[useAlumnos]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useAlumnos] catch', e?.message)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'alumnos')

  const actualizar = async (id: string, cambios: Partial<Alumno>) => {
    const { error } = await createClient().from('alumnos').update(cambios).eq('id', id)
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
      if (json.error) { console.error('[useAlumnos agregar]', json.error); return null }
      if (json.data) { setData(prev => [...prev, json.data]); return json.data }
    } catch (e: any) {
      console.error('[useAlumnos agregar] catch', e?.message)
    }
    return null
  }

  return { alumnos: data, loading: isLoading, actualizar, agregar, recargar: cargar }
}

// ── useCursoAlumnos ───────────────────────────────────────────────────────────
export function useCursoAlumnos(cursoId: string) {
  const [data, setData] = useState<Alumno[]>([])
  const loadingRef = useRef(false)
  const retryRef = useRef(0)

  const cargar = useCallback(async () => {
    if (!cursoId || loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient()
        .from('cursos_alumnos').select('alumno_id, alumnos(*)').eq('curso_id', cursoId)
      if (error) throw error
      setData(data?.map((r: any) => r.alumnos).filter(Boolean) ?? [])
      retryRef.current = 0
    } catch (e: any) {
      console.error('[useCursoAlumnos]', e?.message)
      if (retryRef.current < 3) {
        retryRef.current++
        setTimeout(cargar, 2000 * retryRef.current)
      }
    } finally {
      loadingRef.current = false
    }
  }, [cursoId])

  useEffect(() => { retryRef.current = 0; cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'cursos')

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

// ── useClases ─────────────────────────────────────────────────────────────────
export function useClases(cursoId: string) {
  const [data, setData] = useState<Clase[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (!cursoId || loadingRef.current) { setIsLoading(false); return }
    loadingRef.current = true
    try {
      const { data, error } = await createClient().from('clases')
        .select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
      if (error) console.error('[useClases]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useClases] catch', e?.message)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'alumnos')

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

// ── usePagos ──────────────────────────────────────────────────────────────────
export function usePagos(alumnoId: string) {
  const [data, setData] = useState<Pago[]>([])
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (!alumnoId || loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient().from('pagos_alumnos').select('*')
        .eq('alumno_id', alumnoId).order('created_at', { ascending: false })
      if (error) console.error('[usePagos]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[usePagos] catch', e?.message)
    } finally {
      loadingRef.current = false
    }
  }, [alumnoId])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'cursoAlumnos')

  const registrar = async (pago: any) => {
    try {
      const res = await fetch('/api/registrar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pago)
      })
      const json = await res.json()
      if (json.error) { console.error('[usePagos registrar]', json.error); return null }
      if (json.data) {
        setData(prev => {
          const sinDup = prev.filter(p => !(p.mes === json.data.mes && p.anio === json.data.anio))
          return [json.data, ...sinDup]
        })
        return json.data
      }
    } catch (e: any) {
      console.error('[usePagos registrar] catch', e?.message)
    }
    return null
  }

  return { pagos: data, registrar }
}

// ── useExamenes ───────────────────────────────────────────────────────────────
export function useExamenes(cursoId: string) {
  const [data, setData] = useState<any[]>([])
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (!cursoId || loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient().from('examenes')
        .select('*').eq('curso_id', cursoId).order('fecha')
      if (error) console.error('[useExamenes]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useExamenes] catch', e?.message)
    } finally {
      loadingRef.current = false
    }
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'clases')

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

// ── useAsistencia ─────────────────────────────────────────────────────────────
export function useAsistencia(cursoId: string) {
  const [data, setData] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    if (!cursoId) return
    createClient().from('asistencia_clases').select('clase_id, alumno_id, estado')
      .then(({ data: rows, error }) => {
        if (error) { console.error('[useAsistencia]', error.message); return }
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

// ── useMiProfesora ────────────────────────────────────────────────────────────
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

// ── useNotasExamen ────────────────────────────────────────────────────────────
export function useNotasExamen(examenId: string) {
  const [data, setData] = useState<any[]>([])
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (!examenId || loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient().from('notas_examenes')
        .select('*').eq('examen_id', examenId)
      if (error) console.error('[useNotasExamen]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useNotasExamen] catch', e?.message)
    } finally {
      loadingRef.current = false
    }
  }, [examenId])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'pagos')

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

// ── useHorario ────────────────────────────────────────────────────────────────
export function useHorario() {
  const [data, setData] = useState<HorarioItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient().from('horario')
        .select('*').eq('activo', true).order('hora_inicio')
      if (error) console.error('[useHorario]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useHorario] catch', e?.message)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'examenes')

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

// ── useComunicados ────────────────────────────────────────────────────────────
export function useComunicados() {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const loadingRef = useRef(false)

  const cargar = useCallback(async () => {
    if (loadingRef.current) return
    loadingRef.current = true
    try {
      const { data, error } = await createClient().from('comunicados')
        .select('*').eq('activo', true).order('created_at', { ascending: false })
      if (error) console.error('[useComunicados]', error.message)
      else setData(data ?? [])
    } catch (e: any) {
      console.error('[useComunicados] catch', e?.message)
    } finally {
      setIsLoading(false)
      loadingRef.current = false
    }
  }, [])

  useEffect(() => { cargar() }, [cargar])
  useRefetchOnFocus(cargar, 'notasExamen')

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

// ── useHistorialCursos ────────────────────────────────────────────────────────
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

// ── useCuotasHistorial ────────────────────────────────────────────────────────
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

// ── useHorasHistorial ─────────────────────────────────────────────────────────
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

// ── useLiquidaciones ──────────────────────────────────────────────────────────
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
    if (error) { console.error('[useLiquidaciones guardar]', error.message); return null }
    setData(prev => {
      const idx = prev.findIndex(l => l.mes === liq.mes && l.anio === liq.anio)
      if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
      return [row, ...prev]
    })
    return row
  }

  return { liquidaciones: data, loading: isLoading, guardar }
}
