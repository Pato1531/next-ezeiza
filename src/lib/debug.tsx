// ─────────────────────────────────────────────────────────────────────────────
// DEBUG SYSTEM — Next Ezeiza
// Archivo: src/lib/debug.tsx
//
// Sistema de debugging visual para producción sin DevTools.
// Intercepta errores de React, window, y hooks, y los muestra en pantalla.
//
// USO:
//   1. Envolver la app con <ErrorBoundary> en layout.tsx
//   2. Importar { devLog } en hooks que querés monitorear
//   3. Eliminar este archivo cuando el bug esté resuelto
// ─────────────────────────────────────────────────────────────────────────────

'use client'

import { Component, type ReactNode, useEffect, useState, useCallback } from 'react'

// ── Log store global (fuera de React para que persista entre renders) ─────────
type LogEntry = { time: string; level: 'error' | 'warn' | 'info'; msg: string }
const logStore: LogEntry[] = []
const logListeners: Set<() => void> = new Set()

function addLog(level: LogEntry['level'], msg: string) {
  const time = new Date().toLocaleTimeString('es-AR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
  logStore.unshift({ time, level, msg: String(msg).slice(0, 300) })
  if (logStore.length > 50) logStore.pop()
  logListeners.forEach(fn => fn())
}

// ── API pública ───────────────────────────────────────────────────────────────
export function devLog(msg: string) { addLog('info', msg) }
export function devWarn(msg: string) { addLog('warn', msg) }
export function devError(msg: string) { addLog('error', msg) }

// ── ErrorBoundary ─────────────────────────────────────────────────────────────
interface EBState { error: Error | null }

export class ErrorBoundary extends Component<{ children: ReactNode }, EBState> {
  state: EBState = { error: null }

  static getDerivedStateFromError(error: Error): EBState {
    addLog('error', `[React] ${error.message}`)
    return { error }
  }

  componentDidCatch(error: Error) {
    addLog('error', `[React stack] ${error.stack?.slice(0, 400) ?? 'sin stack'}`)
  }

  render() {
    if (!this.state.error) return this.props.children

    const e = this.state.error
    return (
      <div style={{
        position: 'fixed', inset: 0, background: '#1a0a0a', color: '#ff6b6b',
        padding: '24px', overflowY: 'auto', zIndex: 99999, fontFamily: 'monospace',
      }}>
        <div style={{ fontSize: '18px', fontWeight: 700, marginBottom: '12px' }}>
          💥 Error de renderizado
        </div>
        <div style={{
          background: '#2a0a0a', borderRadius: '8px', padding: '16px',
          marginBottom: '16px', fontSize: '14px', lineHeight: 1.5,
        }}>
          <strong>{e.name}:</strong> {e.message}
        </div>
        {e.stack && (
          <pre style={{
            background: '#111', color: '#aaa', padding: '16px', borderRadius: '8px',
            fontSize: '11px', lineHeight: 1.6, whiteSpace: 'pre-wrap', wordBreak: 'break-all',
          }}>
            {e.stack}
          </pre>
        )}
        <button
          onClick={() => this.setState({ error: null })}
          style={{
            marginTop: '16px', padding: '12px 24px', background: '#652f8d',
            color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px',
            fontWeight: 600, cursor: 'pointer',
          }}
        >
          Reintentar
        </button>
      </div>
    )
  }
}

// ── Panel visual de logs ──────────────────────────────────────────────────────
export function DebugPanel() {
  const [logs, setLogs] = useState<LogEntry[]>([...logStore])
  const [open, setOpen] = useState(false)
  const [mounted, setMounted] = useState(false)

  const refresh = useCallback(() => setLogs([...logStore]), [])

  useEffect(() => {
    setMounted(true)
    logListeners.add(refresh)

    // Interceptar errores globales de JS
    const prevOnerror = window.onerror
    window.onerror = (msg, src, line, col, err) => {
      addLog('error', `[window] ${msg} (${src?.split('/').pop()}:${line})`)
      return prevOnerror ? (prevOnerror as any)(msg, src, line, col, err) : false
    }

    // Interceptar promesas rechazadas sin catch
    const handleUnhandled = (e: PromiseRejectionEvent) => {
      const msg = e.reason?.message ?? String(e.reason) ?? 'Promise rejection sin mensaje'
      addLog('error', `[unhandled] ${msg}`)
    }
    window.addEventListener('unhandledrejection', handleUnhandled)

    return () => {
      logListeners.delete(refresh)
      window.onerror = prevOnerror
      window.removeEventListener('unhandledrejection', handleUnhandled)
    }
  }, [refresh])

  if (!mounted) return null

  const errorCount = logs.filter(l => l.level === 'error').length

  return (
    <>
      {/* Botón flotante */}
      <button
        onClick={() => setOpen(o => !o)}
        style={{
          position: 'fixed', bottom: '72px', right: '12px', zIndex: 9999,
          width: '44px', height: '44px', borderRadius: '22px',
          background: errorCount > 0 ? '#c0392b' : '#652f8d',
          color: '#fff', border: 'none', cursor: 'pointer',
          fontSize: '18px', display: 'flex', alignItems: 'center',
          justifyContent: 'center', boxShadow: '0 2px 12px rgba(0,0,0,.4)',
        }}
      >
        {errorCount > 0 ? `${errorCount}` : '🐛'}
      </button>

      {/* Panel */}
      {open && (
        <div style={{
          position: 'fixed', bottom: '120px', left: '8px', right: '8px',
          maxHeight: '60vh', background: '#0d0d0d', border: '1px solid #333',
          borderRadius: '12px', zIndex: 9998, overflowY: 'auto',
          boxShadow: '0 4px 24px rgba(0,0,0,.6)', fontFamily: 'monospace',
        }}>
          {/* Header */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '10px 14px', borderBottom: '1px solid #222',
            position: 'sticky', top: 0, background: '#0d0d0d',
          }}>
            <span style={{ color: '#aaa', fontSize: '12px', fontWeight: 700 }}>
              🐛 DEBUG — {logs.length} entradas
            </span>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button
                onClick={() => { logStore.length = 0; refresh() }}
                style={{ padding: '4px 10px', background: '#333', color: '#aaa', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
              >
                Limpiar
              </button>
              <button
                onClick={() => setOpen(false)}
                style={{ padding: '4px 10px', background: '#333', color: '#aaa', border: 'none', borderRadius: '6px', fontSize: '11px', cursor: 'pointer' }}
              >
                Cerrar
              </button>
            </div>
          </div>

          {/* Entradas */}
          {logs.length === 0 && (
            <div style={{ padding: '16px', color: '#555', fontSize: '12px', textAlign: 'center' }}>
              Sin logs aún
            </div>
          )}
          {logs.map((entry, i) => (
            <div
              key={i}
              style={{
                padding: '8px 14px',
                borderBottom: '1px solid #1a1a1a',
                fontSize: '11px',
                lineHeight: 1.5,
                color: entry.level === 'error' ? '#ff6b6b' : entry.level === 'warn' ? '#f0c040' : '#7ec8a4',
              }}
            >
              <span style={{ color: '#555', marginRight: '8px' }}>{entry.time}</span>
              <span style={{ wordBreak: 'break-all' }}>{entry.msg}</span>
            </div>
          ))}
        </div>
      )}
    </>
  )
}
