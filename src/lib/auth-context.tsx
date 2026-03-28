'use client'

import { createContext, useContext, useEffect, useState, ReactNode } from 'react'
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
  const supabase = createClient()

  useEffect(() => {
    // Verificar sesión activa al cargar
    const getSession = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        await cargarUsuario(session.user.id)
      }
      setLoading(false)
    }
    getSession()

    // Escuchar cambios de auth
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (session?.user) {
          await cargarUsuario(session.user.id)
        } else {
          setUsuario(null)
        }
        setLoading(false)
      }
    )

    return () => subscription.unsubscribe()
  }, [])

  const cargarUsuario = async (uid: string) => {
    const { data, error } = await supabase
      .from('usuarios')
      .select('*')
      .eq('id', uid)
      .single()

    if (data && !error) setUsuario(data as Usuario)
  }

  const login = async (email: string, password: string) => {
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) return { error: 'Usuario o contraseña incorrectos.' }
    return {}
  }

  const logout = async () => {
    await supabase.auth.signOut()
    setUsuario(null)
    window.location.href = '/'
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
