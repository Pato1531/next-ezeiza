'use client'

// Pantalla para elegir la contraseña cuando la persona llega desde el link de
// invitación (type=invite) o de "olvidé mi contraseña" (type=recovery).
// Supabase deja una sesión temporal con ese link; acá se fija la contraseña nueva.
import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'

type Props = { tipo: 'invite' | 'recovery' }

export default function CrearClave({ tipo }: Props) {
  const supabase = createClient()
  const [nueva, setNueva] = useState('')
  const [repetir, setRepetir] = useState('')
  const [error, setError] = useState('')
  const [loading, setLoading] = useState(false)
  const [sinSesion, setSinSesion] = useState(false)
  const [listo, setListo] = useState(false)

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => {
      if (!data.session) setSinSesion(true)
    })
  }, [])

  async function guardar(e: React.FormEvent) {
    e.preventDefault()
    setError('')
    if (nueva.length < 8) { setError('La contraseña debe tener al menos 8 caracteres.'); return }
    if (nueva !== repetir) { setError('Las contraseñas no coinciden.'); return }
    setLoading(true)
    const { error } = await supabase.auth.updateUser({ password: nueva })
    setLoading(false)
    if (error) { setError('No pudimos guardar la contraseña: ' + error.message); return }
    setListo(true)
    // Recarga limpia: quita los tokens del link y entra a la app con la sesión ya activa
    setTimeout(() => window.location.replace('/'), 800)
  }

  const titulo = tipo === 'invite' ? 'Bienvenido/a a EduGest' : 'Nueva contraseña'
  const texto = tipo === 'invite'
    ? 'Elegí tu contraseña para activar tu cuenta.'
    : 'Elegí tu nueva contraseña para volver a ingresar.'

  const estilo = {
    page: { minHeight: '100vh', background: 'var(--v)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '20px', fontFamily: 'Inter, sans-serif' },
    card: { width: '100%', maxWidth: '400px', background: '#fff', borderRadius: '20px', padding: '36px 32px 28px', boxShadow: '0 8px 40px rgba(0,0,0,.18)' },
    title: { fontSize: '22px', fontWeight: 700, color: '#1a1020', textAlign: 'center' as const, marginBottom: '8px' },
    text: { fontSize: '14px', color: '#6b5e7b', textAlign: 'center' as const, marginBottom: '24px', lineHeight: 1.5 },
    label: { display: 'block', fontSize: '11px', fontWeight: 700, color: '#9b8eaa', letterSpacing: '.07em', marginBottom: '6px' },
    input: { width: '100%', padding: '11px 14px', border: '1.5px solid #e0d8f0', borderRadius: '10px', fontSize: '15px', color: '#1a1020', background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box' as const },
    field: { marginBottom: '16px' },
    btn: { display: 'block', width: '100%', padding: '13px', background: 'var(--v)', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '15px', fontWeight: 600, cursor: 'pointer', marginTop: '8px', fontFamily: 'inherit' },
    err: { color: '#c0392b', fontSize: '13px', marginBottom: '10px' },
  }

  return (
    <div style={estilo.page}>
      <div style={estilo.card}>
        <h1 style={estilo.title}>{titulo}</h1>

        {sinSesion ? (
          <>
            <p style={estilo.text}>El link ya venció o ya fue usado. Pedí uno nuevo desde la pantalla de ingreso.</p>
            <button style={estilo.btn} onClick={() => window.location.replace('/')}>Volver al ingreso</button>
          </>
        ) : listo ? (
          <p style={estilo.text}>✓ Contraseña guardada. Ingresando...</p>
        ) : (
          <form onSubmit={guardar}>
            <p style={estilo.text}>{texto}</p>
            <div style={estilo.field}>
              <label style={estilo.label}>NUEVA CONTRASEÑA</label>
              <input type="password" value={nueva} onChange={e => setNueva(e.target.value)}
                placeholder="Mínimo 8 caracteres" required autoComplete="new-password" style={estilo.input} />
            </div>
            <div style={estilo.field}>
              <label style={estilo.label}>REPETIR CONTRASEÑA</label>
              <input type="password" value={repetir} onChange={e => setRepetir(e.target.value)}
                required autoComplete="new-password" style={estilo.input} />
            </div>
            {error && <p style={estilo.err}>{error}</p>}
            <button type="submit" disabled={loading} style={estilo.btn}>
              {loading ? 'Guardando...' : 'Guardar contraseña'}
            </button>
          </form>
        )}
      </div>
    </div>
  )
}
