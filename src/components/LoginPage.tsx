'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabase'

export default function LoginPage() {
  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Estado para el flujo de reset de contraseña
  const [showReset,  setShowReset]  = useState(false)
  const [resetEmail, setResetEmail] = useState('')
  const [resetSent,  setResetSent]  = useState(false)
  const [resetError, setResetError] = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)
    const { error } = await supabase.auth.signInWithPassword({ email, password })
    if (error) {
      setError(
        error.message === 'Invalid login credentials'
          ? 'Email o contraseña incorrectos.'
          : 'Error al iniciar sesión. Intentá de nuevo.'
      )
    }
    setLoading(false)
  }

  async function handleReset(e: React.FormEvent) {
    e.preventDefault()
    setResetError('')
    if (!resetEmail.includes('@')) {
      setResetError('Ingresá un email válido.')
      return
    }
    setResetLoading(true)
    const { error } = await supabase.auth.resetPasswordForEmail(resetEmail, {
      // Al hacer click en el link del email, Supabase redirige aquí
      // El auth-context detecta el tipo 'recovery' y muestra el formulario de nueva contraseña
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : '/',
    })
    setResetLoading(false)
    if (error) {
      setResetError('No pudimos enviar el email. Verificá la dirección.')
    } else {
      setResetSent(true)
    }
  }

  // ── VISTA: Formulario de reset ────────────────────────────────────────────
  if (showReset) {
    return (
      <div style={styles.page}>
        <div style={styles.card}>
          <div style={styles.logoWrap}>
            <div style={styles.logoIcon}>NE</div>
          </div>
          <h1 style={styles.title}>Recuperar contraseña</h1>

          {resetSent ? (
            <>
              <div style={styles.successBox}>
                <span style={{ fontSize: '20px' }}>✓</span>
                <div>
                  <p style={{ fontWeight: 600, marginBottom: 4 }}>Email enviado</p>
                  <p style={{ fontSize: '13px', color: '#5a4d6a' }}>
                    Revisá tu bandeja de entrada en <strong>{resetEmail}</strong>.
                    El link es válido por 24 horas.
                  </p>
                </div>
              </div>
              <button
                onClick={() => { setShowReset(false); setResetSent(false); setResetEmail('') }}
                style={styles.btnSecondary}
              >
                Volver al inicio de sesión
              </button>
            </>
          ) : (
            <form onSubmit={handleReset}>
              <p style={styles.resetHint}>
                Ingresá el email con el que te registraste y te enviaremos un link para crear una nueva contraseña.
              </p>
              <div style={styles.field}>
                <label style={styles.label}>EMAIL</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  style={styles.input}
                  autoFocus
                />
              </div>
              {resetError && <p style={styles.errorMsg}>{resetError}</p>}
              <button type="submit" disabled={resetLoading} style={styles.btnPrimary}>
                {resetLoading ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>
              <button
                type="button"
                onClick={() => { setShowReset(false); setResetError(''); setResetEmail('') }}
                style={styles.linkBtn}
              >
                ← Volver al inicio de sesión
              </button>
            </form>
          )}
        </div>
      </div>
    )
  }

  // ── VISTA: Login normal ───────────────────────────────────────────────────
  return (
    <div style={styles.page}>
      <div style={styles.card}>
        <div style={styles.logoWrap}>
          <div style={styles.logoIcon}>NE</div>
        </div>
        <h1 style={styles.title}>Iniciar sesión</h1>
        <p style={styles.subtitle}>Panel de gestión del instituto</p>

        <form onSubmit={handleLogin}>
          <div style={styles.field}>
            <label style={styles.label}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
              style={styles.input}
            />
          </div>
          <div style={styles.field}>
            <label style={styles.label}>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={styles.input}
            />
          </div>

          {error && <p style={styles.errorMsg}>{error}</p>}

          <button type="submit" disabled={loading} style={styles.btnPrimary}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        <div style={styles.resetWrap}>
          <button onClick={() => { setShowReset(true); setResetEmail(email) }} style={styles.linkBtn}>
            ¿Olvidaste tu contraseña?
          </button>
        </div>
      </div>
    </div>
  )
}

// ── ESTILOS ──────────────────────────────────────────────────────────────────
const styles: Record<string, React.CSSProperties> = {
  page: {
    minHeight: '100vh',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    background: 'var(--vll)',
    padding: '24px 16px',
  },
  card: {
    width: '100%',
    maxWidth: '400px',
    background: '#fff',
    borderRadius: '20px',
    padding: '36px 32px 28px',
    boxShadow: '0 8px 40px rgba(101,47,141,.14)',
    border: '1px solid var(--border)',
  },
  logoWrap: {
    display: 'flex',
    justifyContent: 'center',
    marginBottom: '20px',
  },
  logoIcon: {
    width: '56px',
    height: '56px',
    background: 'var(--v)',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '18px',
    fontWeight: 700,
    fontFamily: 'Georgia, serif',
  },
  title: {
    fontSize: '22px',
    fontWeight: 700,
    color: 'var(--text)',
    textAlign: 'center',
    marginBottom: '6px',
  },
  subtitle: {
    fontSize: '13px',
    color: 'var(--text3)',
    textAlign: 'center',
    marginBottom: '28px',
  },
  field: {
    marginBottom: '16px',
  },
  label: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text3)',
    letterSpacing: '.07em',
    marginBottom: '6px',
  },
  input: {
    width: '100%',
    padding: '11px 14px',
    border: '1px solid var(--border)',
    borderRadius: '10px',
    fontSize: '15px',
    color: 'var(--text)',
    background: '#fff',
    outline: 'none',
  } as React.CSSProperties,
  btnPrimary: {
    display: 'block',
    width: '100%',
    padding: '13px',
    background: 'var(--v)',
    color: '#fff',
    border: 'none',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    fontFamily: 'inherit',
    letterSpacing: '.01em',
  },
  btnSecondary: {
    display: 'block',
    width: '100%',
    padding: '13px',
    background: 'transparent',
    color: 'var(--v)',
    border: '1px solid var(--v)',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    marginTop: '8px',
    fontFamily: 'inherit',
  },
  errorMsg: {
    fontSize: '13px',
    color: 'var(--red)',
    marginBottom: '12px',
    padding: '10px 14px',
    background: 'var(--redl)',
    borderRadius: '8px',
  },
  successBox: {
    display: 'flex',
    alignItems: 'flex-start',
    gap: '12px',
    background: 'var(--greenl)',
    color: 'var(--green)',
    borderRadius: '10px',
    padding: '16px',
    marginBottom: '16px',
    fontSize: '14px',
  },
  resetWrap: {
    textAlign: 'center' as const,
    marginTop: '16px',
  },
  linkBtn: {
    background: 'none',
    border: 'none',
    color: 'var(--v2)',
    fontSize: '13px',
    textDecoration: 'underline',
    cursor: 'pointer',
    padding: '8px 0',
    display: 'block',
    margin: '0 auto',
    fontFamily: 'inherit',
  },
  resetHint: {
    fontSize: '14px',
    color: 'var(--text2)',
    marginBottom: '20px',
    lineHeight: 1.5,
  },
}
