'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, puedeVer } from '@/lib/supabase'
import { invalidateStore, setSessionReady } from '@/lib/hooks'

const SESSION_KEY = 'ne_session_uid'

interface AuthContextType {
  usuario: Usuario | null
  loading: boolean
  login: (email: string, password: string) => Promise<{ error?: string }>
  logout: () => Promise<void>
  puedeVer: (modulo: string) => boolean
}

const AuthContext = createContext<AuthContextType | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [loading, setLoading] = useState(true)
  const usuarioRef = useRef<Usuario | null>(null)
  const cargandoRef = useRef(false)
  const loadingResolvedRef = useRef(false)  // garantiza que setLoading(false) solo corre una vez

  // Lee localStorage para saber si había sesión previa (sobrevive remounts)
  const prevUid = typeof window !== 'undefined' ? localStorage.getItem(SESSION_KEY) : null
  const hadSessionRef = useRef<boolean>(Boolean(prevUid))

  // ── HELPER: resolver loading de forma segura ──────────────────────────────
  // Garantiza que una vez resuelto, no vuelve a true accidentalmente
  const resolveLoading = () => {
    loadingResolvedRef.current = true
    setLoading(false)
  }

  // ── SAFETY NET: timeout máximo de 4 segundos ──────────────────────────────
  // Si algo falla y loading nunca se resuelve, después de 4s mostramos login.
  // Mucho mejor que el timeout de 6s original — el usuario no espera tanto.
  useEffect(() => {
    const t = setTimeout(() => {
      if (!loadingResolvedRef.current) {
        console.warn('[auth] safety timeout — forzando resolución')
        // Limpiar ne_session_uid si llegamos aquí — probablemente sesión expirada
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
        .from('usuarios').select('*').eq('id', uid).single()
      if (data && !error) {
        setUsuario(data as Usuario)
        usuarioRef.current = data as Usuario
        hadSessionRef.current = true
        try { localStorage.setItem(SESSION_KEY, uid) } catch {}
        setSessionReady(true)
        return true
      }
      // Falló cargar el usuario — limpiar sesión
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
    usuarioRef.current = null
    hadSessionRef.current = false
    setSessionReady(false)
    invalidateStore()
    try { localStorage.removeItem(SESSION_KEY) } catch {}
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

        // ── Logout explícito ──
        if (event === 'SIGNED_OUT') {
          setUsuario(null)
          usuarioRef.current = null
          hadSessionRef.current = false
          setSessionReady(false)
          invalidateStore()
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          resolveLoading()
          return
        }

        // ── Sin sesión ──
        if (!session) {
          // Si NO había sesión previa → confirmar que no hay nada y resolver
          if (!hadSessionRef.current && !usuarioRef.current) {
            resolveLoading()
          }
          // Si HABÍA sesión previa: esperar TOKEN_REFRESHED.
          // El safety timeout de 4s es el backstop si TOKEN_REFRESHED nunca llega.
          return
        }

        // ── Con sesión válida ──
        if (!usuarioRef.current && session.user) {
          // Cargar usuario — si falla, el safety timeout resuelve loading
          const ok = await cargarUsuario(session.user.id)
          if (!ok && mounted) resolveLoading()
        } else if (usuarioRef.current) {
          setSessionReady(true)
        }
        if (mounted) resolveLoading()
      }
    )

    // ── Verificación inicial ──────────────────────────────────────────────
    // getSession() lee el localStorage de Supabase de forma SÍNCRONA-ish.
    // Si devuelve null, la sesión realmente no existe — no esperar más.
    const init = async () => {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (!session) {
          // Sesión definitivamente no existe — limpiar y resolver
          hadSessionRef.current = false
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          // Solo resolver aquí si onAuthStateChange tampoco lo hizo ya
          if (!loadingResolvedRef.current && !usuarioRef.current) {
            resolveLoading()
          }
        }
        // Con sesión: onAuthStateChange ya va a disparar y resolver
      } catch {
        // Error de red — el safety timeout lo manejará
        if (!loadingResolvedRef.current) resolveLoading()
      }
    }

    init()

    // ── Visibilitychange: verificar sesión al volver al frente ────────────
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (!usuarioRef.current) return
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (session) {
          setSessionReady(true)
        } else {
          // Intentar refresh antes de desloguear
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
    <AuthContext.Provider value={{ usuario, loading, login, logout: doLogout, puedeVer: puedeVerModulo }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
