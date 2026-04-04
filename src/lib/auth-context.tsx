'use client'

import { createContext, useContext, useEffect, useRef, useState, ReactNode } from 'react'
import { createClient, destroyClient, Usuario, Rol, puedeVer } from '@/lib/supabase'

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

  // ─── Cargar datos del usuario desde la tabla usuarios ───────────────────────
  const cargarUsuario = async (uid: string): Promise<boolean> => {
    if (cargandoRef.current) return true // evitar llamadas paralelas
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

  // ─── Validar sesión contra el servidor (NO desde cache local) ───────────────
  // getSession() lee localStorage — puede estar stale si el refresh token expiró.
  // getUser() siempre va al servidor y devuelve 401 si la sesión es inválida.
  const validarSesionReal = async (): Promise<string | null> => {
    try {
      const { data: { user }, error } = await supabase.auth.getUser()
      if (error || !user) return null
      return user.id
    } catch {
      return null
    }
  }

  useEffect(() => {
    let mounted = true

    // ── 1. onAuthStateChange es la fuente de verdad ──────────────────────────
    // Supabase dispara este listener para TODOS los eventos de sesión:
    // SIGNED_IN, SIGNED_OUT, TOKEN_REFRESHED, USER_UPDATED, INITIAL_SESSION
    // Es más confiable que getSession() manual porque reacciona al refresh automático.
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      async (event, session) => {
        if (!mounted) return

        if (event === 'SIGNED_OUT' || !session) {
          setUsuario(null)
          usuarioRef.current = null
          setLoading(false)
          return
        }

        // TOKEN_REFRESHED: el token se renovó automáticamente — no recargar usuario
        // si ya lo tenemos, solo confirmar que la sesión sigue activa
        if (event === 'TOKEN_REFRESHED') {
          if (!usuarioRef.current && session.user) {
            await cargarUsuario(session.user.id)
          }
          setLoading(false)
          return
        }

        // SIGNED_IN / INITIAL_SESSION / USER_UPDATED: cargar o recargar usuario
        if (session.user) {
          await cargarUsuario(session.user.id)
        }

        setLoading(false)
      }
    )

    // ── 2. Inicialización: obtener sesión inicial ─────────────────────────────
    // Usamos getSession() solo para el arranque inicial (es rápido, lee localStorage).
    // Luego onAuthStateChange dispara INITIAL_SESSION y se encarga del resto.
    const init = async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession()
        if (!session) {
          setUsuario(null)
          usuarioRef.current = null
          setLoading(false)
        }
        // Si hay sesión, onAuthStateChange ya va a disparar INITIAL_SESSION
      } catch {
        setLoading(false)
      }
    }

    init()

    // ── 3. visibilitychange: revalidar sesión al volver a la pestaña ──────────
    // El problema: cuando la pestaña está oculta, el browser throttlea timers
    // y el refresh automático de Supabase puede no ejecutarse. Al volver,
    // necesitamos verificar con el SERVIDOR (getUser), no con el cache (getSession).
    const handleVisibility = async () => {
      if (document.visibilityState !== 'visible') return
      if (!usuarioRef.current) return // no había sesión, no hacer nada

      const uid = await validarSesionReal()

      if (!uid) {
        // Sesión inválida en el servidor → desloguear limpiamente
        setUsuario(null)
        usuarioRef.current = null
        // Limpiar localStorage para evitar estado corrupto
        try {
          Object.keys(localStorage).forEach(k => {
            if (k.startsWith('sb-')) localStorage.removeItem(k)
          })
        } catch {}
        return
      }

      // Sesión válida — si el usuario no está en memoria, recargarlo
      if (!usuarioRef.current) {
        await cargarUsuario(uid)
      }
    }

    // ── 4. online: reconectar tras pérdida de red ─────────────────────────────
    const handleOnline = async () => {
      if (!usuarioRef.current) return
      // Intentar refresh explícito al recuperar red
      try {
        await supabase.auth.refreshSession()
      } catch {
        // Si falla, onAuthStateChange disparará SIGNED_OUT automáticamente
      }
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

  // ─── Login ──────────────────────────────────────────────────────────────────
  const login = async (email: string, password: string) => {
    setLoading(true)

    // Limpiar sesión anterior del localStorage antes de nuevo login
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

  // ─── Logout ─────────────────────────────────────────────────────────────────
  const logout = async () => {
    setUsuario(null)
    usuarioRef.current = null

    try { await supabase.auth.signOut() } catch {}

    // Destruir singleton para que la próxima sesión arranque limpia
    destroyClient()

    try {
      Object.keys(localStorage).forEach(k => {
        if (k.startsWith('sb-')) localStorage.removeItem(k)
      })
    } catch {}

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
