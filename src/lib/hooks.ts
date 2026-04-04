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
const storeTs: Record<string, number> = {}
const loadingKeys: Set<string> = new Set()
const listeners: Record<string, Set<() => void>> = {}
const TTL = 90000 // 90 segundos

// Bus de eventos para errores de autenticación
type AuthErrorHandler = () => void
let onAuthErrorHandler: AuthErrorHandler | null = null

// Registrar handler global — lo llama el AuthProvider
export function setAuthErrorHandler(fn: AuthErrorHandler) {
  onAuthErrorHandler = fn
}

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

// Detectar si un error de Supabase es de autenticación
function isAuthError(error: any): boolean {
  if (!error) return false
  const msg = (error.message || '').toLowerCase()
  const code = error.code || error.status || 0
  return (
    code === 401 ||
    code === 403 ||
    msg.includes('jwt expired') ||
    msg.includes('invalid token') ||
    msg.includes('not authenticated') ||
    msg.includes('session') ||
    msg.includes('unauthorized')
  )
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
    // Si es error de auth → notificar al AuthProvider para que desloguee
    if (isAuthError(e)) {
      console.warn('[Store] Error de autenticación detectado, invalidando sesión')
      onAuthErrorHandler?.()
      return // No actualizar el store con datos vacíos
    }
    // Error de red u otro — mantener datos existentes si los hay
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
  // Refrescar datos cada 90s si hay listeners activos
  setInterval(() => {
    Object.keys(LOADERS).forEach(key => {
      if (listeners[key]?.size > 0 && isStale(key)) {
        loadOnce(key, LOADERS[key], true)
      }
    })
  }, 90000)

  // Al volver a la pestaña: esperar 800ms para que Supabase
  // termine de refrescar el token ANTES de lanzar queries
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState !== 'visible') return
    setTimeout(() => {
      Object.keys(LOADERS).forEach(key => {
        if (listeners[key]?.size > 0) {
          delete storeTs[key]
          loadOnce(key, LOADERS[key], true)
        }
      })
    }, 800) // dar tiempo al refresh de token
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
  const [data, setData] = useState<Pago[]>([])

  useEffect(() => {
    if (!alumnoId) return
    const sb = createClient()
    sb.from('pagos_alumnos').select('*').eq('alumno_id', alumnoId).order('created_at', { ascending: false })
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
      if (json.error) { console.error('Error registrando pago:', json.error); return null }
      const row = json.data
      if (row) setData(prev => {
        const sinDup = prev.filter(p => !(p.mes === row.mes && p.anio === row.anio))
        return [row, ...sinDup]
      })
      return row
    } catch (e) { console.error('Error registrar pago:', e); return null }
  }

  return { pagos: data, registrar }
}

// ── ALUMNOS DE UN CURSO ──
export function useCursoAlumnos(cursoId: string) {
  const [data, setData] = useState<Alumno[]>([])
  const retryRef = useRef(0)

  const cargar = useCallback(async () => {
    if (!cursoId) return
    const sb = createClient()
    try {
      const { data, error } = await sb.from('cursos_alumnos').select('alumno_id, alumnos(*)').eq('curso_id', cursoId)
      if (error) throw error
      const al = data?.map((r: any) => r.alumnos).filter(Boolean) ?? []
      setData(al)
      retryRef.current = 0
    } catch (e) {
      if (retryRef.current < 3) {
        retryRef.current++
        setTimeout(() => cargar(), 2000 * retryRef.current)
      }
    }
  }, [cursoId])

  useEffect(() => { retryRef.current = 0; cargar() }, [cargar])

  const agregar = async (alumnoId: string) => {
    const alumnoStore = (store['alumnos'] || []).find((a: any) => a.id === alumnoId)
    if (alumnoStore) setData(prev => {
      if (prev.find(a => a.id === alumnoId)) return prev
      return [...prev, alumnoStore]
    })
    const sb = createClient()
    sb.from('cursos_alumnos').upsert({
      curso_id: cursoId, alumno_id: alumnoId,
      fecha_ingreso: new Date().toISOString().split('T')[0]
    }, { onConflict: 'curso_id,alumno_id', ignoreDuplicates: true })
      .then(({ error }) => { if (error) { console.error('Error agregando alumno:', error); cargar() } })
      .catch(() => cargar())
    return true
  }

  const quitar = async (alumnoId: string) => {
    setData(prev => prev.filter(a => a.id !== alumnoId))
    const sb = createClient()
    sb.from('cursos_alumnos').delete().eq('curso_id', cursoId).eq('alumno_id', alumnoId)
      .catch(() => cargar())
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
    const sb = createClient()
    try {
      const { data, error } = await sb.from('clases').select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
      if (!error) setData(data ?? [])
    } catch {}
    setIsLoading(false)
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (clase: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('clases').insert(clase).select().single()
    if (row && !error) setData(prev => [row, ...prev])
    return row
  }

  const actualizar = async (id: string, cambios: any) => {
    const sb = createClient()
    const { error } = await sb.from('clases').update(cambios).eq('id', id)
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
  const [data, setData] = useState<Profesora | null>(null)
  const [isLoading, setIsLoading] = useState(true)

  useEffect(() => {
    const sb = createClient()
    sb.auth.getUser().then(({ data: { user } }) => {
      if (!user) { setIsLoading(false); return }
      sb.from('profesoras').select('*')
        .ilike('email', user.email || '')
        .limit(1)
        .then(({ data: rows }) => {
          if (rows && rows.length > 0) {
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
                  setData(rows2?.[0] ?? null)
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
  const [data, setData] = useState<any[]>([])

  const cargar = useCallback(async () => {
    if (!cursoId) return
    const sb = createClient()
    const { data } = await sb.from('examenes').select('*').eq('curso_id', cursoId).order('fecha')
    setData(data ?? [])
  }, [cursoId])

  useEffect(() => { cargar() }, [cargar])

  const agregar = async (ex: any) => {
    const sb = createClient()
    const { data: row, error } = await sb.from('examenes').insert(ex).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    const sb = createClient()
    await sb.from('examenes').delete().eq('id', id)
    setData(prev => prev.filter(e => e.id !== id))
  }

  return { examenes: data, agregar, eliminar, recargar: cargar }
}

// ── NOTAS EXAMEN ──
export function useNotasExamen(examenId: string) {
  const [data, setData] = useState<any[]>([])

  useEffect(() => {
    if (!examenId) return
    const sb = createClient()
    sb.from('notas_examenes').select('*').eq('examen_id', examenId)
      .then(({ data }) => setData(data ?? []))
  }, [examenId])

  const guardarNota = async (alumnoId: string, campos: any) => {
    const sb = createClient()
    const { data: row } = await sb.from('notas_examenes')
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
