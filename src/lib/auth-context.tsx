'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, puedeVer } from '@/lib/supabase'
import { invalidateStore, setSessionReady } from '@/lib/hooks'

// ── Clave de localStorage para sobrevivir remounts de Chrome/Android ──────────
// Cuando el proceso JS remonta, localStorage persiste pero los useState no.
// Guardamos el userId para saber que existía una sesión activa y NO mostrar
// LoginPage mientras Supabase resuelve el token asíncronamente.
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

  // Lee localStorage SINCRÓNICAMENTE al montar para saber si había sesión previa.
  // Esto sobrevive remounts porque localStorage persiste entre ellos.
  const hadSessionRef = useRef<boolean>(
    typeof window !== 'undefined'
      ? Boolean(localStorage.getItem(SESSION_KEY))
      : false
  )

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
        // Persistir para sobrevivir remounts
        try { localStorage.setItem(SESSION_KEY, uid) } catch {}
        // Notificar hooks que pueden fetchear con sesión activa
        setSessionReady(true)
        return true
      }
      return false
    } catch {
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

        if (event === 'SIGNED_OUT') {
          setUsuario(null)
          usuarioRef.current = null
          hadSessionRef.current = false
          setSessionReady(false)
          invalidateStore()
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          setLoading(false)
          return
        }

        if (!session) {
          // Session null es SIEMPRE transitoria cuando hadSession=true.
          // Supabase emite esto mientras resuelve el token desde localStorage.
          // Si había sesión previa → mantener loading=true y esperar TOKEN_REFRESHED.
          // Si no había sesión → confirmar que no hay usuario.
          if (!hadSessionRef.current && !usuarioRef.current) {
            setLoading(false)
          }
          // hadSession=true: NO hacer nada, esperar el siguiente evento
          return
        }

        // Hay session válida
        if (!usuarioRef.current && session.user) {
          await cargarUsuario(session.user.id)
        } else if (usuarioRef.current) {
          // Usuario ya cargado, solo activar sesión para hooks
          setSessionReady(true)
        }
        setLoading(false)
      }
    )

    // Verificación inicial: getSession es síncrono con el localStorage
    const init = async () => {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (!session) {
          // No hay sesión real en localStorage
          hadSessionRef.current = false
          try { localStorage.removeItem(SESSION_KEY) } catch {}
          if (!usuarioRef.current) setLoading(false)
        }
        // Con sesión: onAuthStateChange disparará INITIAL_SESSION/TOKEN_REFRESHED
      } catch {
        setLoading(false)
      }
    }

    init()

    // Online: refrescar token al reconectarse
    const handleOnline = async () => {
      if (!usuarioRef.current) return
      try {
        await sb.auth.refreshSession()
        setSessionReady(true)
      } catch {}
    }

    // Visibilitychange: verificar sesión al volver al frente
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (!usuarioRef.current) return
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (session) {
          // Sesión válida: activar hooks
          setSessionReady(true)
        } else {
          // Intentar refresh antes de desloguear
          const { data } = await sb.auth.refreshSession()
          if (data.session) {
            setSessionReady(true)
          } else {
            // Sesión definitivamente expirada
            doLogout()
          }
        }
      } catch {}
    }

    window.addEventListener('online', handleOnline)
    document.addEventListener('visibilitychange', handleVisibility)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.removeEventListener('online', handleOnline)
      document.removeEventListener('visibilitychange', handleVisibility)
    }
  }, [])

  const login = async (email: string, password: string) => {
    setLoading(true)
    const sb = createClient()
    const { data, error } = await sb.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      return { error: 'Usuario o contraseña incorrectos.' }
    }
    if (data?.user) {
      hadSessionRef.current = true
      const ok = await cargarUsuario(data.user.id)
      if (!ok) {
        setLoading(false)
        return { error: 'Usuario no encontrado en el sistema.' }
      }
    }
    setLoading(false)
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
