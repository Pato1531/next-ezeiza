'use client'

import { useEffect, useRef, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'
import CrearClave from '@/components/CrearClave'
import BannerPrueba from '@/components/BannerPrueba'

// Se lee el link al cargar el módulo, antes de que el cliente de Supabase procese y limpie el hash.
const TIPO_LINK_INICIAL: 'invite' | 'recovery' | null = (() => {
  if (typeof window === 'undefined') return null
  const tipo = new URLSearchParams(window.location.hash.replace(/^#/, '')).get('type')
  return tipo === 'invite' || tipo === 'recovery' ? tipo : null
})()

export default function Home() {
  const { usuario, loading } = useAuth()
  const [mostrarApp, setMostrarApp] = useState(false)
  const [hadSession, setHadSession] = useState(false)
  const [timedOut, setTimedOut] = useState(false)
  // Link de invitación o de recuperación: pide elegir contraseña antes de entrar
  const [flujoClave, setFlujoClave] = useState<'invite' | 'recovery' | null>(null)
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    if (TIPO_LINK_INICIAL) setFlujoClave(TIPO_LINK_INICIAL)
  }, [])

  // Leer localStorage solo en el cliente — NUNCA en el initializer de useState
  useEffect(() => {
    try {
      setHadSession(Boolean(localStorage.getItem('ne_session_uid')))
    } catch {
      setHadSession(false)
    }
  }, [])

  useEffect(() => {
    if (usuario) {
      setTimedOut(false)
      setMostrarApp(true)
      if (timerRef.current) clearTimeout(timerRef.current)
    }
  }, [usuario])

  useEffect(() => {
    if (!loading || mostrarApp) return
    timerRef.current = setTimeout(() => setTimedOut(true), 7000)
    return () => { if (timerRef.current) clearTimeout(timerRef.current) }
  }, [loading, mostrarApp])

  if (flujoClave) {
    return <CrearClave tipo={flujoClave} />
  }

  if (loading && !mostrarApp) {
    return <Spinner timedOut={timedOut} />
  }

  if (!mostrarApp && !usuario) {
    return <LoginPage />
  }

  return (
    <>
      {mostrarApp && <><BannerPrueba /><AppShell /></>}
      {!mostrarApp && !usuario && <LoginPage />}
    </>
  )
}

function Spinner({ timedOut }: { timedOut: boolean }) {
  const handleRetry = () => {
    try { localStorage.removeItem('ne_session_uid') } catch {}
    window.location.reload()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: '#652f8d',
      flexDirection: 'column',
      gap: '20px',
    }}>
      {!timedOut ? (
        <>
          <div style={{
            width: '48px', height: '48px',
            border: '3px solid rgba(255,255,255,.3)',
            borderTopColor: '#fff', borderRadius: '50%',
            animation: 'spin 0.8s linear infinite',
          }} />
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontFamily: 'Inter, sans-serif', margin: 0 }}>
            Ingresando...
          </p>
        </>
      ) : (
        <>
          <p style={{ color: '#fff', fontSize: '16px', fontFamily: 'Inter, sans-serif', textAlign: 'center', maxWidth: '260px', margin: 0 }}>
            La conexión está tardando más de lo esperado.
          </p>
          <button onClick={handleRetry} style={{
            background: 'rgba(255,255,255,0.15)',
            border: '2px solid rgba(255,255,255,0.4)',
            color: '#fff', padding: '12px 28px',
            borderRadius: '12px', fontSize: '15px',
            fontWeight: 700, fontFamily: 'Inter, sans-serif', cursor: 'pointer',
          }}>
            Reintentar
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
