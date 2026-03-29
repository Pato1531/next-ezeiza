'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'

function limpiarSesion() {
  try {
    document.cookie.split(';').forEach(c => {
      document.cookie = c.replace(/=.*/, '=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/')
    })
    Object.keys(localStorage).forEach(k => {
      if (k.startsWith('sb-')) localStorage.removeItem(k)
    })
  } catch {}
}

export default function LoginPage() {
  const { login } = useAuth()
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [limpiado, setLimpiado] = useState(false)

  const handleSubmit = async () => {
    if (!email || !password) return
    setLoading(true)
    setError('')
    limpiarSesion()
    const result = await login(email, password)
    if (result.error) setError(result.error)
    setLoading(false)
  }

  const handleKey = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSubmit()
  }

  const handleLimpiar = () => {
    limpiarSesion()
    setLimpiado(true)
    // Recargar automáticamente después de 1.5 segundos
    setTimeout(() => window.location.reload(), 1500)
  }

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--v)', padding: '24px' }}>
      <div style={{ background: 'var(--white)', borderRadius: '28px', padding: '36px 28px 32px', width: '100%', maxWidth: '400px' }}>
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{ width: '72px', height: '72px', borderRadius: '22px', background: 'var(--v)', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px' }}>
            <svg width="36" height="36" viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 5L27 11v10L16 27 5 21V11L16 5z"/>
              <path d="M16 5v22M5 11l11 10 11-10"/>
            </svg>
          </div>
          <div style={{ fontSize: '24px', fontWeight: 700, color: 'var(--text)', letterSpacing: '-.3px' }}>
            <span style={{ color: 'var(--v)' }}>Next</span> Ezeiza
          </div>
          <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '4px', letterSpacing: '.08em', textTransform: 'uppercase' }}>
            Instituto de Ingles - Panel de gestion
          </div>
        </div>

        <div style={{ fontSize: '18px', fontWeight: 600, marginBottom: '4px' }}>Bienvenido</div>
        <div style={{ fontSize: '14px', color: 'var(--text2)', marginBottom: '24px' }}>Ingresa con tus credenciales</div>

        {error && (
          <div style={{ background: 'var(--redl)', color: 'var(--red)', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px', border: '1px solid #f5c5c5' }}>
            {error}
          </div>
        )}

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Usuario</label>
          <input type="email" value={email} onChange={e => setEmail(e.target.value)} onKeyDown={handleKey} placeholder="usuario@nextezeiza.edu"
            style={{ width: '100%', padding: '14px 16px', border: email ? '1.5px solid var(--v)' : '1.5px solid var(--border)', borderRadius: '12px', fontSize: '15px', outline: 'none', background: 'var(--white)', color: 'var(--text)' }} />
        </div>

        <div style={{ marginBottom: '16px' }}>
          <label style={{ fontSize: '12px', fontWeight: 600, color: 'var(--text2)', display: 'block', marginBottom: '6px', textTransform: 'uppercase', letterSpacing: '.05em' }}>Contrasena</label>
          <input type="password" value={password} onChange={e => setPassword(e.target.value)} onKeyDown={handleKey} placeholder="..."
            style={{ width: '100%', padding: '14px 16px', border: password ? '1.5px solid var(--v)' : '1.5px solid var(--border)', borderRadius: '12px', fontSize: '15px', outline: 'none', background: 'var(--white)', color: 'var(--text)' }} />
        </div>

        <button onClick={handleSubmit} disabled={loading || !email || !password}
          style={{ width: '100%', padding: '15px', background: loading ? 'var(--text3)' : 'var(--v)', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '8px' }}>
          {loading ? 'Ingresando...' : 'Ingresar'}
        </button>

        <button onClick={handleLimpiar}
          style={{ width: '100%', padding: '10px', marginTop: '10px', background: 'transparent', color: limpiado ? 'var(--green)' : 'var(--text3)', border: 'none', borderRadius: '10px', fontSize: '13px', cursor: 'pointer' }}>
          {limpiado ? '✓ Listo — recargá la página para ingresar' : '¿Problemas para ingresar? Tocá acá'}
        </button>
      </div>
    </div>
  )
}
