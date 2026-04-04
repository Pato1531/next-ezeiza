'use client'

import { useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profesora, Alumno, Curso, Clase, HorarioItem, Pago, AsistenciaClase } from '@/lib/supabase'

// ── CRÍTICO: NO instanciar supabase a nivel módulo ──────────────────────────
// Si se hace createClient() aquí, el cliente queda fijo aunque destroyClient()
// lo destruya en el logout. Siempre llamar createClient() dentro de cada función
// para obtener el cliente vigente.
// const supabase = createClient()  ← REMOVIDO

// ── STORE GLOBAL ──
export const store: Record<string, any[]> = {}
export const storeTs: Record<string, number> = {}
const loadingKeys: Set<string> = new Set()
const listeners: Record<string, Set<() => void>> = {}
const TTL = 90000 // 90 segundos



function isStale(key: string) {
  return !storeTs[key] || (Date.now() - storeTs[key]) > TTL
}

function notify(key: string) {
  listeners[key]?.forEach(fn => fn())
}

function subscribe(key: string, fn: () => void) {
  if (!listeners[key]) listeners[key] = new Set()
  listeners[key].add(fn)
  return () => listeners[key]?.delete(fn)
}



async function loadOnce(key: string, loader: () => Promise<any[]>, force = false) {
  if (store[key] !== undefined && !force && !isStale(key)) return
  if (loadingKeys.has(key)) return
  loadingKeys.add(key)
  try {
    const data = await loader()
    store[key] = data
    storeTs[key] = Date.now()
    notify(key)
  } catch (e: any) {
    // Error en query — mantener datos existentes, NO cerrar sesión
    console.warn('[Store] Error en query key=' + key + ':', e?.message)
    if (store[key] === undefined) store[key] = []
    notify(key)
  } finally {
    loadingKeys.delete(key)
  }
}

function useStore<T>(key: string, loader: () => Promise<T[]>): [T[], boolean] {
  const [data, setData] = useState<T[]>(store[key] ?? [])
  const [isLoading, setIsLoading] = useState(!store[key])

  useEffect(() => {
    if (store[key] !== undefined) {
      setData(store[key])
      setIsLoading(false)
    }
    const unsub = subscribe(key, () => {
      setData(store[key] ?? [])
      setIsLoading(false)
    })
    loadOnce(key, loader, isStale(key))
    return unsub
  }, [key])

  return [data, isLoading]
}

export function invalidateStore(key?: string) {
  if (key) {
    // Solo invalidar timestamp — mantener datos hasta que lleguen los nuevos
    // Esto evita el parpadeo a [] que rompe los componentes con .find()
    delete storeTs[key]
  } else {
    // Invalidar todos los timestamps — los datos se actualizan en background
    Object.keys(storeTs).forEach(k => delete storeTs[k])
  }
}

// Usar SOLO en logout — borra datos además de timestamps
export function clearStore() {
  Object.keys(store).forEach(k => { delete store[k]; delete storeTs[k] })
}

// ── LOADERS centralizados — usan createClient() dinámico ───────────────────
const LOADERS: Record<string, () => Promise<any[]>> = {
  alumnos: async () => {
    const sb = createClient()
    const { data, error } = await sb.from('alumnos').select('*').eq('activo', true).order('apellido')
    if (error) throw error
    return data ?? []
  },
  cursos: async () => {
    const sb = createClient()
    const { data, error } = await sb.from('cursos').select('*').eq('activo', true).order('nombre')
    if (error) throw error
    return data ?? []
  },
  profesoras: async () => {
    const sb = createClient()
    const { data, error } = await sb.from('profesoras').select('*').eq('activa', true).order('apellido')
    if (error) throw error
    return data ?? []
  },
}

if (typeof window !== 'undefined') {
  setInterval(() => {
    Object.keys(LOADERS).forEach(key => {
      if (listeners[key]?.size > 0 && isStale(key)) {
        loadOnce(key, LOADERS[key], true)
      }
    })
  }, 90000)

  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    // Invalidar TODOS los timestamps — no solo los de LOADERS
    // Esto hace que pagos_xxx, cursoAlumnos_xxx, clases_xxx, etc.
    // se consideren viejos y se recarguen al montar
    Object.keys(storeTs).forEach(key => { delete storeTs[key] })
    // Recargar inmediatamente las keys globales con listeners
    setTimeout(() => {
      Object.keys(LOADERS).forEach(key => {
        if (listeners[key]?.size > 0) {
          loadOnce(key, LOADERS[key], true)
        }
      })
    }, 300)
  })
}

