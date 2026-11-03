'use client'

// Tablero de clientes del panel admin: qué sedes tienen contratado el servicio,
// en qué plan, y cuántos alumnos activos tiene cada una. Solo lectura.
import { useEffect, useMemo, useState } from 'react'

type Cliente = {
  id: string
  nombre: string
  ciudad: string | null
  plan: string | null
  activo: boolean
  created_at: string
  alumnos_activos: number
}

const NOMBRE_PLAN: Record<string, string> = { standard: 'Standard', premium: 'Premium', basico: 'Básico' }

export default function TableroClientes({ clave, onVolver }: { clave: string; onVolver: () => void }) {
  const [clientes, setClientes] = useState<Cliente[]>([])
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')
  const [filtroPlan, setFiltroPlan] = useState<'todos' | 'standard' | 'premium'>('todos')

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

  const card = { background: '#fff', borderRadius: '14px', padding: '16px', border: '1px solid #e8e0f4' } as const
  const label = { fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase' as const, letterSpacing: '.05em' }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f0fa', padding: '24px 16px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

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

        {/* Resumen */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: '12px', marginBottom: '16px' }}>
          <div style={card}>
            <div style={label}>Clientes</div>
            <div style={{ fontSize: '28px', fontWeight: 800, color: '#1a1020' }}>{clientes.length}</div>
            <div style={{ fontSize: '12px', color: '#9b8eaa' }}>{activos} activos</div>
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

        {/* Filtro por plan */}
        <div style={{ display: 'flex', gap: '6px', marginBottom: '12px', flexWrap: 'wrap' }}>
          {(['todos', 'standard', 'premium'] as const).map(p => (
            <button key={p} onClick={() => setFiltroPlan(p)}
              style={{ padding: '6px 14px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer',
                border: '1.5px solid #e0d8f0', background: filtroPlan === p ? '#652f8d' : '#fff', color: filtroPlan === p ? '#fff' : '#652f8d' }}>
              {p === 'todos' ? 'Todos' : NOMBRE_PLAN[p]}
            </button>
          ))}
        </div>

        {/* Tabla */}
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
                    {['Instituto', 'Ciudad', 'Plan', 'Estado', 'Alumnos activos'].map((h, i) => (
                      <th key={h} style={{ padding: '10px 14px', fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase', letterSpacing: '.05em', textAlign: i === 4 ? 'right' : 'left' }}>{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibles.map(c => (
                    <tr key={c.id} style={{ borderTop: '1px solid #f0eaf8' }}>
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
                      </td>
                      <td style={{ padding: '11px 14px', textAlign: 'right', fontWeight: 700, color: '#1a1020' }}>
                        {c.alumnos_activos.toLocaleString('es-AR')}
                      </td>
                    </tr>
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
