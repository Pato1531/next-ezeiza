'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { devError, devLog } from '@/lib/debug'
import { createClient } from '@/lib/supabase'
import type { Profesora, Alumno, Curso, Clase, HorarioItem, Pago } from '@/lib/supabase'

// ── STUBS para compatibilidad ─────────────────────────────────────────────────
export const store: Record<string, any[]> = {}
export const storeTs: Record<string, number> = {}
export function invalidateStore() {}
export function clearStore() {}


// ── logActivity — registrar acciones de usuarios en activity_log ─────────────
// Se llama fire-and-forget desde las mutaciones para no bloquear la UI.
// La tabla activity_log debe tener: id, usuario_nombre, accion, modulo, detalle, created_at
// Nombre de usuario en memoria — se actualiza desde auth-context via setCurrentUserName
let _currentUserName = 'Sistema'
export function setCurrentUserName(nombre: string) { _currentUserName = nombre }

export function logActivity(accion: string, modulo: string, detalle?: string) {
  if (typeof window === 'undefined') return // no-op en SSR
  try {
    createClient()
      .from('activity_log')
      .insert({ usuario_nombre: _currentUserName, accion, modulo, detalle: detalle || null })
      .then(({ error }) => { if (error) console.debug('[logActivity]', error.message) })
  } catch {}
}

// ── invalidateQuery — forzar refetch desde cualquier componente ───────────────
const listeners: Record<string, Set<() => void>> = {}

export function invalidateQuery(key: string) {
  listeners[key]?.forEach(fn => fn())
}

// ── authReady — flag global que indica si hay sesión confirmada ───────────────
// Se activa desde auth-context via setAuthReady(true) después de cargarUsuario.
// Los hooks esperan este flag antes de hacer el primer fetch.
// Esto evita que fetcheen con RLS sin sesión y sobreescriban el cache con [].
let _authReady = false
const _authReadyListeners: Set<() => void> = new Set()

export function setAuthReady(ready: boolean) {
  _authReady = ready
  if (ready) _authReadyListeners.forEach(fn => fn())
}

export function onAuthReady(fn: () => void): () => void {
  if (_authReady) { fn(); return () => {} }
  _authReadyListeners.add(fn)
  return () => { _authReadyListeners.delete(fn) }
}

// ── Cache helpers (sessionStorage) ───────────────────────────────────────────
// Permite que al volver del background los datos aparezcan instantáneamente
// mientras Supabase rehidrata la sesión en background.
const CACHE_TTL_MS = 10 * 60 * 1000 // 10 minutos

function cacheRead<T>(key: string): T[] | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = sessionStorage.getItem('nq_' + key)
    if (!raw) return null
    const { data, ts } = JSON.parse(raw)
    if (Date.now() - ts > CACHE_TTL_MS) {
      sessionStorage.removeItem('nq_' + key)
      return null
    }
    return data as T[]
  } catch { return null }
}

function cacheWrite<T>(key: string, data: T[]) {
  if (typeof window === 'undefined') return
  try {
    sessionStorage.setItem('nq_' + key, JSON.stringify({ data, ts: Date.now() }))
  } catch {}
}

// ── Global in-memory store — fuente de verdad compartida entre instancias ─────
const _store: Record<string, any[]> = {}
const _storeVersion: Record<string, number> = {}
const _storeListeners: Record<string, Set<() => void>> = {}
const _storeHasData: Record<string, boolean> = {}

function storeGet<T>(key: string): T[] {
  return (_store[key] as T[]) ?? []
}

function storeSet<T>(key: string, data: T[]) {
  _store[key] = data
  _storeVersion[key] = (_storeVersion[key] ?? 0) + 1
  _storeHasData[key] = true
  // Solo escribir cache si hay datos — nunca sobreescribir con array vacío
  if (data.length > 0) cacheWrite(key, data)
  _storeListeners[key]?.forEach(fn => fn())
}

function storeSubscribe(key: string, fn: () => void): () => void {
  if (!_storeListeners[key]) _storeListeners[key] = new Set()
  _storeListeners[key].add(fn)
  return () => { _storeListeners[key]?.delete(fn) }
}