// ── PROFESORAS ──
export function useProfesoras() {
  const [data, isLoading] = useStore<Profesora>('profesoras', LOADERS.profesoras)

  const actualizar = async (id: string, cambios: Partial<Profesora>) => {
    const sb = createClient()
    const { error } = await sb.from('profesoras').update(cambios).eq('id', id)
    if (!error) {
      store['profesoras'] = store['profesoras']?.map((p: any) => p.id === id ? { ...p, ...cambios } : p)
      notify('profesoras')
    }
    return !error
  }

  const agregar = async (nueva: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('profesoras').insert(nueva).select().single()
    if (row && !error) { store['profesoras'] = [...(store['profesoras'] ?? []), row]; notify('profesoras') }
    return row
  }

  const recargar = async () => {
    delete store['profesoras']
    await loadOnce('profesoras', LOADERS.profesoras, true)
  }

  return { profesoras: data, loading: isLoading, actualizar, agregar, recargar }
}

// ── ALUMNOS ──
export function useAlumnos() {
  const [data, isLoading] = useStore<Alumno>('alumnos', LOADERS.alumnos)

  const actualizar = async (id: string, cambios: Partial<Alumno>) => {
    const sb = createClient()
    const { error } = await sb.from('alumnos').update(cambios).eq('id', id)
    if (!error) {
      store['alumnos'] = store['alumnos']?.map((a: any) => a.id === id ? { ...a, ...cambios } : a)
      notify('alumnos')
    }
    return !error
  }

  const agregar = async (nuevo: any) => {
    const datos = {
      nombre: nuevo.nombre,
      apellido: nuevo.apellido,
      edad: nuevo.edad || null,
      telefono: nuevo.telefono || null,
      email: nuevo.email || null,
      nivel: nuevo.nivel || 'Básico',
      cuota_mensual: nuevo.cuota_mensual || 0,
      es_menor: nuevo.es_menor || false,
      padre_nombre: nuevo.padre_nombre || null,
      padre_telefono: nuevo.padre_telefono || null,
      padre_email: nuevo.padre_email || null,
      color: nuevo.color || '#652f8d',
      activo: true,
    }
    try {
      const res = await fetch('/api/crear-alumno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(datos)
      })
      const json = await res.json()
      if (json.error) { console.error('Error creando alumno:', json.error); return null }
      const row = json.data
      delete store['alumnos']
      loadOnce('alumnos', LOADERS.alumnos, true)
      return row
    } catch (e: any) {
      console.error('Error agregando alumno:', e?.message)
      return null
    }
  }

  const recargar = async () => {
    delete store['alumnos']
    await loadOnce('alumnos', LOADERS.alumnos, true)
  }

  return { alumnos: data, loading: isLoading, actualizar, agregar, recargar }
}

// ── CURSOS ──
export function useCursos() {
  const [data, isLoading] = useStore<Curso>('cursos', LOADERS.cursos)

  const actualizar = async (id: string, cambios: Partial<Curso>) => {
    const sb = createClient()
    const { error } = await sb.from('cursos').update(cambios).eq('id', id)
    if (!error) {
      store['cursos'] = store['cursos']?.map((c: any) => c.id === id ? { ...c, ...cambios } : c)
      notify('cursos')
    }
    return !error
  }

  const agregar = async (nuevo: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('cursos').insert(nuevo).select().single()
    if (row && !error) { store['cursos'] = [...(store['cursos'] ?? []), row]; notify('cursos') }
    return row
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('cursos').update({ activo: false }).eq('id', id)
    if (!error) { store['cursos'] = store['cursos']?.filter((c: any) => c.id !== id); notify('cursos') }
    return !error
  }

  return { cursos: data, loading: isLoading, actualizar, agregar, eliminar }
}

// ── PAGOS DE UN ALUMNO ──
export function usePagos(alumnoId: string) {
  const storeKey = `pagos_${alumnoId}`
  const [data, setData] = useState<Pago[]>(store[storeKey] ?? [])

  useEffect(() => {
    if (!alumnoId) return
    if (store[storeKey] && !isStale(storeKey)) { setData(store[storeKey]); return }
    const sb = createClient()
    sb.from('pagos_alumnos').select('*').eq('alumno_id', alumnoId)
      .order('created_at', { ascending: false })
      .then(({ data }) => {
        const result = data ?? []
        store[storeKey] = result
        storeTs[storeKey] = Date.now()
        setData(result)
      })
  }, [alumnoId])

  const registrar = async (pago: any) => {
    try {
      const res = await fetch('/api/registrar-pago', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(pago)
      })
      const json = await res.json()
      if (json.error) { console.error('Error registrando pago:', json.error); return null }
      const row = json.data
      if (row) {
        const sinDup = (store[storeKey] || []).filter((p: any) => !(p.mes === row.mes && p.anio === row.anio))
        const nuevo = [row, ...sinDup]
        store[storeKey] = nuevo
        storeTs[storeKey] = Date.now()
        setData(nuevo)
      }
      return row
    } catch (e) { console.error('Error registrar pago:', e); return null }
  }

  return { pagos: data, registrar }
}

