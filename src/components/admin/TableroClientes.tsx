'use client'

// Tablero de clientes del panel admin: sedes, plan, prueba, alumnos activos y módulos por cliente.
import { useEffect, useMemo, useState } from 'react'
import { MODULOS_PLAN } from '@/lib/modulos-plan'
import { MODULOS_SIEMPRE } from '@/lib/modulos-efectivos'
import { estadoPrueba, DIAS_PRUEBA } from '@/lib/prueba'

type Cliente = {
  id: string
  nombre: string
  ciudad: string | null
  plan: string | null
  activo: boolean
  created_at: string
  alumnos_activos: number
  modulos_activos: string[]
  modulos_override: Record<string, boolean>
  prueba_hasta: string | null
}

const NOMBRE_PLAN: Record<string, string> = { standard: 'Standard', premium: 'Premium', basico: 'Básico' }

export default function TableroClientes({ clave, onVolver }: { clave: string; onVolver: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtroPlan, setFiltroPlan] = useState<'todos' | 'standard' | 'premium'>('todos')
  const [abierto, setAbierto] = useState<string | null>(null)
  const [guardando, setGuardando] = useState('')
  const [errorAccion, setErrorAccion] = useState('')

  useEffect(() => {
    fetch('/api/admin-resumen', { headers: { 'x-admin-key': clave } })
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error al cargar')
        setClientes(json.institutos || [])
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false))
  }, [clave])

  const visibles = useMemo(
    () => clientes.filter(c => filtroPlan === 'todos' || c.plan === filtroPlan)
      .sort((a, b) => b.alumnos_activos - a.alumnos_activos),
    [clientes, filtroPlan]
  )

  const totalAlumnos = clientes.reduce((s, c) => s + c.alumnos_activos, 0)
  const activos = clientes.filter(c => c.activo).length
  const porPlan = (p: string) => clientes.filter(c => c.plan === p).length
  const enPrueba = clientes.filter(c => estadoPrueba(c.prueba_hasta).estado === 'en_prueba').length

  // Llamada genérica al servidor; actualiza el cliente con la respuesta
  const llamar = async (c: Cliente, ruta: string, body: Record<string, unknown>, clavePendiente: string, actualizar: (json: any) => Partial<Cliente>) => {
    setGuardando(clavePendiente)
    setErrorAccion('')
    try {
      const res = await fetch(ruta, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': clave },
        body: JSON.stringify({ instituto_id: c.id, ...body }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
      setClientes(prev => prev.map(x => (x.id === c.id ? { ...x, ...actualizar(json) } : x)))
    } catch (e: any) {
      setErrorAccion(e.message)
    } finally {
      setGuardando('')
    }
  }

  const toggleModulo = (c: Cliente, modulo: string) =>
    llamar(c, '/api/admin-modulos-cliente', { modulo, activo: !c.modulos_activos.includes(modulo) }, c.id + ':' + modulo,
      json => ({ modulos_activos: json.modulos_activos, modulos_override: json.modulos_override }))

  const volverAlPlan = (c: Cliente) =>
    llamar(c, '/api/admin-modulos-cliente', { reset: true }, c.id + ':reset',
      json => ({ modulos_activos: json.modulos_activos, modulos_override: json.modulos_override }))

  const extenderPrueba = (c: Cliente) =>
    llamar(c, '/api/admin-prueba', { accion: 'extender' }, c.id + ':extender',
      json => ({ prueba_hasta: json.prueba_hasta, modulos_activos: MODULOS_PLAN.map(m => m.id) }))

  const pasarAPlan = (c: Cliente, plan: 'standard' | 'premium') =>
    llamar(c, '/api/admin-prueba', { accion: 'convertir', plan }, c.id + ':convertir',
      json => ({ plan: json.plan, prueba_hasta: null, modulos_activos: json.modulos_activos }))

  const card = { background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #e8e0f4' } as const
  const label = { fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase' as const, letterSpacing: '.05em' }
  const COLS = ['Instituto', 'Ciudad', 'Plan', 'Estado', 'Alumnos activos', 'Módulos']

  return (
    <div style={{ minHeight: '100vh', background: '#f4f0fa', padding: '24px 16px' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.5px' }}>
              <span style={{ color: '#652f8d' }}>Next</span> Admin
            </div>
            <div style={{ fontSize: '13px', color: '#9b8eaa' }}>Tablero de clientes</div>
          </div>
          <button onClick={onVolver} style={{ padding: '8px 14px', background: '#fff', border: '1.5px solid #e0d8f0', borderRadius: '10px', fontSize: '13px', fontWeight: 600, color: '#652f8d', cursor: 'pointer' }}>
            ← Alta de sede
          </button>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={card}>
            <div style={label}>Clientes</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a1020' }}>{clientes.length}</div>
            <div style={{ fontSize: '12px', color: '#9b8eaa' }}>{activos} activos · {enPrueba} en prueba</div>
          </div>
          <div style={card}>
            <div style={label}>Alumnos activos</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#652f8d' }}>{totalAlumnos.toLocaleString('es-AR')}</div>
            <div style={{ fontSize: '12px', color: '#9b8eaa' }}>en todas las sedes</div>
          </div>
          <div style={card}>
            <div style={label}>Plan Standard</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a1020' }}>{porPlan('standard')}</div>
            <div style={{ fontSize: '12px', color: '#9b8eaa' }}>clientes</div>
          </div>
          <div style={card}>
            <div style={label}>Plan Premium</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a1020' }}>{porPlan('premium')}</div>
            <div style={{ fontSize: '12px', color: '#9b8eaa' }}>clientes</div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {(['todos', 'standard', 'premium'] as const).map(p => (
            <button key={p} onClick={() => setFiltroPlan(p)}
              style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid #e0d8f0', background: filtroPlan === p ? '#652f8d' : '#fff', color: filtroPlan === p ? '#fff' : '#652f8d' }}>
              {p === 'todos' ? 'Todos' : NOMBRE_PLAN[p]}
            </button>
          ))}
        </div>

        {errorAccion && (
          <div style={{ ...card, marginBottom: '12px', color: '#c0392b', fontSize: '13px' }}>⚠ {errorAccion}</div>
        )}

        <div style={{ ...card, padding: 0, overflow: 'hidden' }}>
          {cargando ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9b8eaa', fontSize: '14px' }}>Cargando...</div>
          ) : error ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#c0392b', fontSize: '14px' }}>{error}</div>
          ) : visibles.length === 0 ? (
            <div style={{ padding: '32px', textAlign: 'center', color: '#9b8eaa', fontSize: '14px' }}>No hay clientes para mostrar.</div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                <thead>
                  <tr style={{ background: '#f9f5fd', textAlign: 'left' }}>
                    {COLS.map((h, i) => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(c => (
                    <FilaCliente key={c.id} c={c} abierto={abierto === c.id}
                      onAbrir={() => setAbierto(abierto === c.id ? null : c.id)}
                      onToggle={modulo => toggleModulo(c, modulo)}
                      onReset={() => volverAlPlan(c)}
                      onExtender={() => extenderPrueba(c)}
                      onPasarAPlan={plan => pasarAPlan(c, plan)}
                      guardando={guardando} />
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  )
}

function Badge({ c }: { c: Cliente }) {
  const st = estadoPrueba(c.prueba_hasta)
  if (st.estado === 'sin_prueba') return null
  const vencida = st.estado === 'vencida'
  return (
    <span style={{ marginLeft: '6px', padding: '2px 8px', borderRadius: '20px', fontSize: '10px', fontWeight: 700,
      background: vencida ? '#fdeaea' : '#f0e6fa', color: vencida ? '#9b1c1c' : '#652f8d' }}>
      {vencida ? 'PRUEBA VENCIDA' : `PRUEBA · ${st.diasRestantes} ${st.diasRestantes === 1 ? 'día' : 'días'}`}
    </span>
  )
}

function FilaCliente({ c, abierto, onAbrir, onToggle, onReset, onExtender, onPasarAPlan, guardando }: {
  c: Cliente; abierto: boolean
  onAbrir: () => void; onToggle: (modulo: string) => void; onReset: () => void
  onExtender: () => void; onPasarAPlan: (plan: 'standard' | 'premium') => void
  guardando: string
}) {
  const st = estadoPrueba(c.prueba_hasta)
  const enPrueba = st.estado !== 'sin_prueba'
  const ajustados = Object.keys(c.modulos_override || {}).length
  const btn = (extra: Record<string, string>) => ({
    padding: '6px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
    border: '1.5px solid #652f8d', background: '#fff', color: '#652f8d', ...extra,
  })
  return (
    <>
      <tr style={{ borderTop: '1px solid #f0eaf8' }}>
        <td style={{ padding: '11px 14px', fontWeight: 600, color: '#1a1020' }}>{c.nombre}</td>
        <td style={{ padding: '11px 14px', color: '#6b5e7b' }}>{c.ciudad || '—'}</td>
        <td style={{ padding: '11px 14px' }}>
          <span style={{ padding: '2px 10px', borderRadius: '20px', fontSize: '11px', fontWeight: 700, background: '#f0e6fa', color: '#652f8d' }}>
            {NOMBRE_PLAN[c.plan || ''] || c.plan || 'Sin plan'}
          </span>
        </td>
        <td style={{ padding: '11px 14px' }}>
          <span style={{ fontSize: '12px', fontWeight: 600, color: c.activo ? '#2d7a4f' : '#9b8eaa' }}>
            {c.activo ? '● Activo' : '○ Inactivo'}
          </span>
          <Badge c={c} />
        </td>
        <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#1a1020' }}>
          {c.alumnos_activos.toLocaleString('es-AR')}
        </td>
        <td style={{ padding: '11px 14px' }}>
          <button onClick={onAbrir}
            style={{ padding: '5px 12px', borderRadius: '8px', fontSize: '12px', fontWeight: 600, cursor: 'pointer', border: '1.5px solid #652f8d', background: abierto ? '#652f8d' : '#fff', color: abierto ? '#fff' : '#652f8d' }}>
            {abierto ? 'Cerrar' : 'Gestionar'}{ajustados > 0 ? ` · ${ajustados} ajuste${ajustados > 1 ? 's' : ''}` : ''}
          </button>
        </td>
      </tr>
      {abierto && (
        <tr>
          <td colSpan={6} style={{ padding: '14px 18px 16px', background: '#faf7fd' }}>

            <div style={{ marginBottom: '14px', paddingBottom: '12px', borderBottom: '1px solid #ece4f5' }}>
              <div style={{ fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>Prueba y plan</div>
              {enPrueba ? (
                <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap', alignItems: 'center' }}>
                  <span style={{ fontSize: '12px', color: '#6b5e7b', marginRight: '4px' }}>
                    {st.estado === 'vencida' ? 'La prueba venció: el cliente está en solo lectura.' : `Prueba de ${DIAS_PRUEBA} días con todos los módulos.`}
                  </span>
                  <button onClick={onExtender} disabled={guardando === c.id + ':extender'} style={btn({})}>
                    Extender {DIAS_PRUEBA} días
                  </button>
                  <button onClick={() => onPasarAPlan('standard')} disabled={guardando === c.id + ':convertir'} style={btn({})}>
                    Pasar a Standard
                  </button>
                  <button onClick={() => onPasarAPlan('premium')} disabled={guardando === c.id + ':convertir'} style={btn({})}>
                    Pasar a Premium
                  </button>
                </div>
              ) : (
                <span style={{ fontSize: '12px', color: '#6b5e7b' }}>Plan pagado: {NOMBRE_PLAN[c.plan || ''] || 'sin plan'}. No está en prueba.</span>
              )}
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '10px', flexWrap: 'wrap', gap: '8px' }}>
              <div style={{ fontSize: '12px', color: '#6b5e7b' }}>
                {enPrueba
                  ? 'Durante la prueba todos los módulos están activos. Para ajustarlos, primero pasá la sede a un plan.'
                  : `Activá o desactivá módulos para este cliente. Lo que no toques sigue el plan ${NOMBRE_PLAN[c.plan || ''] || ''}.`}
              </div>
              {ajustados > 0 && !enPrueba && (
                <button onClick={onReset} disabled={guardando === c.id + ':reset'} style={btn({ background: '#fff' })}>
                  Volver todo al plan
                </button>
              )}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: '8px 14px' }}>
              {MODULOS_PLAN.map(m => {
                const activo = c.modulos_activos.includes(m.id)
                const fijo = MODULOS_SIEMPRE.includes(m.id) || enPrueba
                const ajustado = c.modulos_override && c.modulos_override[m.id] !== undefined
                const cargando = guardando === c.id + ':' + m.id
                return (
                  <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1a1020', cursor: fijo ? 'default' : 'pointer', opacity: cargando ? 0.5 : 1 }}>
                    <input type="checkbox" checked={activo} disabled={fijo || cargando} onChange={() => onToggle(m.id)} />
                    <span style={{ flex: 1 }}>{m.label}</span>
                    {ajustado && !enPrueba && <span style={{ fontSize: '10px', fontWeight: 700, color: '#b45309', background: '#fef3cd', padding: '1px 6px', borderRadius: '6px' }}>AJUSTADO</span>}
                    {MODULOS_SIEMPRE.includes(m.id) && <span style={{ fontSize: '10px', color: '#9b8eaa' }}>siempre</span>}
                  </label>
                )
              })}
            </div>
          </td>
        </tr>
      )}
    </>
  )
}
