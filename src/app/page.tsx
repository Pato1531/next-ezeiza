'use client'

import { useEffect, useState, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import LoginPage from '@/components/LoginPage'
import AppShell from '@/components/AppShell'

export default function Home() {
  const { usuario, loading } = useAuth()
  const [timedOut, setTimedOut] = useState(false)
  // Rastrear si alguna vez hubo un usuario logueado en esta sesión
  const huboUsuarioRef = useRef(false)
  // Estado para mostrar pantalla de reconexión en lugar de login
  const [reconectando, setReconectando] = useState(false)

  useEffect(() => {
    const t = setTimeout(() => setTimedOut(true), 6000)
    return () => clearTimeout(t)
  }, [])

  useEffect(() => {
    if (usuario) {
      huboUsuarioRef.current = true
      setReconectando(false)
    }
  }, [usuario])

  useEffect(() => {
    // Si había un usuario y ahora no hay (sesión perdida transitoriamente),
    // mostrar pantalla de reconexión en lugar de login
    if (!loading && !usuario && huboUsuarioRef.current) {
      setReconectando(true)
      // Esperar hasta 8 segundos para que Supabase refresque el token
      const t = setTimeout(() => {
        // Si después de 8 segundos sigue sin usuario, mostrar login
        setReconectando(false)
      }, 8000)
      return () => clearTimeout(t)
    }
  }, [loading, usuario])

  // Pantalla de carga inicial
  if (loading && !timedOut) {
    return <Spinner />
  }

  // Reconectando — hubo sesión pero se perdió transitoriamente
  if (reconectando) {
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
        <Spinner />
        <div style={{ color: 'rgba(255,255,255,0.8)', fontSize: '14px', fontWeight: 500 }}>
          Reconectando...
        </div>
      </div>
    )
  }

  if (!usuario) return <LoginPage />
  return <AppShell />
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
