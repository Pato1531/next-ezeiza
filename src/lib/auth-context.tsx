'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { supabase } from './supabase'
import { setCurrentUserName, setInstitutoId, setSessionReady } from './hooks'

interface Usuario {
  id: string
  nombre: string
  email: string
  rol: string
  color: string
  initials: string
  activo: boolean
  instituto_id: string
}

interface Instituto {
  id: string
  nombre: string
  slug: string
  color_primario: string
}

interface AuthContextType {
  usuario: Usuario | null
  instituto: Instituto | null
  loading: boolean
  signOut: () => Promise<void>
  recargarUsuario: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  instituto: null,
  loading: true,
  signOut: async () => {},
  recargarUsuario: async () => {},
})

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [instituto, setInstituto] = useState<Instituto | null>(null)
  const [loading, setLoading] = useState(true)

  const cargarUsuario = useCallback(async (uid: string) => {
    try {
      const { data: u, error } = await supabase
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .eq('activo', true)
        .single()

      if (error || !u) {
        console.warn('[Auth] Usuario no encontrado en tabla usuarios:', error?.message)
        setLoading(false)
        return
      }

      setCurrentUserName(u.nombre)
      setInstitutoId(u.instituto_id)

      // Cargar instituto
      let inst: Instituto | null = null
      const slug = process.env.NEXT_PUBLIC_INSTITUTO_SLUG
      if (slug) {
        const { data } = await supabase.from('institutos').select('*').eq('slug', slug).single()
        inst = data
      } else if (u.instituto_id) {
        const { data } = await supabase.from('institutos').select('*').eq('id', u.instituto_id).single()
        inst = data
      }

      setUsuario(u)
      setInstituto(inst)
      setSessionReady(true)

      // Persistir para el spinner del próximo login
      localStorage.setItem('ne_session_uid', uid)
    } catch (e) {
      console.error('[Auth] cargarUsuario error:', e)
    } finally {
      setLoading(false)
    }
  }, [])

  const recargarUsuario = useCallback(async () => {
    const { data: { session } } = await supabase.auth.getSession()
    if (session?.user?.id) {
      await cargarUsuario(session.user.id)
    }
  }, [cargarUsuario])

  useEffect(() => {
    let cancelled = false

    // ── FIX BUG LOGIN: timeout de seguridad de 6s ──────────────────────────
    // Si Supabase no responde (JWT hook lento, red lenta, token expirado),
    // forzamos loading=false para que el usuario no quede pegado en el spinner.
    const safetyTimeout = setTimeout(() => {
      if (!cancelled && loading) {
        console.warn('[Auth] Safety timeout: forzando loading=false después de 6s')
        localStorage.removeItem('ne_session_uid')
        setSessionReady(false)
        setLoading(false)
      }
    }, 6000)

    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (cancelled) return

        if (session?.user?.id) {
          await cargarUsuario(session.user.id)
        } else {
          // No hay sesión activa → limpiar localStorage
          localStorage.removeItem('ne_session_uid')
          setSessionReady(false)
          setLoading(false)
        }
      } catch (e) {
        console.error('[Auth] init error:', e)
        if (!cancelled) {
          localStorage.removeItem('ne_session_uid')
          setLoading(false)
        }
      } finally {
        clearTimeout(safetyTimeout)
      }
    }

    init()

    // Escuchar cambios de sesión (login / logout / token refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (cancelled) return

      if (event === 'SIGNED_IN' && session?.user?.id) {
        await cargarUsuario(session.user.id)
      } else if (event === 'SIGNED_OUT') {
        localStorage.removeItem('ne_session_uid')
        setUsuario(null)
        setInstituto(null)
        setSessionReady(false)
        setLoading(false)
      } else if (event === 'TOKEN_REFRESHED' && session?.user?.id) {
        // Refrescar datos del usuario silenciosamente
        setInstitutoId(session.user.id)
      }
    })

    return () => {
      cancelled = true
      clearTimeout(safetyTimeout)
      subscription.unsubscribe()
    }
  }, [cargarUsuario])

  const signOut = async () => {
    localStorage.removeItem('ne_session_uid')
    setUsuario(null)
    setInstituto(null)
    setSessionReady(false)
    setLoading(false)
    await supabase.auth.signOut()
  }

  return (
    <AuthContext.Provider value={{ usuario, instituto, loading, signOut, recargarUsuario }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
