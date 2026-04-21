'use client'

import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'

export default function Actividad() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [buscar, setBuscar] = useState('')
  const [filtroAccion, setFiltroAccion] = useState('')
  const [filtroModulo, setFiltroModulo] = useState('')
  const [fechaDesde, setFechaDesde] = useState(() => {
    const d = new Date()
    d.setDate(d.getDate() - 1)
    return d.toISOString().split('T')[0]
  })
  const [fechaHasta, setFechaHasta] = useState(() => new Date().toISOString().split('T')[0])

  const cargar = async () => {
    setLoading(true)
    try {
      const params = new URLSearchParams()
      if (fechaDesde) params.set('desde', fechaDesde)
      if (fechaHasta) params.set('hasta', fechaHasta)
      const { apiHeaders } = await import('@/lib/hooks')
      const res = await fetch(`/api/activity?${params.toString()}`, { headers: apiHeaders() })
      const json = await res.json()
      if (json.data) setLogs(json.data)
    } catch (e) {
      console.error('[Actividad]', e)
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => { cargar() }, [fechaDesde, fechaHasta])

  const logsFiltrados = logs.filter(l => {
    const matchBuscar = !buscar || l.usuario_nombre?.toLowerCase().includes(buscar.toLowerCase())
    const matchAccion = !filtroAccion || l.accion === filtroAccion
    const matchModulo = !filtroModulo || l.modulo === filtroModulo
    return matchBuscar && matchAccion && matchModulo
  })

  const acciones = [...new Set(logs.map(l => l.accion).filter(Boolean))]
  const modulos = [...new Set(logs.map(l => l.modulo).filter(Boolean))]

  const IS = {
    padding: '9px 12px', border: '1.5px solid var(--border)',
    borderRadius: '10px', fontSize: '13px', outline: 'none',
    color: 'var(--text)', background: 'var(--white)', width: '100%',
    fontFamily: 'Inter, sans-serif'
  } as const

  const fmtFecha = (ts: string) => {
    if (!ts) return '—'
    const d = new Date(ts)
    return d.toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit' }) +
      ' · ' + d.toLocaleDateString('es-AR', { day: 'numeric', month: 'short' })
  }

  const colorModulo: Record<string, string> = {
    Alumnos: '#652f8d', Cursos: '#1a73e8', Pagos: '#2d7a4f',
    Profesoras: '#b45309', Agenda: '#c0392b', Horarios: '#7d3c98',
  }

  return (
    <div className="fade-in">
      <div style={{ marginBottom: '8px', fontSize: '11px', color: 'var(--text3)', fontWeight: 500 }}>
        Solo visible para vos
      </div>
      <div style={{ fontSize: '20px', fontWeight: 700, marginBottom: '16px' }}>
        Actividad del sistema
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '16px', padding: '16px', marginBottom: '14px' }}>
        <div style={{ display: 'flex', gap: '8px', marginBottom: '10px' }}>
          <input
            style={{ ...IS, flex: 1 }}
            placeholder="🔍 Buscar usuario..."
            value={buscar}
            onChange={e => setBuscar(e.target.value)}
          />
          <button
            onClick={() => { setBuscar(''); setFiltroAccion(''); setFiltroModulo('') }}
            style={{ padding: '9px 14px', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: '10px', fontSize: '13px', color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
            Limpiar
          </button>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px', marginBottom: '8px' }}>
          <select style={IS} value={filtroAccion} onChange={e => setFiltroAccion(e.target.value)}>
            <option value="">Todas las acciones</option>
            {acciones.map(a => <option key={a}>{a}</option>)}
          </select>
          <select style={IS} value={filtroModulo} onChange={e => setFiltroModulo(e.target.value)}>
            <option value="">Todos los módulos</option>
            {modulos.map(m => <option key={m}>{m}</option>)}
          </select>
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '3px' }}>Desde</div>
            <input type="date" style={IS} value={fechaDesde} onChange={e => setFechaDesde(e.target.value)} />
          </div>
          <div>
            <div style={{ fontSize: '10px', color: 'var(--text3)', fontWeight: 600, textTransform: 'uppercase', marginBottom: '3px' }}>Hasta</div>
            <input type="date" style={IS} value={fechaHasta} onChange={e => setFechaHasta(e.target.value)} />
          </div>
        </div>
      </div>

      {/* Resultados */}
      <div style={{ fontSize: '11px', color: 'var(--text3)', marginBottom: '8px', fontWeight: 500 }}>
        {loading ? 'Cargando...' : `${logsFiltrados.length} registros encontrados`}
      </div>

      <div style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '16px', overflow: 'hidden' }}>
        {loading ? (
          [...Array(5)].map((_, i) => (
            <div key={i} style={{ padding: '14px 16px', borderBottom: '1px solid var(--border)' }}>
              <div style={{ height: '14px', background: 'var(--border)', borderRadius: '6px', width: `${60 + i * 8}%`, marginBottom: '6px', opacity: 0.5 }} />
              <div style={{ height: '11px', background: 'var(--border)', borderRadius: '6px', width: '40%', opacity: 0.3 }} />
            </div>
          ))
        ) : logsFiltrados.length === 0 ? (
          <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
            No hay registros para mostrar
          </div>
        ) : logsFiltrados.map((l, i) => (
          <div key={l.id || i} style={{ padding: '12px 16px', borderBottom: i < logsFiltrados.length - 1 ? '1px solid var(--border)' : 'none', display: 'flex', alignItems: 'flex-start', gap: '12px' }}>
            {/* Avatar */}
            <div style={{ width: '34px', height: '34px', borderRadius: '10px', background: 'var(--vl)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: 'var(--v)', flexShrink: 0 }}>
              {(l.usuario_nombre || 'U').charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '6px', flexWrap: 'wrap' }}>
                <span style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>{l.usuario_nombre || 'Sistema'}</span>
                <span style={{ fontSize: '12px', color: 'var(--text2)' }}>{l.accion}</span>
                {l.modulo && (
                  <span style={{ padding: '2px 7px', borderRadius: '6px', fontSize: '10px', fontWeight: 700, background: (colorModulo[l.modulo] || '#652f8d') + '18', color: colorModulo[l.modulo] || '#652f8d' }}>
                    {l.modulo}
                  </span>
                )}
              </div>
              {l.detalle && (
                <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                  {l.detalle}
                </div>
              )}
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', flexShrink: 0, textAlign: 'right' }}>
              {fmtFecha(l.created_at)}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
