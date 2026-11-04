'use client'

import { useEffect, useState } from 'react'
import { useAuth } from '@/lib/auth-context'

// 'edugest'  → logo de EduGest arriba (default)
// 'instituto' → logo del instituto (si no tiene, usa el de EduGest)
const LOGO_MODE: 'edugest' | 'instituto' = 'edugest'

const DURACION_MS = 2600
const CLAVE_SESION = 'edugest_welcome_shown'

export default function WelcomeSplash() {
  const { instituto } = useAuth()
  const [visible, setVisible] = useState(false)
  const [saliendo, setSaliendo] = useState(false)

  useEffect(() => {
    try {
      // Solo cuando la app se abre desde el inicio del celular (modo standalone)
      const esStandalone =
        window.matchMedia('(display-mode: standalone)').matches ||
        (navigator as any).standalone === true
      if (!esStandalone) return
      // Una vez por sesión: no repetir al navegar o recargar
      if (sessionStorage.getItem(CLAVE_SESION)) return
      sessionStorage.setItem(CLAVE_SESION, '1')
    } catch {
      return
    }

    setVisible(true)
    const t1 = setTimeout(() => setSaliendo(true), DURACION_MS)
    const t2 = setTimeout(() => setVisible(false), DURACION_MS + 500)
    return () => { clearTimeout(t1); clearTimeout(t2) }
  }, [])

  if (!visible) return null

  const logo =
    LOGO_MODE === 'instituto' && instituto?.logo_url ? instituto.logo_url : '/edugest-icon.png'

  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: 'fixed', inset: 0, zIndex: 9999,
        background: '#652f8d', color: '#fff',
        display: 'flex', flexDirection: 'column',
        alignItems: 'center', justifyContent: 'center',
        padding: '24px', textAlign: 'center',
        opacity: saliendo ? 0 : 1,
        transition: 'opacity .5s ease',
      }}
    >
      <div style={{
        width: 96, height: 96, borderRadius: 24, background: '#fff',
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        overflow: 'hidden', marginBottom: 24,
        boxShadow: '0 10px 30px rgba(0,0,0,.25)',
      }}>
        <img src={logo} alt="" style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
      </div>
      <div style={{ fontSize: 24, fontWeight: 700, marginBottom: 8 }}>
        Bienvenido a EduGest
      </div>
      <div style={{ fontSize: 15, opacity: 0.85 }}>
        Tu app de administración
      </div>
      {instituto?.nombre && (
        <div style={{ fontSize: 12, opacity: 0.6, marginTop: 36, letterSpacing: '.04em' }}>
          {instituto.nombre}
        </div>
      )}
    </div>
  )
}
