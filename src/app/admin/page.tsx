'use client'
import { useState } from 'react'

const CLAVE_MAESTRA = process.env.NEXT_PUBLIC_ADMIN_KEY || 'nextezeiza2025admin'

type Step = 'login' | 'form' | 'success'
type Estado = 'idle' | 'loading' | 'done' | 'error'

interface Resultado {
  instituto: string
  slug: string
  url: string
  email: string
  password: string
}

const IS = {
  width: '100%', padding: '10px 14px',
  border: '1.5px solid #e0d8f0', borderRadius: '10px',
  fontSize: '14px', fontFamily: 'Inter,sans-serif',
  outline: 'none', color: '#1a1020', background: '#fff',
} as const

const SEL = { ...IS, cursor: 'pointer' } as const

function slugify(s: string) {
  return s.toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 40)
}

function genPass() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghjkmnpqrstuvwxyz23456789@#!'
  return Array.from({ length: 12 }, () => chars[Math.floor(Math.random() * chars.length)]).join('')
}

export default function AdminPage() {
  const [step, setStep] = useState<Step>('login')
  const [clave, setClave] = useState('')
  const [errorClave, setErrorClave] = useState('')

  // Formulario
  const [instNombre, setInstNombre] = useState('')
  const [instSlug, setInstSlug] = useState('')
  const [slugManual, setSlugManual] = useState(false)
  const [instPlan, setInstPlan] = useState('standard')
  const [instCiudad, setInstCiudad] = useState('')
  const [dirNombre, setDirNombre] = useState('')
  const [dirApellido, setDirApellido] = useState('')
  const [dirEmail, setDirEmail] = useState('')
  const [dirPass, setDirPass] = useState(genPass())

  const [estado, setEstado] = useState<Estado>('idle')
  const [error, setError] = useState('')
  const [resultado, setResultado] = useState<Resultado | null>(null)

  const handleInstNombre = (v: string) => {
    setInstNombre(v)
    if (!slugManual) setInstSlug(slugify(v))
  }

  const crear = async () => {
    if (!instNombre.trim()) return setError('El nombre del instituto es obligatorio')
    if (!dirNombre.trim() || !dirApellido.trim()) return setError('Nombre y apellido del director son obligatorios')
    if (!dirEmail.includes('@')) return setError('El email no es válido')
    if (dirPass.length < 8) return setError('La contraseña debe tener al menos 8 caracteres')

    setEstado('loading')
    setError('')

    try {
      const res = await fetch('/api/registro', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          instituto_nombre: instNombre.trim(),
          director_nombre: `${dirNombre.trim()} ${dirApellido.trim()}`,
          director_email: dirEmail.trim().toLowerCase(),
          director_password: dirPass,
        }),
      })
      const json = await res.json()
      if (!res.ok || json.error) {
        setError(json.error || 'Error al crear la sede')
        setEstado('error')
        return
      }
      setResultado({
        instituto: json.instituto?.nombre || instNombre,
        slug: json.instituto?.slug || instSlug,
        url: `https://next-${json.instituto?.slug || instSlug}.vercel.app`,
        email: dirEmail.trim().toLowerCase(),
        password: dirPass,
      })
      setEstado('done')
      setStep('success')
    } catch (e: any) {
      setError('Error de conexión: ' + e.message)
      setEstado('error')
    }
  }

  const reset = () => {
    setInstNombre(''); setInstSlug(''); setSlugManual(false)
    setInstPlan('standard'); setInstCiudad('')
    setDirNombre(''); setDirApellido(''); setDirEmail('')
    setDirPass(genPass()); setError(''); setEstado('idle')
    setResultado(null); setStep('form')
  }

  // ── LOGIN ─────────────────────────────────────────────────────────────────
  if (step === 'login') return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f0fa', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '36px 32px', width: '100%', maxWidth: '380px', boxShadow: '0 4px 32px rgba(101,47,141,.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: '28px' }}>
          <div style={{ fontSize: '28px', fontWeight: 800, letterSpacing: '-.5px' }}>
            <span style={{ color: '#652f8d' }}>Next</span> Admin
          </div>
          <div style={{ fontSize: '13px', color: '#9b8eaa', marginTop: '4px' }}>Panel privado de gestión de sedes</div>
        </div>
        <div style={{ marginBottom: '14px' }}>
          <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '4px' }}>Clave de acceso</div>
          <input
            type="password"
            style={IS}
            value={clave}
            onChange={e => setClave(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter') { if (clave === CLAVE_MAESTRA) setStep('form'); else setErrorClave('Clave incorrecta') } }}
            placeholder="••••••••••••"
            autoFocus
          />
          {errorClave && <div style={{ fontSize: '12px', color: '#c0392b', marginTop: '5px' }}>{errorClave}</div>}
        </div>
        <button
          onClick={() => { if (clave === CLAVE_MAESTRA) { setStep('form'); setErrorClave('') } else setErrorClave('Clave incorrecta') }}
          style={{ width: '100%', padding: '12px', background: '#652f8d', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}
        >
          Entrar
        </button>
      </div>
    </div>
  )

  // ── SUCCESS ───────────────────────────────────────────────────────────────
  if (step === 'success' && resultado) return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', background: '#f4f0fa', padding: '20px' }}>
      <div style={{ background: '#fff', borderRadius: '20px', padding: '36px 32px', width: '100%', maxWidth: '480px', boxShadow: '0 4px 32px rgba(101,47,141,.12)' }}>
        <div style={{ textAlign: 'center', marginBottom: '24px' }}>
          <div style={{ width: 56, height: 56, borderRadius: '50%', background: '#e6f4ec', display: 'flex', alignItems: 'center', justifyContent: 'center', margin: '0 auto 14px', fontSize: '24px' }}>✓</div>
          <div style={{ fontSize: '20px', fontWeight: 700, color: '#1a1020' }}>¡Sede creada!</div>
          <div style={{ fontSize: '13px', color: '#9b8eaa', marginTop: '4px' }}>{resultado.instituto}</div>
        </div>

        {/* Datos para entregar al cliente */}
        <div style={{ background: '#f9f5fd', borderRadius: '12px', padding: '16px', marginBottom: '16px' }}>
          <div style={{ fontSize: '11px', fontWeight: 700, color: '#652f8d', textTransform: 'uppercase', letterSpacing: '.06em', marginBottom: '12px' }}>Datos para entregar al cliente</div>
          {[
            { label: 'URL de acceso', val: resultado.url, mono: true },
            { label: 'Email director', val: resultado.email, mono: true },
            { label: 'Contraseña inicial', val: resultado.password, mono: true },
          ].map(r => (
            <div key={r.label} style={{ marginBottom: '10px' }}>
              <div style={{ fontSize: '11px', color: '#9b8eaa', marginBottom: '3px' }}>{r.label}</div>
              <div style={{ fontSize: '13px', fontFamily: r.mono ? 'monospace' : 'inherit', fontWeight: 600, color: '#1a1020', background: '#fff', padding: '7px 10px', borderRadius: '8px', border: '1px solid #e0d8f0', wordBreak: 'break-all' }}>
                {r.val}
              </div>
            </div>
          ))}
        </div>

        {/* Estado de componentes */}
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px', marginBottom: '20px' }}>
          {[
            { label: 'Instituto en base de datos', ok: true },
            { label: 'Usuario director (Auth)', ok: true },
            { label: 'Deploy en Vercel', ok: false, note: 'Hacerlo manualmente — ~5 min' },
          ].map(item => (
            <div key={item.label} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '9px 12px', background: '#f9f5fd', borderRadius: '8px', fontSize: '13px' }}>
              <span style={{ color: '#4a3560' }}>{item.label}</span>
              <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 600, background: item.ok ? '#e6f4ec' : '#fef3cd', color: item.ok ? '#2d7a4f' : '#b45309' }}>
                {item.ok ? '✓ Listo' : '⏳ Pendiente'}
              </span>
            </div>
          ))}
        </div>

        {/* Próximos pasos */}
        <div style={{ background: '#fffbf0', border: '1px solid #f0dba0', borderRadius: '10px', padding: '12px 14px', marginBottom: '20px', fontSize: '12px', color: '#7a5c00', lineHeight: 1.7 }}>
          <strong>Próximo paso:</strong> Ir a Vercel → New Project → importar el repo → variable <code>NEXT_PUBLIC_INSTITUTO_ID</code> = UUID del instituto creado → Deploy.
        </div>

        <div style={{ display: 'flex', gap: '10px' }}>
          <button onClick={reset} style={{ flex: 1, padding: '12px', background: '#652f8d', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
            + Alta nueva sede
          </button>
        </div>
      </div>
    </div>
  )

  // ── FORM ──────────────────────────────────────────────────────────────────
  return (
    <div style={{ minHeight: '100vh', background: '#f4f0fa', padding: '24px 16px' }}>
      <div style={{ maxWidth: '580px', margin: '0 auto' }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '24px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.5px' }}>
              <span style={{ color: '#652f8d' }}>Next</span> Admin
            </div>
            <div style={{ fontSize: '13px', color: '#9b8eaa' }}>Alta de nueva sede</div>
          </div>
          <div style={{ fontSize: '12px', color: '#9b8eaa', background: '#fff', padding: '4px 12px', borderRadius: '20px', border: '1px solid #e0d8f0' }}>
            Acceso privado
          </div>
        </div>

        {/* Sección: Instituto */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '14px', border: '1px solid #e8e0f4' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#652f8d', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '16px' }}>
            Datos del instituto
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Nombre *</div>
            <input style={IS} value={instNombre} onChange={e => handleInstNombre(e.target.value)} placeholder="Ej: Instituto Palermo" />
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Slug (URL)</div>
              <input style={IS} value={instSlug}
                onChange={e => { setInstSlug(e.target.value); setSlugManual(true) }}
                placeholder="palermo" />
              <div style={{ fontSize: '10px', color: '#9b8eaa', marginTop: '3px' }}>next-{instSlug || 'slug'}.vercel.app</div>
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Plan</div>
              <select style={SEL} value={instPlan} onChange={e => setInstPlan(e.target.value)}>
                <option value="basico">Básico</option>
                <option value="standard">Standard</option>
                <option value="premium">Premium</option>
              </select>
            </div>
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Ciudad (opcional)</div>
            <input style={IS} value={instCiudad} onChange={e => setInstCiudad(e.target.value)} placeholder="Buenos Aires" />
          </div>
        </div>

        {/* Sección: Director */}
        <div style={{ background: '#fff', borderRadius: '16px', padding: '20px', marginBottom: '14px', border: '1px solid #e8e0f4' }}>
          <div style={{ fontSize: '12px', fontWeight: 700, color: '#652f8d', textTransform: 'uppercase', letterSpacing: '.07em', marginBottom: '16px' }}>
            Director de la sede
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Nombre *</div>
              <input style={IS} value={dirNombre} onChange={e => setDirNombre(e.target.value)} placeholder="Juan" />
            </div>
            <div>
              <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Apellido *</div>
              <input style={IS} value={dirApellido} onChange={e => setDirApellido(e.target.value)} placeholder="García" />
            </div>
          </div>

          <div style={{ marginBottom: '12px' }}>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Email *</div>
            <input type="email" style={IS} value={dirEmail} onChange={e => setDirEmail(e.target.value)} placeholder="juan@institutopale​rmo.com" />
          </div>

          <div>
            <div style={{ fontSize: '11px', fontWeight: 600, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.04em', marginBottom: '4px' }}>Contraseña inicial</div>
            <div style={{ display: 'flex', gap: '8px' }}>
              <input style={{ ...IS, flex: 1, fontFamily: 'monospace' }} value={dirPass} onChange={e => setDirPass(e.target.value)} />
              <button onClick={() => setDirPass(genPass())}
                style={{ padding: '10px 14px', background: '#f4f0fa', border: '1.5px solid #e0d8f0', borderRadius: '10px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', color: '#652f8d', whiteSpace: 'nowrap' }}>
                ↻ Nueva
              </button>
            </div>
            <div style={{ fontSize: '11px', color: '#9b8eaa', marginTop: '3px' }}>Se entrega al cliente junto con la URL de acceso</div>
          </div>
        </div>

        {/* Error */}
        {error && (
          <div style={{ padding: '12px 14px', background: '#fdeaea', border: '1px solid #f5c5c5', borderRadius: '10px', fontSize: '13px', color: '#c0392b', marginBottom: '14px' }}>
            ⚠ {error}
          </div>
        )}

        {/* Botón crear */}
        <button
          onClick={crear}
          disabled={estado === 'loading'}
          style={{ width: '100%', padding: '14px', background: estado === 'loading' ? '#aaa' : '#652f8d', color: '#fff', border: 'none', borderRadius: '12px', fontSize: '15px', fontWeight: 700, cursor: estado === 'loading' ? 'not-allowed' : 'pointer' }}
        >
          {estado === 'loading' ? 'Creando sede...' : '+ Crear sede'}
        </button>

        <div style={{ fontSize: '11px', color: '#9b8eaa', textAlign: 'center', marginTop: '10px' }}>
          Esta página es privada — solo accesible con la clave maestra
        </div>
      </div>
    </div>
  )
}
