'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, PERMISOS, puedeVer } from '@/lib/supabase'
import { invalidateStore, setSessionReady, setCurrentUserName, setInstitutoId } from '@/lib/hooks'

const SESSION_KEY   = 'ne_session_uid'
const INSTITUTO_KEY = 'ne_instituto_id'

export interface Instituto {
  id: string
  nombre: string
  slug: string
  plan: 'starter' | 'growth' | 'pro'
  logo_url?: string
  color_primario: string
  activo: boolean
}

interface AuthContextType {
  usuario: Usuario | null
  instituto: Instituto | null
  institutoId: string | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  puedeVer: (modulo: string) => boolean
  // Permisos efectivos del usuario logueado (custom o por rol)
  permisosEfectivos: string[]
  // Solo para el director: mapa { usuario_id → permisos_custom | null }
  permisosCustomPorUsuario: Record<string, string[] | null>
  recargarPermisosUsuarios: () => Promise<void>
}

const AuthContext = createContext<AuthContextType | null>(null)

// Permisos efectivos: si el usuario tiene permisos_custom los usa,
// si no cae al default del rol definido en supabase.ts
function calcularEfectivos(u: any): string[] {
  if (!u) return []
  if (Array.isArray(u.permisos_custom) && u.permisos_custom.length > 0) {
    return u.permisos_custom as string[]
  }
  return PERMISOS[u.rol as Rol] ?? []
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario,    setUsuario]    = useState<Usuario | null>(null)
  const [instituto,  setInstituto]  = useState<Instituto | null>(null)
  const [loading,    setLoading]    = useState(true)
  const [permisosEfectivos,        setPermisosEfectivos]        = useState<string[]>([])
  const [permisosCustomPorUsuario, setPermisosCustomPorUsuario] = useState<Record<string, string[] | null>>({})

  const usuarioRef         = useRef<Usuario | null>(null)
  const cargandoRef        = useRef(false)
  const loadingResolvedRef = useRef(false)

  const prevUid = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null
  const hadSessionRef = useRef<boolean>(Boolean(prevUid))

  const resolveLoading = () => {
    loadingResolvedRef.current = true
    setLoading(false)
  }

  useEffect(() => {
    const t = setTimeout(() => {
      if (!loadingResolvedRef.current) {
        console.warn('[auth] safety timeout — forzando resolución')
        try { localStorage.removeItem(SESSION_KEY) } catch {}
        hadSessionRef.current = false
        resolveLoading()
      }
    }, 4000)
    return () => clearTimeout(t)
  }, [])

  // Carga permisos_custom de todos los usuarios activos — solo lo llama el director
  const recargarPermisosUsuarios = async () => {
    const sb = createClient()
    const { data } = await sb
      .from('usuarios')
      .select('id, permisos_custom')
      .eq('activo', true)
    if (data) {
      const mapa: Record<string, string[] | null> = {}
      data.forEach((u: any) => { mapa[u.id] = u.permisos_custom ?? null })
      setPermisosCustomPorUsuario(mapa)
    }
  }

  const cargarUsuario = async (uid: string): Promise<boolean> => {
    if (cargandoRef.current) return true
    cargandoRef.current = true
    try {
      const sb = createClient()
      const { data, error } = await sb
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .single()

      if (data && !error) {
        setUsuario(data as Usuario)
        usuarioRef.current = data as Usuario
        hadSessionRef.current = true
        try { localStorage.setItem(SESSION_KEY, uid) } catch {}
        setCurrentUserName((data as any).nombre || (data as any).email || uid)

        // Calcular permisos efectivos del usuario logueado
        setPermisosEfectivos(calcularEfectivos(data))

        // Director: pre-carga mapa de permisos de todos los usuarios
        if ((data as any).rol === 'director') {
          recargarPermisosUsuarios()
        }

        const institutoId = (data as any).instituto_id
        if (institutoId) {
          try { localStorage.setItem(INSTITUTO_KEY, institutoId) } catch {}
          const { data: inst } = await sb
            .from('institutos').select('*').eq('id', institutoId).single()
          if (inst) { setInstituto(inst as Instituto); setInstitutoId(inst.id) }
        } else {
          const cachedId = typeof window !== 'undefined'
            ? localStorage.getItem(INSTITUTO_KEY) : null
          if (cachedId) {
            const { data: inst } = await sb
              .from('institutos').select('*').eq('id', cachedId).single()
            if (inst) { setInstituto(inst as Instituto); setInstitutoId(inst.id) }
          }
        }

        setSessionReady(true)
        return true
      }

      try { localStorage.removeItem(SESSION_KEY) } catch {}
      hadSessionRef.current = false
      return false
    } catch {
      try { localStorage.removeItem(SESSION_KEY) } catch {}
      hadSessionRef.current = false
      return false
    } finally {
      cargandoRef.current = false
    }
  }

  const doLogout = async () => {
    setUsuario(null)
    setInstituto(null)
    setPermisosEfectivos([])
    setPermisosCustomPorUsuario({})
    usuarioRef.current  = null
    hadSessionRef.current = false
    setSessionReady(false)
    invalidateStore()
    try { localStorage.removeItem(SESSION_KEY)   } catch {}
    try { localStorage.removeItem(INSTITUTO_KEY) } catch {}
    const sb = createClient()
    try { await sb.auth.signOut() } catch {}
    destroyClient()
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-')) localStorage.removeItem(k)
      })
    } catch {}
    window.location.href = window.location.origin
  }

  useEffect(() => {
    let mounted = true
    const sb = createClient()

    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return
        if (event === 'SIGNED_OUT') {
          setUsuario(null); setInstituto(null)
          setPermisosEfectivos([]); setPermisosCustomPorUsuario({})
          usuarioRef.current = null; hadSessionRef.current = false
          setSessionReady(false); invalidateStore()
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          resolveLoading(); return
        }
        if (!session) {
          if (!hadSessionRef.current && !usuarioRef.current) resolveLoading()
          return
        }
        if (!usuarioRef.current && session.user) {
          const ok = await cargarUsuario(session.user.id)
          if (!ok && mounted) resolveLoading()
        } else if (usuarioRef.current) {
          setSessionReady(true)
        }
        if (mounted) resolveLoading()
      }
    )

    const init = async () => {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (!session) {
          hadSessionRef.current = false
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          if (!loadingResolvedRef.current && !usuarioRef.current) resolveLoading()
        }
      } catch {
        if (!loadingResolvedRef.current) resolveLoading()
      }
    }
    init()

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible' || !usuarioRef.current) return
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (session) { setSessionReady(true) }
        else {
          const { data } = await sb.auth.refreshSession()
          if (data.session) setSessionReady(true)
          else doLogout()
        }
      } catch {}
    }

    const handleOnline = async () => {
      if (!usuarioRef.current) return
      try { await sb.auth.refreshSession(); setSessionReady(true) } catch {}
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    return () => {
      mounted = false
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    loadingResolvedRef.current = false
    const sb = createClient()
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) { resolveLoading(); return { error: 'Usuario o contraseña incorrectos.' } }
    if (data?.user) {
      hadSessionRef.current = true
      const ok = await cargarUsuario(data.user.id)
      if (!ok) { resolveLoading(); return { error: 'Usuario no encontrado en el sistema.' } }
    }
    resolveLoading()
    return {}
  }

  // puedeVer usa permisos efectivos (custom o por rol), no solo el rol
  const puedeVerModulo = (modulo: string): boolean => {
    if (!usuario) return false
    return permisosEfectivos.includes(modulo)
  }

  return (
    <AuthContext.Provider value={{
      usuario,
      instituto,
      institutoId: instituto?.id ?? null,
      loading,
      login,
      logout: doLogout,
      puedeVer: puedeVerModulo,
      permisosEfectivos,
      permisosCustomPorUsuario,
      recargarPermisosUsuarios,
    }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
