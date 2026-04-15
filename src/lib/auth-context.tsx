'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'
import { createClient, SupabaseClient } from '@supabase/supabase-js'

// ── Cliente singleton del browser (anon key) ──────────────────────────────────
// Se crea UNA SOLA VEZ al cargar el módulo. No depende de ningún import externo.
// Esto evita el bug "Cannot read properties of undefined (reading 'auth')" que
// ocurre cuando se importa un singleton desde otro módulo que aún no se inicializó.
let _supabase: SupabaseClient | null = null

function getSupabase(): SupabaseClient {
  if (!_supabase) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      throw new Error(
        '[Auth] Variables de entorno faltantes.\n' +
        'Verificar en Vercel → Settings → Environment Variables:\n' +
        '  NEXT_PUBLIC_SUPABASE_URL\n' +
        '  NEXT_PUBLIC_SUPABASE_ANON_KEY'
      )
    }
    _supabase = createClient(url, key)
  }
  return _supabase
}

// ── Estado global compartido (usado también por hooks.ts vía apiHeaders) ──────
let _currentUserName = 'Sistema'
let _institutoId: string | null = null
let _sessionReady = false

export function setCurrentUserName(nombre: string) { _currentUserName = nombre }
export function setInstitutoId(id: string) { _institutoId = id }
export function setSessionReady(val: boolean) { _sessionReady = val }
export function getCurrentUserName() { return _currentUserName }
export function getStoredInstitutoId() { return _institutoId }
export function isSessionReady() { return _sessionReady }

// ── Tipos ─────────────────────────────────────────────────────────────────────
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

// ── Provider ──────────────────────────────────────────────────────────────────
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [usuario, setUsuario] = useState<Usuario | null>(null)
  const [instituto, setInstituto] = useState<Instituto | null>(null)
  const [loading, setLoading] = useState(true)

  const cargarUsuario = useCallback(async (uid: string) => {
    try {
      const sb = getSupabase()

      const { data: u, error } = await sb
        .from('usuarios')
        .select('*')
        .eq('id', uid)
        .eq('activo', true)
        .single()

      if (error || !u) {
        console.warn('[Auth] Usuario no encontrado en tabla usuarios:', error?.message)
        localStorage.removeItem('ne_session_uid')
        setLoading(false)
        return
      }

      setCurrentUserName(u.nombre)
      setInstitutoId(u.instituto_id)

      // Cargar instituto
      let inst: Instituto | null = null
      const slug = process.env.NEXT_PUBLIC_INSTITUTO_SLUG
      if (slug) {
        const { data } = await sb.from('institutos').select('*').eq('slug', slug).single()
        inst = data
      } else if (u.instituto_id) {
        const { data } = await sb.from('institutos').select('*').eq('id', u.instituto_id).single()
        inst = data
      }

      setUsuario(u)
      setInstituto(inst)
      setSessionReady(true)
      localStorage.setItem('ne_session_uid', uid)
    } catch (e) {
      console.error('[Auth] cargarUsuario error:', e)
      localStorage.removeItem('ne_session_uid')
    } finally {
      setLoading(false)
    }
  }, [])

  const recargarUsuario = useCallback(async () => {
    try {
      const sb = getSupabase()
      const { data: { session } } = await sb.auth.getSession()
      if (session?.user?.id) await cargarUsuario(session.user.id)
    } catch (e) {
      console.error('[Auth] recargarUsuario error:', e)
    }
  }, [cargarUsuario])

  useEffect(() => {
    let cancelled = false

    // ── FIX: Safety timeout — si Supabase no responde en 6s, desbloquear UI ──
    const safetyTimeout = setTimeout(() => {
      if (!cancelled) {
        console.warn('[Auth] Safety timeout activado (6s) — forzando loading=false')
        localStorage.removeItem('ne_session_uid')
        setSessionReady(false)
        setLoading(false)
      }
    }, 6000)

    const init = async () => {
      try {
        const sb = getSupabase()
        const { data: { session } } = await sb.auth.getSession()
        if (cancelled) return

        if (session?.user?.id) {
          await cargarUsuario(session.user.id)
        } else {
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
    let subscription: { unsubscribe: () => void } | null = null
    try {
      const sb = getSupabase()
      const { data } = sb.auth.onAuthStateChange(async (event, session) => {
        if (cancelled) return
        if (event === 'SIGNED_IN' && session?.user?.id) {
          clearTimeout(safetyTimeout)
          await cargarUsuario(session.user.id)
        } else if (event === 'SIGNED_OUT') {
          localStorage.removeItem('ne_session_uid')
          setUsuario(null)
          setInstituto(null)
          setSessionReady(false)
          setLoading(false)
        }
      })
      subscription = data.subscription
    } catch (e) {
      console.error('[Auth] onAuthStateChange setup error:', e)
    }

    return () => {
      cancelled = true
      clearTimeout(safetyTimeout)
      subscription?.unsubscribe()
    }
  }, [cargarUsuario])

  const signOut = async () => {
    localStorage.removeItem('ne_session_uid')
    setUsuario(null)
    setInstituto(null)
    setSessionReady(false)
    setLoading(false)
    try {
      await getSupabase().auth.signOut()
    } catch (e) {
      console.error('[Auth] signOut error:', e)
    }
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
