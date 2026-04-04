'use client'

import { useState, useEffect, useCallback } from 'react'
import { createClient } from '@/lib/supabase'

const supabase = createClient()

const ACTION_CONFIG: Record<string, { label: string; bg: string; color: string }> = {
  login:  { label: 'Sesión',    bg: '#e6f4ec', color: '#2d7a4f' },
  create: { label: 'Alta',      bg: '#E0F0F7', color: '#1a6b8a' },
  edit:   { label: 'Edición',   bg: '#FEF3CD', color: '#b45309' },
  delete: { label: 'Baja',      bg: '#fde8e8', color: '#c0392b' },
}

const MODULE_LABELS: Record<string, string> = {
  alumnos:  'Alumnos',
  cursos:   'Cursos',
  pagos:    'Pagos',
  docentes: 'Docentes',
  agenda:   'Agenda',
  sistema:  'Sistema',
}

const POR_PAGINA = 20

export default function Actividad() {
  const [logs, setLogs] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [selectedLog, setSelectedLog] = useState<any>(null)
  const [total, setTotal] = useState(0)
  const [pagina, setPagina] = useState(1)

  const [filtroUsuario, setFiltroUsuario] = useState('')
  const [filtroAccion, setFiltroAccion]   = useState('')
  const [filtroModulo, setFiltroModulo]   = useState('')
  const [filtroDesde, setFiltroDesde]     = useState('')
  const [filtroHasta, setFiltroHasta]     = useState('')

  const fetchLogs = useCallback(async () => {
    setLoading(true)
    let query = supabase
      .from('activity_log')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((pagina - 1) * POR_PAGINA, pagina * POR_PAGINA - 1)

    if (filtroUsuario) query = query.ilike('user_name', `%${filtroUsuario}%`)
    if (filtroAccion)  query = query.eq('action', filtroAccion)
    if (filtroModulo)  query = query.eq('module', filtroModulo)
    if (filtroDesde)   query = query.gte('created_at', filtroDesde)
    if (filtroHasta)   query = query.lte('created_at', filtroHasta + 'T23:59:59')

    const { data, count } = await query
    setLogs(data || [])
    setTotal(count || 0)
    setLoading(false)
  }, [pagina, filtroUsuario, filtroAccion, filtroModulo, filtroDesde, filtroHasta])

  useEffect(() => { fetchLogs() }, [fetchLogs])

  const totalPaginas = Math.ceil(total / POR_PAGINA)

  const resetFiltros = () => {
    setFiltroUsuario('')
    setFiltroAccion('')
    setFiltroModulo('')
    setFiltroDesde('')
    setFiltroHasta('')
    setPagina(1)
  }

  const hayFiltros = filtroUsuario || filtroAccion || filtroModulo || filtroDesde || filtroHasta

  return (
    <div className="fade-in">
      {/* Header */}
      <div style={{ marginBottom: '20px' }}>
        <div style={{ fontSize: '13px', color: 'var(--text2)', fontWeight: 500 }}>Solo visible para vos</div>
        <div style={{ fontSize: '22px', fontWeight: 700, letterSpacing: '-.3px', marginTop: '2px' }}>
          Actividad del sistema
        </div>
      </div>

      {/* Filtros */}
      <div style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '16px', padding: '14px', marginBottom: '14px', display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <div style={{ display: 'flex', gap: '8px' }}>
          <input
            type="text"
            placeholder="🔍 Buscar usuario..."
            value={filtroUsuario}
            onChange={e => { setFiltroUsuario(e.target.value); setPagina(1) }}
            style={{ flex: 1, border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
          />
          {hayFiltros && (
            <button onClick={resetFiltros} style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '12px', background: 'var(--bg)', color: 'var(--text2)', cursor: 'pointer', whiteSpace: 'nowrap' }}>
              Limpiar
            </button>
          )}
        </div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '8px' }}>
          <select
            value={filtroAccion}
            onChange={e => { setFiltroAccion(e.target.value); setPagina(1) }}
            style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
          >
            <option value="">Todas las acciones</option>
            <option value="login">Inicio de sesión</option>
            <option value="create">Alta</option>
            <option value="edit">Edición</option>
            <option value="delete">Baja / Eliminación</option>
          </select>
          <select
            value={filtroModulo}
            onChange={e => { setFiltroModulo(e.target.value); setPagina(1) }}
            style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
          >
            <option value="">Todos los módulos</option>
            {Object.entries(MODULE_LABELS).map(([k, v]) => (
              <option key={k} value={k}>{v}</option>
            ))}
          </select>
          <input
            type="date"
            value={filtroDesde}
            onChange={e => { setFiltroDesde(e.target.value); setPagina(1) }}
            style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
          />
          <input
            type="date"
            value={filtroHasta}
            onChange={e => { setFiltroHasta(e.target.value); setPagina(1) }}
            style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 12px', fontSize: '13px', background: 'var(--bg)', color: 'var(--text)', outline: 'none' }}
          />
        </div>
      </div>

      {/* Contador */}
      {!loading && (
        <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '10px', fontWeight: 500 }}>
          {total} registro{total !== 1 ? 's' : ''} encontrado{total !== 1 ? 's' : ''}
        </div>
      )}

      {/* Lista */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginBottom: '16px' }}>
        {loading ? (
          Array.from({ length: 5 }).map((_, i) => (
            <div key={i} style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '14px', padding: '14px', opacity: 0.5 }}>
              <div style={{ height: '13px', background: 'var(--border)', borderRadius: '6px', width: '60%', marginBottom: '8px' }} />
              <div style={{ height: '11px', background: 'var(--border)', borderRadius: '6px', width: '40%' }} />
            </div>
          ))
        ) : logs.length === 0 ? (
          <div style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '14px', padding: '40px 20px', textAlign: 'center', color: 'var(--text3)' }}>
            No hay registros para mostrar
          </div>
        ) : logs.map(log => {
          const ac = ACTION_CONFIG[log.action] ?? ACTION_CONFIG.edit
          const tieneDetalle = log.before || log.after
          return (
            <div
              key={log.id}
              onClick={() => tieneDetalle && setSelectedLog(log)}
              style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '14px', padding: '13px 14px', cursor: tieneDetalle ? 'pointer' : 'default', display: 'flex', alignItems: 'flex-start', gap: '12px' }}
            >
              <div style={{ width: 38, height: 38, borderRadius: 12, background: ac.bg, display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
                <span style={{ fontSize: '10px', fontWeight: 700, color: ac.color, textTransform: 'uppercase' }}>
                  {ac.label.slice(0, 3)}
                </span>
              </div>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: '13.5px', fontWeight: 600, marginBottom: '3px' }}>{log.description}</div>
                <div style={{ fontSize: '11.5px', color: 'var(--text2)', display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                  <span>{log.user_name}</span>
                  <span style={{ color: 'var(--text3)' }}>·</span>
                  <span>{MODULE_LABELS[log.module] || log.module}</span>
                  <span style={{ color: 'var(--text3)' }}>·</span>
                  <span>{new Date(log.created_at).toLocaleString('es-AR', { day: '2-digit', month: '2-digit', year: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                </div>
              </div>
              {tieneDetalle && (
                <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" style={{ flexShrink: 0, marginTop: '2px' }}>
                  <path d="M7 5l5 5-5 5" />
                </svg>
              )}
            </div>
          )
        })}
      </div>

      {/* Paginación */}
      {totalPaginas > 1 && (
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
          <button
            onClick={() => setPagina(p => Math.max(1, p - 1))}
            disabled={pagina === 1}
            style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', background: 'var(--white)', color: pagina === 1 ? 'var(--text3)' : 'var(--text)', cursor: pagina === 1 ? 'default' : 'pointer' }}
          >
            ← Anterior
          </button>
          <span style={{ fontSize: '12px', color: 'var(--text2)', fontWeight: 500 }}>
            {pagina} / {totalPaginas}
          </span>
          <button
            onClick={() => setPagina(p => Math.min(totalPaginas, p + 1))}
            disabled={pagina === totalPaginas}
            style={{ border: '1.5px solid var(--border)', borderRadius: '10px', padding: '8px 16px', fontSize: '13px', background: 'var(--white)', color: pagina === totalPaginas ? 'var(--text3)' : 'var(--text)', cursor: pagina === totalPaginas ? 'default' : 'pointer' }}
          >
            Siguiente →
          </button>
        </div>
      )}

      {/* Modal antes/después */}
      {selectedLog && (
        <div
          style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.45)', zIndex: 200, display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}
          onClick={() => setSelectedLog(null)}
        >
          <div
            style={{ background: 'var(--white)', borderRadius: '20px 20px 0 0', width: '100%', maxWidth: '600px', padding: '20px', maxHeight: '80vh', overflowY: 'auto' }}
            onClick={e => e.stopPropagation()}
          >
            <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 16px' }} />
            <div style={{ fontSize: '15px', fontWeight: 700, marginBottom: '4px' }}>{selectedLog.description}</div>
            <div style={{ fontSize: '12px', color: 'var(--text2)', marginBottom: '16px' }}>
              {selectedLog.user_name} · {new Date(selectedLog.created_at).toLocaleString('es-AR')}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: selectedLog.before && selectedLog.after ? '1fr 1fr' : '1fr', gap: '12px' }}>
              {selectedLog.before && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#c0392b', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>Antes</div>
                  <pre style={{ background: '#fde8e8', borderRadius: '12px', padding: '12px', fontSize: '11px', overflowX: 'auto', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                    {JSON.stringify(selectedLog.before, null, 2)}
                  </pre>
                </div>
              )}
              {selectedLog.after && (
                <div>
                  <div style={{ fontSize: '11px', fontWeight: 700, color: '#2d7a4f', textTransform: 'uppercase', letterSpacing: '.05em', marginBottom: '8px' }}>Después</div>
                  <pre style={{ background: '#e6f4ec', borderRadius: '12px', padding: '12px', fontSize: '11px', overflowX: 'auto', color: 'var(--text)', margin: 0, lineHeight: 1.5 }}>
                    {JSON.stringify(selectedLog.after, null, 2)}
                  </pre>
                </div>
              )}
            </div>
            <button
              onClick={() => setSelectedLog(null)}
              style={{ marginTop: '16px', width: '100%', padding: '12px', border: 'none', borderRadius: '12px', background: 'var(--vl)', color: 'var(--v)', fontSize: '14px', fontWeight: 600, cursor: 'pointer' }}
            >
              Cerrar
            </button>
          </div>
        </div>
      )}
    </div>
  )
}
