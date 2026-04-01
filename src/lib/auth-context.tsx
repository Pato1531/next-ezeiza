'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, Usuario, Rol, puedeVer } from '@/lib/supabase'

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
  const timeoutRef = useRef<NodeJS.Timeout | null>(null)
  const usuarioRef = useRef<Usuario | null>(null)
  const supabase = createClient()

  const cancelTimeout = () => {
    if (timeoutRef.current) { clearTimeout(timeoutRef.current); timeoutRef.current = null }
  }

  const cargarUsuario = async (uid: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase.from('usuarios').select('*').eq('id', uid).single()
      if (data && !error) {
        setUsuario(data as Usuario)
        usuarioRef.current = data as Usuario
        return true
      }
      return false
    } catch { return false }
  }

  const refrescarSesion = async () => {
    try {
      const { data: { session }, error } = await supabase.auth.getSession()
      if (error || !session) {
        // Token expirado — intentar refresh silencioso
        const { data: refreshed } = await supabase.auth.refreshSession()
        if (!refreshed.session) {
          // No se pudo refrescar — mantener usuario en memoria si lo tenemos
          // NO desloguear automáticamente — puede ser solo falta de red
          return
        }
        // Refresh exitoso — recargar usuario
        await cargarUsuario(refreshed.session.user.id)
        return
      }
      // Sesión válida — verificar que el usuario sigue cargado
      if (!usuarioRef.current && session.user) {
        await cargarUsuario(session.user.id)
      }
    } catch {
      // Error de red — mantener estado actual sin desloguear
    }
  }

  useEffect(() => {
    const getSession = async () => {
      // Timeout de 6 segundos para carga inicial
      timeoutRef.current = setTimeout(() => {
        setLoading(false)
      }, 6000)

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        cancelTimeout()

        if (error || !session?.user) {
          await supabase.auth.signOut().catch(() => {})
          setUsuario(null)
          setLoading(false)
          return
        }

        await cargarUsuario(session.user.id)
      } catch {
        cancelTimeout()
        setUsuario(null)
      } finally {
        cancelTimeout()
        setLoading(false)
      }
    }

    getSession()

    // Cuando la app vuelve al foco — refrescar token sin romper la sesión
    const handleVisibility = () => {
      if (document.visibilityState === 'visible') {
        refrescarSesion()
      }
    }

    // Cuando recupera conexión a internet
    const handleOnline = () => {
      refrescarSesion()
    }

    document.addEventListener('visibilitychange', handleVisibility)
    window.addEventListener('online', handleOnline)

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        cancelTimeout()
        if (event === 'SIGNED_OUT') {
          setUsuario(null)
          usuarioRef.current = null
          setLoading(false)
          return
        }
        if (event === 'TOKEN_REFRESHED' && session?.user) {
          // Token refrescado — no recargar usuario si ya lo tenemos
          if (!usuarioRef.current) await cargarUsuario(session.user.id)
          setLoading(false)
          return
        }
        if (session?.user) {
          await cargarUsuario(session.user.id)
        } else {
          setUsuario(null)
          usuarioRef.current = null
        }
        setLoading(false)
      }
    )

    return () => {
      cancelTimeout()
      subscription.unsubscribe()
      document.removeEventListener('visibilitychange', handleVisibility)
      window.removeEventListener('online', handleOnline)
    }
  }, [])

  const login = async (email: string, password: string) => {
    cancelTimeout()
    setLoading(true)
    // Limpiar sesión vieja
    try {
      Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) })
    } catch {}
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) { setLoading(false); return { error: 'Usuario o contraseña incorrectos.' } }
    if (data?.user) {
      const ok = await cargarUsuario(data.user.id)
      if (!ok) { setLoading(false); return { error: 'Usuario no encontrado en el sistema.' } }
    }
    setLoading(false)
    return {}
  }

  const logout = async () => {
    cancelTimeout()
    setUsuario(null)
    usuarioRef.current = null
    try { await supabase.auth.signOut() } catch {}
    try { Object.keys(localStorage).forEach(k => { if (k.startsWith('sb-')) localStorage.removeItem(k) }) } catch {}
    window.location.href = window.location.origin
  }

  const puedeVerModulo = (modulo: string) =>
    usuario ? puedeVer(usuario.rol as Rol, modulo) : false

  return (
    <AuthContext.Provider value={{ usuario, loading, login, logout, puedeVer: puedeVerModulo }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth debe usarse dentro de AuthProvider')
  return ctx
}
