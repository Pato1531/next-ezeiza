'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { devLog } from '@/lib/debug'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const { usuario, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)
  const [mostrarApp, setMostrarApp] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 6000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    devLog(`[PAGE] usuario=${!!usuario} mostrarApp=${mostrarApp}`)
    // Una vez que hay usuario, mostrar la app y NUNCA ocultarla
    // aunque usuario vuelva a null transitoriamente.
    // Esto evita que AppShell se desmonte y pierda su estado.
    if (usuario) {
      setMostrarApp(true)
    }
  }, [usuario])

  // Carga inicial
  if (loading && !timedOut) {
    return <Spinner />
  }

  // Si nunca hubo usuario, mostrar login
  if (!mostrarApp && !usuario) {
    return <LoginPage />
  }

  // AppShell siempre montado una vez que el usuario se logueó
  // Si usuario es null transitoriamente, AppShell sigue montado
  // con su estado intacto hasta que se confirme la sesión
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
