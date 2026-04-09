'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const { usuario, loading } = useAuth()
  const [mostrarApp, setMostrarApp] = useState(false)

  // Leer localStorage para saber si había sesión activa.
  // Si había sesión → mostrar spinner mientras carga (no LoginPage).
  // Si no había sesión → ir directo a LoginPage sin spinner.
  const [hadSession] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return Boolean(localStorage.getItem('ne_session_uid'))
  })

  useEffect(() => {
    if (usuario) setMostrarApp(true)
  }, [usuario])

  // Cargando Y había sesión previa → Spinner (no LoginPage)
  // El auth-context tiene su propio timeout de 4s como safety net
  if (loading && hadSession && !mostrarApp) {
    return <Spinner />
  }

  // Cargando SIN sesión previa → LoginPage directamente (respuesta instantánea)
  if (loading && !hadSession && !mostrarApp) {
    return <LoginPage />
  }

  // Sin usuario y sin app → LoginPage
  if (!mostrarApp && !usuario) {
    return <LoginPage />
  }

  // App montada — NUNCA desmonta aunque usuario sea null transitoriamente
  return (
    <>
      {mostrarApp && <AppShell />}
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
        width: '48px', height: '48px',
        border: '3px solid rgba(255,255,255,.3)',
        borderTopColor: '#fff', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
