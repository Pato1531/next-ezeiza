'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const { usuario, loading } = useAuth()
  const [mostrarApp, setMostrarApp]         = useState(false)
  const [spinnerTimeout, setSpinnerTimeout] = useState(false)

  // Ref para saber si este login es "fresco" y hay que ir al dashboard
  const loginFresco = useRef(false)

  // ¿Había sesión guardada? Si sí, mostramos spinner mientras carga.
  // Si no, vamos directo a LoginPage sin parpadeo.
  const [hadSession] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return Boolean(localStorage.getItem('ne_session_uid'))
  })

  useEffect(() => {
    if (usuario) {
      if (!mostrarApp) loginFresco.current = true
      setMostrarApp(true)
    }
  }, [usuario])

  // Safety net: si en 2.5s no cargó la sesión, ir a LoginPage directamente
  // (era 4s en la versión anterior — reducido para mejor UX)
  useEffect(() => {
    if (!loading) return
    const t = setTimeout(() => setSpinnerTimeout(true), 2500)
    return () => clearTimeout(t)
  }, [loading])

  // Cargando CON sesión previa → Spinner
  if (loading && hadSession && !mostrarApp && !spinnerTimeout) {
    return <Spinner />
  }

  // Sin usuario → LoginPage (cargando sin sesión previa, o timeout, o logout)
  if (!mostrarApp && !usuario) {
    return <LoginPage />
  }

  return (
    <>
      {mostrarApp && (
        <AppShell initialTab={loginFresco.current ? 'dashboard' : undefined} />
      )}
      {!mostrarApp && !usuario && <LoginPage />}
    </>
  )
}

function Spinner() {
  return (
    <div style={{
      minHeight: '100vh',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      background: 'var(--v)',
      flexDirection: 'column',
      gap: '16px',
    }}>
      <div style={{
        width: '48px',
        height: '48px',
        border: '3px solid rgba(255,255,255,.3)',
        borderTopColor: '#fff',
        borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <p style={{ color: 'rgba(255,255,255,.7)', fontSize: '14px', margin: 0 }}>
        Cargando...
      </p>
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