// ── ALUMNOS DE UN CURSO ──
export function useCursoAlumnos(cursoId: string) {
  const storeKey = `cursoAlumnos_${cursoId}`

  // Usar store global para persistir entre remontajes
  const [data, setData] = useState<Alumno[]>(store[storeKey] ?? [])
  const retryRef = useRef(0)
  const loadingRef = useRef(false)

  const cargar = useCallback(async (force = false) => {
    if (!cursoId) return
    // Si hay datos en store y no es forzado, usarlos
    if (store[storeKey] && !force && !isStale(storeKey)) {
      setData(store[storeKey])
      return
    }
    if (loadingRef.current) return
    loadingRef.current = true
    const sb = createClient()
    try {
      const { data, error } = await sb.from('cursos_alumnos').select('alumno_id, alumnos(*)').eq('curso_id', cursoId)
      if (error) throw error
      const al = data?.map((r: any) => r.alumnos).filter(Boolean) ?? []
      store[storeKey] = al
      storeTs[storeKey] = Date.now()
      setData(al)
      retryRef.current = 0
    } catch (e) {
      // Si hay datos en cache, mantenerlos
      if (store[storeKey]) setData(store[storeKey])
      if (retryRef.current < 3) {
        retryRef.current++
        setTimeout(() => cargar(true), 2000 * retryRef.current)
      }
    } finally {
      loadingRef.current = false
    }
  }, [cursoId, storeKey])

  useEffect(() => {
    // Si ya hay datos en store, mostrarlos inmediatamente
    if (store[storeKey]) setData(store[storeKey])
    retryRef.current = 0
    cargar()

    // Suscribirse a cambios del store para este curso
    const unsub = subscribe(storeKey, () => {
      if (store[storeKey]) setData(store[storeKey])
    })
    return unsub
  }, [cargar, storeKey])

  const agregar = async (alumnoId: string) => {
    const alumnoStore = (store['alumnos'] || []).find((a: any) => a.id === alumnoId)
    if (alumnoStore) {
      const nuevo = store[storeKey]
        ? store[storeKey].find((a: any) => a.id === alumnoId) ? store[storeKey] : [...store[storeKey], alumnoStore]
        : [alumnoStore]
      store[storeKey] = nuevo
      storeTs[storeKey] = Date.now()
      setData(nuevo)
    }
    const sb = createClient()
    sb.from('cursos_alumnos').upsert({
      curso_id: cursoId, alumno_id: alumnoId,
      fecha_ingreso: new Date().toISOString().split('T')[0]
    }, { onConflict: 'curso_id,alumno_id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) { console.error('Error agregando alumno:', error); cargar(true) } })
      .catch(() => cargar(true))
    return true
  }

  const quitar = async (alumnoId: string) => {
    const nuevo = (store[storeKey] || []).filter((a: any) => a.id !== alumnoId)
    store[storeKey] = nuevo
    storeTs[storeKey] = Date.now()
    setData(nuevo)
    const sb = createClient()
    sb.from('cursos_alumnos').delete().eq('curso_id', cursoId).eq('alumno_id', alumnoId)
      .catch(() => cargar(true))
    return true
  }

  return { alumnosCurso: data, agregar, quitar, recargar: () => cargar(true) }
}

// ── CLASES ──
export function useClases(cursoId: string) {
  const storeKey = `clases_${cursoId}`
  const [data, setData] = useState<Clase[]>(store[storeKey] ?? [])
  const [isLoading, setIsLoading] = useState(!store[storeKey])

  const cargar = useCallback(async () => {
    if (!cursoId) { setIsLoading(false); return }
    if (store[storeKey] && !isStale(storeKey)) { setData(store[storeKey]); setIsLoading(false); return }
    const sb = createClient()
    try {
      const { data, error } = await sb.from('clases').select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
      if (!error) {
        const result = data ?? []
        store[storeKey] = result
        storeTs[storeKey] = Date.now()
        setData(result)
      } else if (store[storeKey]) {
        setData(store[storeKey])
      }
    } catch {
      if (store[storeKey]) setData(store[storeKey])
    }
    setIsLoading(false)
  }, [cursoId])

  useEffect(() => {
    if (store[storeKey]) { setData(store[storeKey]); setIsLoading(false) }
    cargar()
  }, [cargar])

  const agregar = async (clase: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('clases').insert(clase).select().single()
    if (row && !error) {
      const nuevo = [row, ...(store[storeKey] || [])]
      store[storeKey] = nuevo
      storeTs[storeKey] = Date.now()
      setData(nuevo)
    }
    return row
  }

  const actualizar = async (id: string, cambios: any) => {
    const sb = createClient()
    const { error } = await sb.from('clases').update(cambios).eq('id', id)
    if (!error) {
      const nuevo = (store[storeKey] || []).map((c: any) => c.id === id ? { ...c, ...cambios } : c)
      store[storeKey] = nuevo
      storeTs[storeKey] = Date.now()
      setData(nuevo)
    }
    return !error
  }

  return { clases: data, loading: isLoading, agregar, actualizar, recargar: cargar }
}

// ── ASISTENCIA ──
export function useAsistencia(cursoId: string) {
  const [data, setData] = useState<Record<string, Record<string, string>>>({})

  useEffect(() => {
    if (!cursoId) return
    const sb = createClient()
    sb.from('asistencia_clases')
      .select('clase_id, alumno_id, estado')
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
    const sb = createClient()
    await sb.from('asistencia_clases').upsert(
      { clase_id: claseId, alumno_id: alumnoId, estado },
      { onConflict: 'clase_id,alumno_id' }
    )
    setData(prev => ({ ...prev, [claseId]: { ...(prev[claseId] || {}), [alumnoId]: estado } }))
  }

  return { asistencias: data, guardar }
}

// ── MI PROFESORA ──
export function useMiProfesora() {
  const storeKey = 'miProfesora'
  const [data, setData] = useState<Profesora | null>(store[storeKey]?.[0] ?? null)
  const [isLoading, setIsLoading] = useState(!store[storeKey])

  useEffect(() => {
    // Si ya está en cache, no volver a buscar
    if (store[storeKey]) { setData(store[storeKey][0] ?? null); setIsLoading(false); return }
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setIsLoading(false); return }
      sb.from('profesoras').select('*').ilike('email', user.email || '').limit(1)
        .then(({ data: rows }) => {
          if (rows?.length) {
            store[storeKey] = rows
            storeTs[storeKey] = Date.now()
            setData(rows[0])
            setIsLoading(false)
            return
          }
          sb.from('usuarios').select('nombre').eq('id', user.id).single()
            .then(({ data: u }) => {
              if (!u) { setIsLoading(false); return }
              const nombre = u.nombre.split(' ')[0]
              sb.from('profesoras').select('*').ilike('nombre', `%${nombre}%`).limit(1)
                .then(({ data: rows2 }) => {
                  const result = rows2 ?? []
                  store[storeKey] = result
                  storeTs[storeKey] = Date.now()
                  setData(result[0] ?? null)
                  setIsLoading(false)
                })
            })
        })
    })
  }, [])

  return { miProfesora: data, loading: isLoading }
}

