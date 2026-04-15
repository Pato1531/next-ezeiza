'use client'

import { useState } from 'react'

const V = '#652f8d'
const IS = {
  width: '100%',
  padding: '14px 16px',
  border: '1.5px solid #e8dff2',
  borderRadius: '12px',
  fontSize: '15px',
  outline: 'none',
  background: '#fff',
  color: '#1a1020',
  fontFamily: 'inherit',
} as const

type Paso = 'form' | 'ok'

export default function RegistroPage() {
  const [paso, setPaso] = useState<Paso>('form')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [institutoCreado, setInstitutoCreado] = useState('')

  const [form, setForm] = useState({
    instituto_nombre: '',
    director_nombre: '',
    director_email: '',
    director_password: '',
    confirmar_password: '',
  })

  const set = (k: string) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm(f => ({ ...f, [k]: e.target.value }))

  const handleSubmit = async () => {
    setError('')

    if (!form.instituto_nombre.trim()) return setError('Ingresá el nombre de tu instituto.')
    if (!form.director_nombre.trim()) return setError('Ingresá tu nombre completo.')
    if (!form.director_email.includes('@')) return setError('El email no es válido.')
    if (form.director_password.length < 8) return setError('La contraseña debe tener al menos 8 caracteres.')
    if (form.director_password !== form.confirmar_password) return setError('Las contraseñas no coinciden.')

    setLoading(true)
    try {
      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instituto_nombre: form.instituto_nombre,
          director_nombre: form.director_nombre,
          director_email: form.director_email,
          director_password: form.director_password,
        }),
      })
      const json = await res.json()
      if (json.error) {
        setError(json.error)
      } else {
        setInstitutoCreado(json.instituto.nombre)
        setPaso('ok')
      }
    } catch {
      setError('Error de conexión. Intentá de nuevo.')
    }
    setLoading(false)
  }

  const css = `
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; }
    input:focus { border-color: ${V} !important; }
    input::placeholder { color: #b0a0c0; }
    @keyframes fadeIn { from { opacity: 0; transform: translateY(8px); } to { opacity: 1; transform: translateY(0); } }
    .fade { animation: fadeIn .3s ease; }
  `

  if (paso === 'ok') {
    return (
      <>
        <style>{css}</style>
        <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: V, padding: '24px' }}>
          <div className="fade" style={{ background: '#fff', borderRadius: '28px', padding: '40px 32px', width: '100%', maxWidth: '420px', textAlign: 'center' }}>
            <div style={{ width: '72px', height: '72px', borderRadius: '50%', background: '#e6f4ec', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 20px' }}>
              <svg width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="#2d7a4f" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <path d="M20 6L9 17l-5-5"/>
              </svg>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, marginBottom: '8px', color: '#1a1020' }}>
              ¡Instituto registrado!
            </div>
            <div style={{ fontSize: '15px', color: '#6b5b7a', marginBottom: '8px', lineHeight: 1.5 }}>
              <strong>{institutoCreado}</strong> ya está configurado y listo para usar.
            </div>
            <div style={{ fontSize: '14px', color: '#9b8eaa', marginBottom: '28px', lineHeight: 1.5 }}>
              Podés ingresar con tu email y contraseña desde la pantalla de login.
            </div>
            <a href="/"
              style={{ display: 'block', padding: '15px', background: V, color: '#fff', borderRadius: '12px', fontSize: '16px', fontWeight: 600, textDecoration: 'none' }}>
              Ir al login
            </a>
          </div>
        </div>
      </>
    )
  }

  return (
    <>
      <style>{css}</style>
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: V, padding: '24px' }}>
        <div className="fade" style={{ background: '#fff', borderRadius: '28px', padding: '36px 28px 32px', width: '100%', maxWidth: '460px' }}>

          {/* Header */}
          <div style={{ textAlign: 'center', marginBottom: '28px' }}>
            <div style={{ width: '64px', height: '64px', borderRadius: '20px', background: V, display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 12px' }}>
              <svg width="30" height="30" viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
                <path d="M16 5L27 11v10L16 27 5 21V11L16 5z"/>
                <path d="M16 5v22M5 11l11 10 11-10"/>
              </svg>
            </div>
            <div style={{ fontSize: '22px', fontWeight: 700, color: '#1a1020', letterSpacing: '-.3px' }}>
              Registrá tu instituto
            </div>
            <div style={{ fontSize: '13px', color: '#9b8eaa', marginTop: '4px' }}>
              Configuración completa en menos de 2 minutos
            </div>
          </div>

          {/* Sección instituto */}
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>
            Tu instituto
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a3558', display: 'block', marginBottom: '5px' }}>Nombre del instituto *</label>
            <input
              style={IS}
              placeholder="Ej: Next Springfield"
              value={form.instituto_nombre}
              onChange={set('instituto_nombre')}
            />
          </div>

          {/* Divider */}
          <div style={{ borderTop: '1px solid #f0edf5', margin: '18px 0 14px' }} />
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '10px' }}>
            Tu cuenta de director
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a3558', display: 'block', marginBottom: '5px' }}>Nombre completo *</label>
            <input
              style={IS}
              placeholder="Ej: Juan Pérez"
              value={form.director_nombre}
              onChange={set('director_nombre')}
            />
          </div>

          <div style={{ marginBottom: '14px' }}>
            <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a3558', display: 'block', marginBottom: '5px' }}>Email *</label>
            <input
              style={IS}
              type="email"
              placeholder="Ej: juan@miistituto.com"
              value={form.director_email}
              onChange={set('director_email')}
            />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px', marginBottom: '14px' }}>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a3558', display: 'block', marginBottom: '5px' }}>Contraseña *</label>
              <input
                style={IS}
                type="password"
                placeholder="Mín. 8 caracteres"
                value={form.director_password}
                onChange={set('director_password')}
              />
            </div>
            <div>
              <label style={{ fontSize: '12px', fontWeight: 600, color: '#4a3558', display: 'block', marginBottom: '5px' }}>Confirmar *</label>
              <input
                style={IS}
                type="password"
                placeholder="Repetí la contraseña"
                value={form.confirmar_password}
                onChange={set('confirmar_password')}
              />
            </div>
          </div>

          {/* Error */}
          {error && (
            <div style={{ background: '#fdeaea', color: '#c0392b', borderRadius: '10px', padding: '10px 14px', fontSize: '13px', marginBottom: '14px', border: '1px solid #f5c5c5' }}>
              {error}
            </div>
          )}

          {/* Submit */}
          <button
            onClick={handleSubmit}
            disabled={loading}
            style={{ width: '100%', padding: '15px', background: loading ? '#b0a0c0' : V, color: '#fff', border: 'none', borderRadius: '12px', fontSize: '16px', fontWeight: 600, cursor: loading ? 'not-allowed' : 'pointer', marginTop: '4px' }}>
            {loading ? 'Creando tu instituto...' : 'Crear instituto y cuenta'}
          </button>

          {/* Volver al login */}
          <div style={{ textAlign: 'center', marginTop: '16px' }}>
            <a href="/" style={{ fontSize: '13px', color: '#9b8eaa', textDecoration: 'none' }}>
              ¿Ya tenés cuenta? Ingresá acá
            </a>
          </div>

          {/* Plan info */}
          <div style={{ background: '#f9f5fd', borderRadius: '12px', padding: '12px 14px', marginTop: '18px', fontSize: '12px', color: '#9b8eaa', lineHeight: 1.5 }}>
            Empezás con el plan <strong style={{ color: V }}>Starter gratuito</strong> — podés gestionar hasta 50 alumnos sin costo. Sin tarjeta de crédito requerida.
          </div>
        </div>
      </div>
    </>
  )
}
