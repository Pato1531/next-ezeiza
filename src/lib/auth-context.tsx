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

  // Validar sesión contra el servidor — NO usa localStorage
  const validarSesionReal = async (): Promise<string | null> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) return null
      return user.id
    } catch {
      return null
    }
  }

  const doLogout = async () => {
    // Limpiar estado React primero
    setUsuario(null)
    usuarioRef.current = null
    invalidateStore()
    // Limpiar localStorage ANTES de signOut para evitar que
    // onAuthStateChange dispare otro logout al recibir SIGNED_OUT
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-')) localStorage.removeItem(k)
      })
    } catch {}
    // signOut y destroy del cliente
    try { await supabase.auth.signOut() } catch {}
    destroyClient()
    // Redirigir al login
    window.location.href = window.location.origin
  }

  useEffect(() => {
    let mounted = true

    // onAuthStateChange — fuente de verdad de la sesión
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session) {
          // Solo limpiar estado — NO redirigir automáticamente.
          // El redirect automático causaba loops infinitos cuando
          // Supabase disparaba SIGNED_OUT por timeout de red.
          setUsuario(null)
          usuarioRef.current = null
          invalidateStore()
          setLoading(false)
          return
        }

        if (event === 'TOKEN_REFRESHED') {
          // Token renovado — no recargar usuario si ya está en memoria
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

    // Inicialización: getSession solo para el arranque
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          // Intentar refresh antes de dar por muerta la sesión
          // Esto cubre el caso de token expirado por suspensión del browser
          try {
            const { data: refreshed } = await supabase.auth.refreshSession()
            if (!refreshed.session) {
              setUsuario(null)
              usuarioRef.current = null
              setLoading(false)
            }
            // Si refresh OK, onAuthStateChange dispara TOKEN_REFRESHED
          } catch {
            setUsuario(null)
            usuarioRef.current = null
            setLoading(false)
          }
        }
        // Si hay sesión, onAuthStateChange dispara INITIAL_SESSION y se encarga
      } catch {
        setLoading(false)
      }
    }

    init()

    // visibilitychange: validar con el servidor al volver
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (!usuarioRef.current) return

      const uid = await validarSesionReal()

      if (!uid) {
        // Sesión inválida → desloguear
        doLogout()
        return
      }

      if (!usuarioRef.current) {
        await cargarUsuario(uid)
      }
    }

    // online: intentar refresh al recuperar red
    const handleOnline = async () => {
      if (!usuarioRef.current) return
      try {
        await supabase.auth.refreshSession()
      } catch {}
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
    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-')) localStorage.removeItem(k)
      })
    } catch {}

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

  const logout = doLogout

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