// ── EXAMENES ──
export function useExamenes(cursoId: string) {
  const storeKey = `examenes_${cursoId}`
  const [data, setData] = useState<any[]>(store[storeKey] ?? [])

  const cargar = useCallback(async () => {
    if (!cursoId) return
    if (store[storeKey] && !isStale(storeKey)) { setData(store[storeKey]); return }
    const sb = createClient()
    const { data } = await sb.from('examenes').select('*').eq('curso_id', cursoId).order('fecha')
    const result = data ?? []
    store[storeKey] = result
    storeTs[storeKey] = Date.now()
    setData(result)
  }, [cursoId])

  useEffect(() => {
    if (store[storeKey]) setData(store[storeKey])
    cargar()
  }, [cargar])

  const agregar = async (ex: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('examenes').insert(ex).select().single()
    if (row && !error) {
      const nuevo = [...(store[storeKey] || []), row]
      store[storeKey] = nuevo
      storeTs[storeKey] = Date.now()
      setData(nuevo)
    }
    return row
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    await sb.from('examenes').delete().eq('id', id)
    const nuevo = (store[storeKey] || []).filter((e: any) => e.id !== id)
    store[storeKey] = nuevo
    storeTs[storeKey] = Date.now()
    setData(nuevo)
  }

  return { examenes: data, agregar, eliminar, recargar: cargar }
}

