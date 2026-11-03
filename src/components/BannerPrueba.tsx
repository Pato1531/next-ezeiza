'use client'

// Aviso superior: días que quedan de la prueba, o aviso de solo lectura cuando venció.
import { useAuth } from '@/lib/auth-context'
import { estadoPrueba } from '@/lib/prueba'

export default function BannerPrueba() {
  const { usuario, instituto } = useAuth()
  if (!usuario) return null
  const st = estadoPrueba((instituto as any)?.prueba_hasta)
  if (st.estado === 'sin_prueba') return null

  const vencida = st.estado === 'vencida'
  const texto = vencida
    ? 'Tu prueba terminó: el instituto está en modo solo lectura. Podés consultar y exportar, pero no cargar datos. Contactanos para elegir un plan.'
    : `Prueba gratuita: quedan ${st.diasRestantes} ${st.diasRestantes === 1 ? 'día' : 'días'}. Tenés todos los módulos de Premium.`

  return (
    <div style={{
      background: vencida ? '#fdeaea' : '#f0e6fa',
      color: vencida ? '#9b1c1c' : '#4a1f70',
      borderBottom: `1px solid ${vencida ? '#f5c5c5' : '#d9c4ef'}`,
      padding: '8px 14px', fontSize: '13px', fontWeight: 600, textAlign: 'center', lineHeight: 1.4,
      fontFamily: 'Inter, sans-serif',
    }}>
      {texto}
    </div>
  )
}