function storeGetVersion(key: string): number {
  return _storeVersion[key] ?? 0
}

// ── useSupabaseQuery ──────────────────────────────────────────────────────────
//
// Usa store global como fuente de verdad.
// Cuando fetch termina → storeSet → TODOS los suscriptores re-renderizan.
// Resuelve el problema de múltiples instancias del mismo hook.
//
function useSupabaseQuery<T>(
  cacheKey: string,
  fetcher: () => Promise<T[]>,
  options?: { skip?: boolean }
) {
  const shouldSkip = options?.skip ?? false

  // Inicializar store desde cache si aún no tiene datos
  if (!_storeHasData[cacheKey]) {
    const cached = cacheRead<T>(cacheKey)
    if (cached && cached.length > 0) {
      _store[cacheKey] = cached
      _storeHasData[cacheKey] = true
    }
  }

  // Leer store en cada render — garantiza datos frescos sin depender de useEffect timing
  // El useState solo se usa para forzar re-renders cuando el store cambia
  const [, forceUpdate] = useState(0)
  const data = storeGet<T>(cacheKey)
  const [isLoading, setIsLoading] = useState(!shouldSkip && !_storeHasData[cacheKey])
  const [isFetching, setIsFetching] = useState(false)

  const fetchingRef = useRef(false)
  const mountedRef = useRef(true)
  const fetcherRef = useRef(fetcher)
  useEffect(() => { fetcherRef.current = fetcher })
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // Suscribirse al store — forceUpdate dispara re-render, data se lee del store
  // No hay race condition: data = storeGet() siempre lee el valor actual
  useEffect(() => {
    // Al suscribirse, forzar re-render por si el store ya fue actualizado
    forceUpdate(n => n + 1)
    return storeSubscribe(cacheKey, () => {
      forceUpdate(n => n + 1)
      setIsLoading(false)
    })
  }, [cacheKey])

  // setData público — actualiza store global
  const setData = useCallback((updater: T[] | ((prev: T[]) => T[])) => {
    const current = storeGet<T>(cacheKey)
    const next = typeof updater === 'function' ? (updater as (p: T[]) => T[])(current) : updater
    storeSet<T>(cacheKey, next)
  }, [cacheKey])

  const fetch = useCallback(async () => {
    if (fetchingRef.current) return
    if (shouldSkip) {
      devLog(`[${cacheKey}] skipped (shouldSkip=true)`)
      return
    }
    fetchingRef.current = true
    if (mountedRef.current) setIsFetching(true)
    try {
      const result = await fetcherRef.current()
      devLog(`[${cacheKey}] fetched ${result.length} items`)
      // storeSet notifica a TODOS los suscriptores — no importa qué instancia fetcheó
      storeSet<T>(cacheKey, result)
      _storeHasData[cacheKey] = true
    } catch (e: any) {
      devError(`[${cacheKey}] fetch error: ${e?.message ?? String(e)}`)
    } finally {
      fetchingRef.current = false
      if (mountedRef.current) {
        setIsLoading(false)
        setIsFetching(false)
      }
    }
  }, [cacheKey, shouldSkip])

  // Auto fetch al montar — esperar sesión confirmada
  useEffect(() => {
    return onAuthReady(() => { fetch() })
  }, [fetch])

  // Registrar en listeners para invalidateQuery()
  useEffect(() => {
    if (!listeners[cacheKey]) listeners[cacheKey] = new Set()
    listeners[cacheKey].add(fetch)
    return () => { listeners[cacheKey].delete(fetch) }
  }, [cacheKey, fetch])

  useRefetchOnFocus(fetch, cacheKey)

  return { data, setData, isLoading, isFetching, refetch: fetch }
}

// ── useRefetchOnFocus ─────────────────────────────────────────────────────────
//
// 1. visibilitychange y focus separados — cada uno dispara independiente
// 2. lastRun actualiza DESPUÉS del éxito → si falla, próximo evento reintenta
// 3. Throttle 2s — evita duplicados cuando ambos eventos llegan juntos
// 4. running.current — evita requests paralelos
// 5. refetchRef — apunta al callback más reciente sin recrear listeners
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

