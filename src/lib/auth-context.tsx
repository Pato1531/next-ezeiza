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
    let timeout: NodeJS.Timeout

    const getSession = async () => {
      try {
        // Timeout de 8 segundos — si no responde, limpiar sesión
        timeout = setTimeout(async () => {
          console.warn('Sesión timeout — limpiando cookies')
          await supabase.auth.signOut()
          setUsuario(null)
          setLoading(false)
        }, 8000)

        const { data: { session }, error } = await supabase.auth.getSession()
        clearTimeout(timeout)

        if (error || !session?.user) {
          // Sesión inválida — limpiar y mostrar login
          await supabase.auth.signOut()
          setUsuario(null)
          setLoading(false)
          return
        }

        if (session?.user) {
          const ok = await cargarUsuario(session.user.id)
          if (!ok) {
            // Usuario no encontrado en la tabla — sesión rota
            await supabase.auth.signOut()
            setUsuario(null)
          }
        }
      } catch (e) {
        clearTimeout(timeout)
        await supabase.auth.signOut()
        setUsuario(null)
      } finally {
        clearTimeout(timeout)
        setLoading(false)
      }
    }

    getSession()

    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
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
      clearTimeout(timeout)
      subscription.unsubscribe()
    }
  }, [])

  const cargarUsuario = async (uid: string): Promise<boolean> => {
    try {
      const { data, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .single()

      if (data && !error) {
        setUsuario(data as Usuario)
        return true
      }
      return false
    } catch {
      return false
    }
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
