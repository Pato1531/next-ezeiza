'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, puedeVer } from '@/lib/supabase'
import { invalidateStore, setSessionReady, setCurrentUserName, setInstitutoId } from '@/lib/hooks'

const SESSION_KEY = 'ne_session_uid'
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
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [instituto, setInstituto] = useState<Instituto | null>(null)
  const [loading, setLoading] = useState(true)
  const usuarioRef = useRef<Usuario | null>(null)
  const cargandoRef = useRef(false)
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

        // Cargar instituto si el usuario tiene instituto_id (fase multi-tenancy)
        const institutoId = (data as any).instituto_id
        if (institutoId) {
          try { localStorage.setItem(INSTITUTO_KEY, institutoId) } catch {}
          const { data: inst } = await sb
            .from('institutos')
            .select('*')
            .eq('id', institutoId)
            .single()
          if (inst) {
              setInstituto(inst as Instituto)
              setInstitutoId(inst.id)
            }
        } else {
          // Pre-multi-tenancy: intentar desde localStorage si ya se migró antes
          const cachedId = typeof window !== 'undefined'
            ? localStorage.getItem(INSTITUTO_KEY)
            : null
          if (cachedId) {
            const { data: inst } = await sb
              .from('institutos')
              .select('*')
              .eq('id', cachedId)
              .single()
            if (inst) {
              setInstituto(inst as Instituto)
              setInstitutoId(inst.id)
            }
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
    usuarioRef.current = null
    hadSessionRef.current = false
    setSessionReady(false)
    invalidateStore()
    try { localStorage.removeItem(SESSION_KEY) } catch {}
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
          setUsuario(null)
          setInstituto(null)
          usuarioRef.current = null
          hadSessionRef.current = false
          setSessionReady(false)
          invalidateStore()
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          resolveLoading()
          return
        }

        if (!session) {
          if (!hadSessionRef.current && !usuarioRef.current) {
            resolveLoading()
          }
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
          if (!loadingResolvedRef.current && !usuarioRef.current) {
            resolveLoading()
          }
        }
      } catch {
        if (!loadingResolvedRef.current) resolveLoading()
      }
    }

    init()

    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (!usuarioRef.current) return
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (session) {
          setSessionReady(true)
        } else {
          const { data } = await sb.auth.refreshSession()
          if (data.session) {
            setSessionReady(true)
          } else {
            doLogout()
          }
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
    if (error) {
      resolveLoading()
      return { error: 'Usuario o contraseña incorrectos.' }
    }
    if (data?.user) {
      hadSessionRef.current = true
      const ok = await cargarUsuario(data.user.id)
      if (!ok) {
        resolveLoading()
        return { error: 'Usuario no encontrado en el sistema.' }
      }
    }
    resolveLoading()
    return {}
  }

  const puedeVerModulo = (modulo: string) =>
    usuario ? puedeVer(usuario.rol as Rol, modulo) : false

  return (
    <AuthContext.Provider value={{
      usuario,
      instituto,
      institutoId: instituto?.id ?? null,
      loading,
      login,
      logout: doLogout,
      puedeVer: puedeVerModulo,
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
