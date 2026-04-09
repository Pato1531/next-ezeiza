'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const { usuario, loading } = useAuth()
  const [mostrarApp, setMostrarApp] = useState(false)
  // hadSession: leído del localStorage para saber si hubo sesión previa.
  // Evita mostrar LoginPage prematuramente mientras Supabase resuelve el token.
  const [hadSession] = useState<boolean>(() => {
    if (typeof window === 'undefined') return false
    return Boolean(localStorage.getItem('ne_session_uid'))
  })

  useEffect(() => {
    if (usuario) setMostrarApp(true)
  }, [usuario])

  // Mientras carga Y había sesión previa → mostrar spinner (no LoginPage)
  // Esto evita el flash de login al volver del background
  if (loading || (hadSession && !mostrarApp && !usuario)) {
    return <Spinner />
  }

  // Sin sesión previa y sin usuario → login
  if (!mostrarApp && !usuario) {
    return <LoginPage />
  }

  // App montada — nunca se desmonta aunque usuario sea null transitoriamente
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
        width: '48px', height: '48px', border: '3px solid rgba(255,255,255,.3)',
        borderTopColor: '#fff', borderRadius: '50%',
        animation: 'spin 0.8s linear infinite',
      }} />
      <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
    </div>
  )
}