// ── useProfesoras ─────────────────────────────────────────────────────────────
export function useProfesoras() {
  const { data, setData, isLoading, refetch } = useSupabaseQuery<Profesora>(
    'profesoras',
    async () => {
      const { data, error } = await createClient()
        .from('profesoras').select('*').eq('activa', true).order('apellido')
      if (error) throw new Error(error.message)
      return data ?? []
    }
  )

  const actualizar = async (id: string, cambios: Partial<Profesora>) => {
    const { error } = await createClient().from('profesoras').update(cambios).eq('id', id)
    if (!error) {
      setData(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p))
      invalidateQuery('profesoras')
    }
    return !error
  }

  const agregar = async (nueva: any) => {
    const { data: row, error } = await createClient().from('profesoras').insert(nueva).select().single()
    if (row && !error) {
      setData(prev => [...prev, row])
      invalidateQuery('profesoras')
    }
    return row
  }

  return { profesoras: data, loading: isLoading, actualizar, agregar, recargar: refetch }
}

// ── useCursos ─────────────────────────────────────────────────────────────────
export function useCursos() {
  const { data, setData, isLoading, refetch } = useSupabaseQuery<Curso>(
    'cursos',
    async () => {
      const { data, error } = await createClient()
        .from('cursos').select('*').eq('activo', true).order('nombre')
      if (error) throw new Error(error.message)
      return data ?? []
    }
  )

  const actualizar = async (id: string, cambios: Partial<Curso>) => {
    const { error } = await createClient().from('cursos').update(cambios).eq('id', id)
    if (!error) {
      setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
      invalidateQuery('cursos')
      logActivity('Editó curso', 'Cursos', `ID: ${id}`)
    }
    return !error
  }

  const agregar = async (nuevo: any) => {
    const { data: row, error } = await createClient().from('cursos').insert(nuevo).select().single()
    if (row && !error) {
      setData(prev => [...prev, row])
      invalidateQuery('cursos')
      logActivity('Creó curso', 'Cursos', row.nombre || '')
    }
    return row
  }

  const eliminar = async (id: string) => {
    const { error } = await createClient().from('cursos').update({ activo: false }).eq('id', id)
    if (!error) {
      setData(prev => prev.filter(c => c.id !== id))
      invalidateQuery('cursos')
      logActivity('Eliminó curso', 'Cursos', `ID: ${id}`)
    }
    return !error
  }

  return { cursos: data, loading: isLoading, actualizar, agregar, eliminar, recargar: refetch }
}

// ── useAlumnos ────────────────────────────────────────────────────────────────
export function useAlumnos() {
  const { data, setData, isLoading, refetch } = useSupabaseQuery<Alumno>(
    'alumnos',
    async () => {
      const { data, error } = await createClient()
        .from('alumnos').select('*').eq('activo', true).order('apellido')
      if (error) throw new Error(error.message)
      return data ?? []
    }
  )

  const actualizar = async (id: string, cambios: Partial<Alumno>) => {
    const { error } = await createClient().from('alumnos').update(cambios).eq('id', id)
    if (!error) {
      setData(prev => prev.map(a => a.id === id ? { ...a, ...cambios } : a))
      invalidateQuery('alumnos')
      logActivity('Editó alumno', 'Alumnos', `ID: ${id}`)
    }
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
      const res = await window.fetch('/api/crear-alumno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      })
      const json = await res.json()
      if (json.error) { console.error('[useAlumnos agregar]', json.error); return null }
      if (json.data) {
        setData(prev => [...prev, json.data])
        invalidateQuery('alumnos')
        logActivity('Agregó alumno', 'Alumnos', `${json.data.nombre} ${json.data.apellido}`)
        return json.data
      }
    } catch (e: any) {
      console.error('[useAlumnos agregar] catch', e?.message)
    }
    return null
  }

  return { alumnos: data, loading: isLoading, actualizar, agregar, recargar: refetch }
}

