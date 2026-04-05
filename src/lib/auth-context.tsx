'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, puedeVer } from '@/lib/supabase'
import { invalidateStore, setAuthReady } from '@/lib/hooks'

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
        setAuthReady(true)   // ← hooks pueden fetchear ahora
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
    setAuthReady(false)
    invalidateStore()
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

    // onAuthStateChange es la fuente de verdad
    // Con @supabase/supabase-js el refresh automático funciona
    // correctamente via localStorage — no necesita middleware
    const { data: { subscription } } = sb.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT') {
          // Solo limpiar en logout explícito — no en sesión null transitoria
          setUsuario(null)
          usuarioRef.current = null
          invalidateStore()
          setLoading(false)
          return
        }

        if (!session) {
          // Sesión null transitoria durante refresh — ignorar si ya hay usuario
          // Supabase puede emitir esto antes de TOKEN_REFRESHED
          if (!usuarioRef.current) {
            setLoading(false)
          }
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token refrescado — cargar usuario si no estaba cargado
          if (!usuarioRef.current && session.user) {
            await cargarUsuario(session.user.id)
          }
          setLoading(false)
          return
        }

        // INITIAL_SESSION, SIGNED_IN
        if (session.user) {
          await cargarUsuario(session.user.id)
        }
        setLoading(false)
      }
    )

    // Arranque: leer sesión del localStorage
    const init = async () => {
      try {
        const { data: { session } } = await sb.auth.getSession()
        if (!session) {
          setUsuario(null)
          usuarioRef.current = null
          setLoading(false)
        }
        // Con sesión: onAuthStateChange dispara INITIAL_SESSION
      } catch {
        setLoading(false)
      }
    }

    init()

    // Sin visibilitychange — @supabase/supabase-js con autoRefreshToken
    // maneja el refresh automáticamente. No necesitamos intervenir.

    const handleOnline = async () => {
      if (!usuarioRef.current) return
      try { await sb.auth.refreshSession() } catch {}
    }

    window.addEventListener('online', handleOnline)

    return () => {
      mounted = false
      subscription.unsubscribe()
      window.removeEventListener('online', handleOnline)
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
