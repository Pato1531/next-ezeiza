import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiHeaders } from '@/lib/hooks'
import { showToast } from '../Toast'
import { COLORES_PREDEFINIDOS, COLOR_MARCA_DEFAULT, aplicarColorMarca } from '@/lib/brand'

const UMBRAL_MIN = 1
const UMBRAL_MAX = 10
const UMBRAL_DEFAULT = 2

const CARD: React.CSSProperties = {
  background: 'var(--white)',
  border: '1.5px solid var(--border)',
  borderRadius: '14px',
  padding: '14px 16px',
}

const PROXIMAMENTE: React.CSSProperties = {
  padding: '3px 9px',
  borderRadius: '8px',
  background: 'var(--vl)',
  color: 'var(--v)',
  fontSize: '11px',
  fontWeight: 600,
  whiteSpace: 'nowrap',
}

const SEPARADOR = <div style={{ height: '1px', background: 'var(--border)', margin: '10px 0' }} />

export default function Personalizaciones() {
  const { usuario, instituto, recargarUsuario } = useAuth()
  const colorActual = instituto?.color_primario || COLOR_MARCA_DEFAULT
  const umbralActual = instituto?.umbral_ausencias ?? UMBRAL_DEFAULT

  const [color, setColor] = useState(colorActual)
  const [umbral, setUmbral] = useState(umbralActual)
  const [guardando, setGuardando] = useState(false)

  // Si el instituto cambia (recarga), sincronizar la selección con lo guardado
  useEffect(() => {
    setColor(colorActual)
    setUmbral(umbralActual)
  }, [colorActual, umbralActual])

  if (usuario?.rol !== 'director') {
    return (
      <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
        Solo el director puede modificar las personalizaciones del instituto.
      </div>
    )
  }

  const hayCambios = color.toLowerCase() !== colorActual.toLowerCase() || umbral !== umbralActual

  const descartar = () => {
    setColor(colorActual)
    setUmbral(umbralActual)
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      const res = await fetch('/api/personalizaciones', {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ color_primario: color, umbral_ausencias: umbral }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron guardar los cambios')
      aplicarColorMarca(color)
      await recargarUsuario()
      showToast('Cambios guardados')
    } catch (e: any) {
      showToast(e?.message || 'No se pudieron guardar los cambios', 'error')
    }
    setGuardando(false)
  }

  const colorNombre = COLORES_PREDEFINIDOS.find(c => c.hex.toLowerCase() === color.toLowerCase())?.nombre

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>

      <div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>Personalizaciones</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '2px' }}>
          Identidad y reglas del instituto. Los cambios los ven todos los usuarios de la sede.
        </div>
      </div>

      {/* IDENTIDAD */}
      <div style={CARD}>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>Identidad</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', margin: '2px 0 12px' }}>
          El color se usa en toda la app.
        </div>

        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Color principal</div>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
          {COLORES_PREDEFINIDOS.map(c => {
            const seleccionado = c.hex.toLowerCase() === color.toLowerCase()
            return (
              <button
                key={c.hex}
                type="button"
                onClick={() => setColor(c.hex)}
                aria-label={c.nombre}
                aria-pressed={seleccionado}
                style={{
                  height: '44px',
                  borderRadius: '10px',
                  background: c.hex,
                  border: seleccionado ? '3px solid var(--text)' : '1.5px solid var(--border)',
                  cursor: 'pointer',
                }}
              />
            )
          })}
        </div>
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
          Seleccionado: {colorNombre || 'Personalizado'}
        </div>

        {SEPARADOR}

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Logo del instituto</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Se usa en la barra y en los documentos</div>
          </div>
          <span style={PROXIMAMENTE}>Próximamente</span>
        </div>

        {SEPARADOR}

        {/* Vista previa */}
        <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
          <div style={{ height: '44px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', color: '#fff', fontWeight: 700, fontSize: '14px' }}>
            <span>{instituto?.nombre || 'Mi instituto'}</span>
            <span style={{ fontSize: '12px', fontWeight: 500 }}>Vista previa</span>
          </div>
          <div style={{ padding: '12px', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--white)' }}>
            <span style={{ background: color, color: '#fff', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600 }}>+ Nuevo</span>
            <span style={{ fontSize: '13px', fontWeight: 600, color }}>Próximos</span>
          </div>
        </div>
      </div>

      {/* OPERATIVAS */}
      <div style={CARD}>
        <div style={{ fontSize: '15px', fontWeight: 700 }}>Operativas</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', margin: '2px 0 12px' }}>
          Reglas que usa el sistema todos los días.
        </div>

        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ fontSize: '14px', fontWeight: 600 }}>Alerta de ausencias consecutivas</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Avisar a partir de faltas seguidas</div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <button
              type="button"
              aria-label="Bajar umbral"
              onClick={() => setUmbral(u => Math.max(UMBRAL_MIN, u - 1))}
              disabled={umbral <= UMBRAL_MIN}
              style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--white)', fontSize: '16px', cursor: 'pointer' }}
            >−</button>
            <span style={{ minWidth: '24px', textAlign: 'center', fontSize: '15px', fontWeight: 700 }}>{umbral}</span>
            <button
              type="button"
              aria-label="Subir umbral"
              onClick={() => setUmbral(u => Math.min(UMBRAL_MAX, u + 1))}
              disabled={umbral >= UMBRAL_MAX}
              style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--white)', fontSize: '16px', cursor: 'pointer' }}
            >+</button>
          </div>
        </div>

        {SEPARADOR}

        {[
          { titulo: 'Plantillas de WhatsApp', desc: 'Cobranza, bienvenida, cumpleaños' },
          { titulo: 'Documentos', desc: 'Recibos, certificados y boletines' },
          { titulo: 'Feriados provinciales', desc: 'Se suman a los nacionales en Agenda' },
        ].map((fila, i, arr) => (
          <div key={fila.titulo}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>{fila.titulo}</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{fila.desc}</div>
              </div>
              <span style={PROXIMAMENTE}>Próximamente</span>
            </div>
            {i < arr.length - 1 && SEPARADOR}
          </div>
        ))}
      </div>

      {/* ACCIONES */}
      <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
        <button
          type="button"
          onClick={descartar}
          disabled={!hayCambios || guardando}
          style={{ padding: '10px 16px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--white)', fontSize: '13px', fontWeight: 600, cursor: hayCambios ? 'pointer' : 'default', opacity: hayCambios ? 1 : 0.5 }}
        >
          Descartar
        </button>
        <button
          type="button"
          onClick={guardar}
          disabled={!hayCambios || guardando}
          style={{ padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'var(--v)', color: '#fff', fontSize: '13px', fontWeight: 700, cursor: hayCambios ? 'pointer' : 'default', opacity: hayCambios && !guardando ? 1 : 0.5 }}
        >
          {guardando ? 'Guardando…' : 'Guardar cambios'}
        </button>
      </div>
    </div>
  )
}