// ── useCursoAlumnos ───────────────────────────────────────────────────────────
export function useCursoAlumnos(cursoId: string) {
  const { data, setData, refetch } = useSupabaseQuery<Alumno>(
    `cursoAlumnos-${cursoId}`,
    async () => {
      if (!cursoId) return []
      const { data, error } = await createClient()
        .from('cursos_alumnos').select('alumno_id, alumnos(*)').eq('curso_id', cursoId)
      if (error) throw new Error(error.message)
      return data?.map((r: any) => r.alumnos).filter(Boolean) ?? []
    },
    { skip: !cursoId }
  )

  const agregar = async (alumnoId: string) => {
    await createClient().from('cursos_alumnos').upsert(
      { curso_id: cursoId, alumno_id: alumnoId, fecha_ingreso: new Date().toISOString().split('T')[0] },
      { onConflict: 'curso_id,alumno_id', ignoreDuplicates: true }
    )
    refetch()
    return true
  }

  const quitar = async (alumnoId: string) => {
    setData(prev => prev.filter(a => a.id !== alumnoId))
    await createClient().from('cursos_alumnos').delete()
      .eq('curso_id', cursoId).eq('alumno_id', alumnoId)
    return true
  }

  return { alumnosCurso: data, agregar, quitar, recargar: refetch }
}

