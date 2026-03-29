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
  const supabase = createClient()

  const cancelTimeout = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current)
      timeoutRef.current = null
    }
  }

  useEffect(() => {
    const getSession = async () => {
      timeoutRef.current = setTimeout(() => {
        console.warn('Sesion timeout - limpiando')
        supabase.auth.signOut().catch(() => {})
        setUsuario(null)
        setLoading(false)
      }, 5000)

      try {
        const { data: { session }, error } = await supabase.auth.getSession()
        cancelTimeout()

        if (error || !session?.user) {
          await supabase.auth.signOut().catch(() => {})
          setUsuario(null)
          setLoading(false)
          return
        }

        if (session?.user) {
          const ok = await cargarUsuario(session.user.id)
          if (!ok) {
            await supabase.auth.signOut().catch(() => {})
            setUsuario(null)
          }
        }
      } catch {
        cancelTimeout()
        await supabase.auth.signOut().catch(() => {})
        setUsuario(null)
      } finally {
        cancelTimeout()
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        cancelTimeout()
        if (event === 'SIGNED_OUT') {
          setUsuario(null)
          setLoading(false)
          return
        }
        if (session?.user) {
          await cargarUsuario(session.user.id)
        } else {
          setUsuario(null)
        }
        setLoading(false)
      }
    )

    return () => {
      cancelTimeout()
      subscription.unsubscribe()
    }
  }, [])

  const cargarUsuario = async (uid: string): Promise<boolean> => {
    try {
      console.log('Cargando usuario:', uid)
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .single()

      console.log('Usuario data:', data, 'error:', error)
      if (data && !error) {
        setUsuario(data as Usuario)
        return true
      }
      return false
    } catch (e) {
      console.error('Error cargarUsuario:', e)
      return false
    }
  }
  const login = async (email: string, password: string) => {
    cancelTimeout()
    setLoading(true)
    const { data, error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setLoading(false)
      return { error: 'Usuario o contrasena incorrectos.' }
    }
    // Cargar usuario directamente sin esperar onAuthStateChange
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

  const logout = async () => {
    cancelTimeout()
    try { await supabase.auth.signOut() } catch {}
    setUsuario(null)
    window.location.replace('/')
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
