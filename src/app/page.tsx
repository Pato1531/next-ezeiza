'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const { usuario, loading } = useAuth()
  const [mostrarApp, setMostrarApp] = useState(false)
  const [timedOut, setTimedOut] = useState(false)

  // ¿Había sesión previa guardada?
  const [hadSession] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return Boolean(localStorage.getItem('ne_session_uid'))
  })

  useEffect(() => {
    if (usuario) {
      setTimedOut(false)
      setMostrarApp(true)
    }
  }, [usuario])

  // ── FIX BUG LOGIN: si lleva 7s cargando sin usuario, mostrar opción reintentar ──
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => {
      if (!mostrarApp) setTimedOut(true)
    }, 7000)
    return () => clearTimeout(t)
  }, [loading, mostrarApp])

  // Spinner con opción de reintentar tras timeout
  if (loading && hadSession && !mostrarApp) {
    return <Spinner timedOut={timedOut} />
  }

  // Sin sesión previa → Login directo
  if (loading && !hadSession && !mostrarApp) {
    return <LoginPage />
  }

  // Sin usuario → Login
  if (!mostrarApp && !usuario) {
    return <LoginPage />
  }

  return (
    <>
      {mostrarApp && <AppShell />}
      {!mostrarApp && !usuario && <LoginPage />}
    </>
  )
}

function Spinner({ timedOut }: { timedOut: boolean }) {
  const handleRetry = () => {
    localStorage.removeItem('ne_session_uid')
    window.location.reload()
  }

  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--v)',
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
          <p style={{ color: 'rgba(255,255,255,0.7)', fontSize: '14px', fontFamily: 'Inter, sans-serif' }}>
            Ingresando...
          </p>
        </>
      ) : (
        <>
          <p style={{ color: '#fff', fontSize: '16px', fontFamily: 'Inter, sans-serif', textAlign: 'center', maxWidth: '260px' }}>
            La conexión está tardando más de lo esperado.
          </p>
          <button
            onClick={handleRetry}
            style={{
              background: 'rgba(255,255,255,0.15)',
              border: '2px solid rgba(255,255,255,0.4)',
              color: '#fff',
              padding: '12px 28px',
              borderRadius: '12px',
              fontSize: '15px',
              fontWeight: 700,
              fontFamily: 'Inter, sans-serif',
              cursor: 'pointer',
            }}
          >
            Reintentar
          </button>
        </>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
