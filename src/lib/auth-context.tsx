'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, puedeVer } from '@/lib/supabase'
import { invalidateStore } from '@/lib/hooks'

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

  const supabase = createClient()

  const cargarUsuario = async (uid: string): Promise<boolean> => {
    if (cargandoRef.current) return true
    cargandoRef.current = true
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .single()
      if (data && !error) {
        setUsuario(data as Usuario)
        usuarioRef.current = data as Usuario
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
    invalidateStore()
    try { await supabase.auth.signOut() } catch {}
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

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session) {
          setUsuario(null)
          usuarioRef.current = null
          invalidateStore()
          setLoading(false)
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          if (!usuarioRef.current && session.user) {
            await cargarUsuario(session.user.id)
          }
          setLoading(false)
          return
        }

        if (session.user) {
          await cargarUsuario(session.user.id)
        }

        setLoading(false)
      }
    )

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setUsuario(null)
          usuarioRef.current = null
          setLoading(false)
        }
      } catch {
        setLoading(false)
      }
    }

    init()

    // SIN handleVisibility — era la causa raíz del problema.
    // Supabase maneja el refresh del token automáticamente con autoRefreshToken: true.
    // Cualquier intento de validar manualmente al volver a la pestaña
    // fallaba por timeout de red y disparaba doLogout() borrando el localStorage.

    const handleOnline = async () => {
      if (!usuarioRef.current) return
      try { await supabase.auth.refreshSession() } catch {}
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
    // NO borrar localStorage antes del login —
    // Supabase necesita el refresh token para mantener la sesión
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
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