// ── NOTAS EXAMEN ──
export function useNotasExamen(examenId: string) {
  const storeKey = `notas_${examenId}`
  const [data, setData] = useState<any[]>(store[storeKey] ?? [])

  useEffect(() => {
    if (!examenId) return
    if (store[storeKey] && !isStale(storeKey)) { setData(store[storeKey]); return }
    const sb = createClient()
    sb.from('notas_examenes').select('*').eq('examen_id', examenId)
      .then(({ data }) => {
        const result = data ?? []
        store[storeKey] = result
        storeTs[storeKey] = Date.now()
        setData(result)
      })
  }, [examenId])

  const guardarNota = async (alumnoId: string, campos: any) => {
    const sb = createClient()
    const { data: row } = await sb.from('notas_examenes')
      .upsert({ examen_id: examenId, alumno_id: alumnoId, ...campos }, { onConflict: 'examen_id,alumno_id' })
      .select().single()
    if (row) {
      const prev = store[storeKey] || []
      const idx = prev.findIndex((n: any) => n.alumno_id === alumnoId)
      const nuevo = idx >= 0
        ? prev.map((n: any, i: number) => i === idx ? row : n)
        : [...prev, row]
      store[storeKey] = nuevo
      storeTs[storeKey] = Date.now()
      setData(nuevo)
    }
  }

  return { notas: data, guardarNota }
}

// ── HORARIO ──
export function useHorario() {
  const [data, setData] = useState<HorarioItem[]>([])
  const [isLoading, setIsLoading] = useState(true)

  const cargar = useCallback(async () => {
    const sb = createClient()
    const { data } = await sb.from('horario').select('*').eq('activo', true).order('hora_inicio')
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (item: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('horario').insert(item).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    const { error } = await sb.from('horario').delete().eq('id', id)
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
    const sb = createClient()
    const { data } = await sb.from('comunicados').select('*').eq('activo', true).order('created_at', { ascending: false })
    setData(data ?? [])
    setIsLoading(false)
  }, [])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (c: any) => {
    const sb = createClient()
    const { data: row } = await sb.from('comunicados').insert(c).select().single()
    if (row) setData(prev => [row, ...prev])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    await sb.from('comunicados').update({ activo: false }).eq('id', id)
    setData(prev => prev.filter(c => c.id !== id))
  }

  return { comunicados: data, loading: isLoading, agregar, eliminar, recargar: cargar }
}

// ── HISTORIAL CURSOS ──
export function useHistorialCursos(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!alumnoId) return
    const sb = createClient()
    sb.from('historial_cursos').select('*')
      .eq('alumno_id', alumnoId)
      .order('fecha', { ascending: false })
      .limit(10)
      .then(({ data, error }) => { if (!error) setData(data ?? []) })
      .catch(() => {})
  }, [alumnoId])

  const registrar = async (h: any) => {
    const sb = createClient()
    sb.from('historial_cursos').insert(h).catch(() => {})
  }

  return { historial: data, registrar }
}

// ── CUOTAS HISTORIAL ──
export function useCuotasHistorial(alumnoId?: string) {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(false)

  useEffect(() => {
    if (!alumnoId) return
    const sb = createClient()
    sb.from('cuotas_historial').select('*')
      .eq('alumno_id', alumnoId)
      .order('vigente_desde', { ascending: false })
      .limit(10)
      .then(({ data, error }) => { if (!error) setData(data ?? []) })
      .catch(() => {})
  }, [alumnoId])

  const registrarCambio = async (cambio: any) => {
    const sb = createClient()
    sb.from('cuotas_historial').insert(cambio).catch(() => {})
  }

  return { historial: data, loading: isLoading, registrarCambio }
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
    const sb = createClient()
    await sb.from('horas_historial').insert(cambio)
  }

  return { historial: data, loading: isLoading, registrarCambio }
}

// ── LIQUIDACIONES ──
export function useLiquidaciones(profesoraId?: string) {
  const [data, setData] = useState<any[]>([])
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    let q = sb.from('liquidaciones').select('*').order('anio', { ascending: false }).order('created_at', { ascending: false })
    if (profesoraId) q = (q as any).eq('profesora_id', profesoraId)
    q.limit(24).then(({ data }) => { setData(data ?? []); setIsLoading(false) })
  }, [profesoraId])

  const guardar = async (liq: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('liquidaciones')
      .upsert(liq, { onConflict: 'profesora_id,mes,anio' })
      .select().single()
    if (error) { console.error(error); return null }
    setData(prev => {
      const idx = prev.findIndex(l => l.mes === liq.mes && l.anio === liq.anio)
      if (idx >= 0) { const n = [...prev]; n[idx] = row; return n }
      return [row, ...prev]
    })
    return row
  }

  return { liquidaciones: data, loading: isLoading, guardar }
}