// ── useClases ─────────────────────────────────────────────────────────────────
export function useClases(cursoId: string) {
  const { data, setData, isLoading, refetch } = useSupabaseQuery<Clase>(
    `clases-${cursoId}`,
    async () => {
      if (!cursoId) return []
      const { data, error } = await createClient().from('clases')
        .select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    { skip: !cursoId }
  )

  const agregar = async (clase: any) => {
    const { data: row, error } = await createClient().from('clases').insert(clase).select().single()
    if (row && !error) {
      setData(prev => [row, ...prev])
      invalidateQuery(`clases-${cursoId}`)
      logActivity('Registró clase', 'Cursos', row.fecha || '')
    }
    return row
  }

  const actualizar = async (id: string, cambios: any) => {
    const { error } = await createClient().from('clases').update(cambios).eq('id', id)
    if (!error) {
      setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
      invalidateQuery(`clases-${cursoId}`)
    }
    return !error
  }

  return { clases: data, setData, loading: isLoading, agregar, actualizar, recargar: refetch }
}

// ── usePagos ──────────────────────────────────────────────────────────────────
export function usePagos(alumnoId: string) {
  const { data, setData, refetch } = useSupabaseQuery<Pago>(
    `pagos-${alumnoId}`,
    async () => {
      if (!alumnoId) return []
      const { data, error } = await createClient().from('pagos_alumnos').select('*')
        .eq('alumno_id', alumnoId).order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    },
    { skip: !alumnoId }
  )

  const registrar = async (pago: any) => {
    try {
      const res = await window.fetch('/api/registrar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pago)
      })
      const json = await res.json()
      if (json.error) { console.error('[usePagos registrar]', json.error); return null }
      logActivity('Registró pago', 'Pagos', `${pago.mes} ${pago.anio} - $${pago.monto}`)
      if (json.data) {
        setData(prev => {
          const sinDup = prev.filter(p => !(p.mes === json.data.mes && p.anio === json.data.anio))
          return [json.data, ...sinDup]
        })
        invalidateQuery(`pagos-${alumnoId}`)
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
  const { data, setData, refetch } = useSupabaseQuery<any>(
    `examenes-${cursoId}`,
    async () => {
      if (!cursoId) return []
      const { data, error } = await createClient().from('examenes')
        .select('*').eq('curso_id', cursoId).order('fecha')
      if (error) throw new Error(error.message)
      return data ?? []
    },
    { skip: !cursoId }
  )

  const agregar = async (ex: any) => {
    const { data: row, error } = await createClient().from('examenes').insert(ex).select().single()
    if (row && !error) {
      setData(prev => [...prev, row])
      invalidateQuery(`examenes-${cursoId}`)
      logActivity('Creó examen', 'Cursos', row.nombre || '')
    }
    return row
  }

  const eliminar = async (id: string) => {
    await createClient().from('examenes').delete().eq('id', id)
    setData(prev => prev.filter(e => e.id !== id))
    invalidateQuery(`examenes-${cursoId}`)
  }

  return { examenes: data, agregar, eliminar, recargar: refetch }
}

// ── useAsistencia ─────────────────────────────────────────────────────────────
// No usa useSupabaseQuery — estructura de datos es Record<claseId, Record<alumnoId, estado>>
export function useAsistencia(cursoId: string) {
  const [data, setData] = useState<Record<string, Record<string, string>>>(() => {
    if (typeof window === 'undefined') return {}
    try {
      const raw = sessionStorage.getItem(`nq_asistencia-${cursoId}`)
      if (raw) { const { data: cached } = JSON.parse(raw); if (cached) return cached }
    } catch {}
    return {}
  })

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
        try {
          if (typeof window !== 'undefined')
            sessionStorage.setItem(`nq_asistencia-${cursoId}`, JSON.stringify({ data: m, ts: Date.now() }))
        } catch {}
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
// No usa useSupabaseQuery — lógica de lookup por email/nombre especial
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
  const { data, setData } = useSupabaseQuery<any>(
    `notasExamen-${examenId}`,
    async () => {
      if (!examenId) return []
      const { data, error } = await createClient().from('notas_examenes')
        .select('*').eq('examen_id', examenId)
      if (error) throw new Error(error.message)
      return data ?? []
    },
    { skip: !examenId }
  )

  const guardarNota = async (alumnoId: string, campos: any) => {
    const { data: row } = await createClient().from('notas_examenes')
      .upsert({ examen_id: examenId, alumno_id: alumnoId, ...campos }, { onConflict: 'examen_id,alumno_id' })
      .select().single()
    if (row) {
      setData(prev => {
        const idx = prev.findIndex((n: any) => n.alumno_id === alumnoId)
        if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
        return [...prev, row]
      })
      invalidateQuery(`notasExamen-${examenId}`)
    }
  }

  return { notas: data, guardarNota }
}

// ── useHorario ────────────────────────────────────────────────────────────────
export function useHorario() {
  const { data, setData, isLoading, refetch } = useSupabaseQuery<HorarioItem>(
    'horario',
    async () => {
      const { data, error } = await createClient().from('horario')
        .select('*').eq('activo', true).order('hora_inicio')
      if (error) throw new Error(error.message)
      return data ?? []
    }
  )

  const agregar = async (item: any) => {
    const { data: row, error } = await createClient().from('horario').insert(item).select().single()
    if (row && !error) {
      setData(prev => [...prev, row])
      invalidateQuery('horario')
    }
    return row
  }

  const eliminar = async (id: string) => {
    const { error } = await createClient().from('horario').delete().eq('id', id)
    if (!error) {
      setData(prev => prev.filter(h => h.id !== id))
      invalidateQuery('horario')
    }
    return !error
  }

  return { horario: data, loading: isLoading, agregar, eliminar, recargar: refetch }
}

// ── useComunicados ────────────────────────────────────────────────────────────
export function useComunicados() {
  const { data, setData, isLoading, refetch } = useSupabaseQuery<any>(
    'comunicados',
    async () => {
      const { data, error } = await createClient().from('comunicados')
        .select('*').eq('activo', true).order('created_at', { ascending: false })
      if (error) throw new Error(error.message)
      return data ?? []
    }
  )

  const agregar = async (c: any) => {
    const { data: row } = await createClient().from('comunicados').insert(c).select().single()
    if (row) {
      setData(prev => [row, ...prev])
      invalidateQuery('comunicados')
    }
    return row
  }

  const eliminar = async (id: string) => {
    await createClient().from('comunicados').update({ activo: false }).eq('id', id)
    setData(prev => prev.filter(c => c.id !== id))
    invalidateQuery('comunicados')
  }

  return { comunicados: data, loading: isLoading, agregar, eliminar, recargar: refetch }
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
