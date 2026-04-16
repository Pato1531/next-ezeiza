'use client'

import { createContext, useContext, useEffect, useState, useCallback, useRef } from 'react'
import { createClient } from '@supabase/supabase-js'
import { PERMISOS, type Rol } from '@/lib/supabase'

// ── Cliente singleton ─────────────────────────────────────────────────────────
let _client: ReturnType<typeof createClient> | null = null

function getClient() {
  if (!_client) {
    const url  = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key  = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      console.error('[Auth] Faltan NEXT_PUBLIC_SUPABASE_URL o NEXT_PUBLIC_SUPABASE_ANON_KEY')
      return null
    }
    _client = createClient(url, key)
  }
  return _client
}

// ── Estado global compartido con hooks.ts ─────────────────────────────────────
let _userName     = 'Sistema'
let _institutoId: string | null = null
let _sessionReady = false

export function setCurrentUserName(n: string)  { _userName     = n    }
export function setInstitutoId(id: string)      { _institutoId  = id   }
export function setSessionReady(v: boolean)     { _sessionReady = v    }
export function getCurrentUserName()            { return _userName     }
export function getStoredInstitutoId()          { return _institutoId  }
export function isSessionReady()                { return _sessionReady }

// ── Tipos ─────────────────────────────────────────────────────────────────────
interface Usuario {
  id: string
  nombre: string
  email: string
  rol: Rol
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
  puedeVer: (modulo: string) => boolean
  permisosCustomPorUsuario: Record<string, string[]>
  recargarPermisosUsuarios: () => Promise<void>
  signOut: () => Promise<void>
  recargarUsuario: () => Promise<void>
}

const AuthContext = createContext<AuthContextType>({
  usuario: null,
  instituto: null,
  loading: true,
  puedeVer: () => false,
  permisosCustomPorUsuario: {},
  recargarPermisosUsuarios: async () => {},
  signOut: async () => {},
  recargarUsuario: async () => {},
})

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario,   setUsuario]   = useState<Usuario | null>(null)
  const [instituto, setInstituto] = useState<Instituto | null>(null)
  const [loading,   setLoading]   = useState(true)
  const mountedRef = useRef(true)

  const [permisosCustomPorUsuario, setPermisosCustomPorUsuario] = useState<Record<string, string[]>>({})

  const recargarPermisosUsuarios = useCallback(async () => {
    try {
      const sb = getClient()
      if (!sb) return
      const { data } = await sb.from('usuarios').select('id, permisos_custom')
      if (!data) return
      const mapa: Record<string, string[]> = {}
      data.forEach((u: any) => {
        if (Array.isArray(u.permisos_custom) && u.permisos_custom.length > 0) {
          mapa[u.id] = u.permisos_custom
        }
      })
      setPermisosCustomPorUsuario(mapa)
    } catch (e) {
      console.warn('[Auth] recargarPermisosUsuarios:', e)
    }
  }, [])

  const puedeVer = useCallback(
    (modulo: string) => {
      if (!usuario) return false
      const custom = permisosCustomPorUsuario[usuario.id]
      if (Array.isArray(custom) && custom.length > 0) return custom.includes(modulo)
      return PERMISOS[usuario.rol]?.includes(modulo) ?? false
    },
    [usuario, permisosCustomPorUsuario]
  )

  const cargarUsuario = useCallback(async (uid: string) => {
    const sb = getClient()
    if (!sb) { setLoading(false); return }

    try {
      const { data: u, error } = await sb
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .eq('activo', true)
        .single()

      if (!mountedRef.current) return

      if (error || !u) {
        console.warn('[Auth] Usuario no encontrado:', error?.message)
        if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
        setLoading(false)
        return
      }

      setCurrentUserName(u.nombre)
      setInstitutoId(u.instituto_id)

      let inst: Instituto | null = null
      try {
        const slug = process.env.NEXT_PUBLIC_INSTITUTO_SLUG
        if (slug) {
          const { data } = await sb.from('institutos').select('*').eq('slug', slug).single()
          inst = data
        } else if (u.instituto_id) {
          const { data } = await sb.from('institutos').select('*').eq('id', u.instituto_id).single()
          inst = data
        }
      } catch (e) {
        console.warn('[Auth] No se pudo cargar el instituto:', e)
      }

      if (!mountedRef.current) return

      setUsuario(u)
      setInstituto(inst)
      setSessionReady(true)
      if (typeof window !== 'undefined') localStorage.setItem('ne_session_uid', uid)
    } catch (e) {
      console.error('[Auth] cargarUsuario error:', e)
      if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
    } finally {
      if (mountedRef.current) setLoading(false)
    }
  }, [])

  const recargarUsuario = useCallback(async () => {
    const sb = getClient()
    if (!sb) return
    try {
      const { data: { session } } = await sb.auth.getSession()
      if (session?.user?.id) await cargarUsuario(session.user.id)
    } catch (e) {
      console.error('[Auth] recargarUsuario:', e)
    }
  }, [cargarUsuario])

  useEffect(() => {
    mountedRef.current = true
    const sb = getClient()
    if (!sb) { setLoading(false); return }

    const safetyTimer = setTimeout(() => {
      if (mountedRef.current) {
        console.warn('[Auth] Safety timeout — forzando loading=false')
        if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
        setSessionReady(false)
        setLoading(false)
      }
    }, 6000)

    sb.auth.getSession()
      .then(({ data: { session } }) => {
        if (!mountedRef.current) return
        clearTimeout(safetyTimer)
        if (session?.user?.id) {
          cargarUsuario(session.user.id)
        } else {
          if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
          setSessionReady(false)
          setLoading(false)
        }
      })
      .catch((e) => {
        console.error('[Auth] getSession error:', e)
        clearTimeout(safetyTimer)
        if (mountedRef.current) {
          if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
          setLoading(false)
        }
      })

    let unsubscribeFn: (() => void) | null = null
    try {
      const { data } = sb.auth.onAuthStateChange((event, session) => {
        if (!mountedRef.current) return
        if (event === 'SIGNED_IN' && session?.user?.id) {
          clearTimeout(safetyTimer)
          cargarUsuario(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
          setUsuario(null)
          setInstituto(null)
          setSessionReady(false)
          setLoading(false)
        }
      })
      if (data?.subscription?.unsubscribe) {
        unsubscribeFn = () => data.subscription.unsubscribe()
      } else if (typeof (data as any)?.unsubscribe === 'function') {
        unsubscribeFn = () => (data as any).unsubscribe()
      }
    } catch (e) {
      console.error('[Auth] onAuthStateChange setup error:', e)
    }

    return () => {
      mountedRef.current = false
      clearTimeout(safetyTimer)
      if (unsubscribeFn) unsubscribeFn()
    }
  }, [cargarUsuario])

  const signOut = async () => {
    if (typeof window !== 'undefined') localStorage.removeItem('ne_session_uid')
    setUsuario(null)
    setInstituto(null)
    setSessionReady(false)
    setLoading(false)
    try {
      const sb = getClient()
      if (sb) await sb.auth.signOut()
    } catch (e) {
      console.error('[Auth] signOut error:', e)
    }
  }

  return (
    <AuthContext.Provider value={{ usuario, instituto, loading, puedeVer, permisosCustomPorUsuario, recargarPermisosUsuarios, signOut, recargarUsuario }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  return useContext(AuthContext)
}
