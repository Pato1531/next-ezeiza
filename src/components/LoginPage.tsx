'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase'

export default function LoginPage() {
  const supabase = createClient()

  const [email,    setEmail]    = useState('')
  const [password, setPassword] = useState('')
  const [error,    setError]    = useState('')
  const [loading,  setLoading]  = useState(false)

  // Estado para el flujo de reset de contraseña
  const [showReset,    setShowReset]    = useState(false)
  const [resetEmail,   setResetEmail]   = useState('')
  const [resetSent,    setResetSent]    = useState(false)
  const [resetError,   setResetError]   = useState('')
  const [resetLoading, setResetLoading] = useState(false)

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    setLoading(true)

    // Limpiar sesión previa antes de intentar login (preserva comportamiento original)
    try {
      await supabase.auth.signOut()
      localStorage.removeItem('ne_session_uid')
    } catch {}

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
      redirectTo: typeof window !== 'undefined' ? `${window.location.origin}/` : '/',
    })
    setResetLoading(false)
    if (error) {
      setResetError('No pudimos enviar el email. Verificá la dirección.')
    } else {
      setResetSent(true)
    }
  }

  // ── VISTA: Recuperar contraseña ───────────────────────────────────────────
  if (showReset) {
    return (
      <div style={s.page}>
        <div style={s.card}>
          <div style={s.logoWrap}>
            <div style={s.logoIcon}>NE</div>
          </div>
          <h1 style={s.title}>Recuperar contraseña</h1>

          {resetSent ? (
            <>
              <div style={s.successBox}>
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
                style={s.btnSecondary}
              >
                Volver al inicio de sesión
              </button>
            </>
          ) : (
            <form onSubmit={handleReset}>
              <p style={s.resetHint}>
                Ingresá el email con el que te registraste y te enviaremos un link para crear una nueva contraseña.
              </p>
              <div style={s.field}>
                <label style={s.label}>EMAIL</label>
                <input
                  type="email"
                  value={resetEmail}
                  onChange={e => setResetEmail(e.target.value)}
                  placeholder="tu@email.com"
                  required
                  style={s.input}
                  autoFocus
                />
              </div>
              {resetError && <p style={s.errorMsg}>{resetError}</p>}
              <button type="submit" disabled={resetLoading} style={s.btnPrimary}>
                {resetLoading ? 'Enviando...' : 'Enviar link de recuperación'}
              </button>
              <button
                type="button"
                onClick={() => { setShowReset(false); setResetError(''); setResetEmail('') }}
                style={s.linkBtn}
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
    <div style={s.page}>
      <div style={s.card}>
        <div style={s.logoWrap}>
          <div style={s.logoIcon}>NE</div>
        </div>
        <h1 style={s.title}>Iniciar sesión</h1>
        <p style={s.subtitle}>Panel de gestión del instituto</p>

        <form onSubmit={handleLogin}>
          <div style={s.field}>
            <label style={s.label}>EMAIL</label>
            <input
              type="email"
              value={email}
              onChange={e => setEmail(e.target.value)}
              placeholder="tu@email.com"
              required
              autoComplete="email"
              style={s.input}
            />
          </div>
          <div style={s.field}>
            <label style={s.label}>CONTRASEÑA</label>
            <input
              type="password"
              value={password}
              onChange={e => setPassword(e.target.value)}
              placeholder="••••••••"
              required
              autoComplete="current-password"
              style={s.input}
            />
          </div>

          {error && <p style={s.errorMsg}>{error}</p>}

          <button type="submit" disabled={loading} style={s.btnPrimary}>
            {loading ? 'Ingresando...' : 'Ingresar'}
          </button>
        </form>

        {/* ¿Olvidaste tu contraseña? */}
        <div style={{ textAlign: 'center', marginTop: '12px' }}>
          <button
            onClick={() => { setShowReset(true); setResetEmail(email) }}
            style={s.linkBtn}
          >
            ¿Olvidaste tu contraseña?
          </button>
        </div>

        {/* Link a registro de nueva sede — igual que el original */}
        <div style={s.registroWrap}>
          <span style={{ fontSize: '13px', color: 'var(--text3)' }}>¿Sos director de un instituto? </span>
          <a href="/registro" style={s.registroLink}>Registrá tu sede</a>
        </div>
      </div>
    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────────────────────
const s: Record<string, React.CSSProperties> = {
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
    border: '1.5px solid var(--border)',
    borderRadius: '10px',
    fontSize: '15px',
    color: 'var(--text)',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
  },
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
    border: '1.5px solid var(--v)',
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
  registroWrap: {
    textAlign: 'center',
    marginTop: '20px',
    paddingTop: '16px',
    borderTop: '1px solid var(--border)',
  },
  registroLink: {
    color: 'var(--v)',
    fontSize: '13px',
    fontWeight: 600,
    textDecoration: 'none',
    marginLeft: '4px',
  },
}
