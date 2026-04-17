'use client'
import { createContext, useContext, useState, useCallback, useRef, useEffect } from 'react'

type ToastType = 'success' | 'error' | 'info' | 'warning'

interface ToastItem {
  id: string
  message: string
  type: ToastType
}

interface ToastCtx {
  toast: (msg: string, type?: ToastType) => void
  success: (msg: string) => void
  error: (msg: string) => void
  info: (msg: string) => void
}

const Ctx = createContext<ToastCtx>({ toast: () => {}, success: () => {}, error: () => {}, info: () => {} })

export function useToast() { return useContext(Ctx) }

const ICONS: Record<ToastType, string> = {
  success: '✓',
  error:   '✕',
  info:    'ℹ',
  warning: '⚠',
}
const COLORS: Record<ToastType, { bg: string; border: string; color: string }> = {
  success: { bg: 'var(--greenl)', border: '#a3e0bc', color: 'var(--green)' },
  error:   { bg: 'var(--redl)',   border: '#f5c5c5', color: 'var(--red)'   },
  info:    { bg: '#e0f0f7',       border: '#b0d8ec', color: '#1a6b8a'      },
  warning: { bg: 'var(--amberl)', border: '#e8d080', color: 'var(--amber)' },
}

export function ToastProvider({ children }: { children: React.ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([])
  const timers = useRef<Record<string, ReturnType<typeof setTimeout>>>({})

  const remove = useCallback((id: string) => {
    setItems(prev => prev.filter(t => t.id !== id))
    clearTimeout(timers.current[id])
    delete timers.current[id]
  }, [])

  const toast = useCallback((message: string, type: ToastType = 'success') => {
    const id = Math.random().toString(36).slice(2)
    setItems(prev => [...prev.slice(-3), { id, message, type }])
    timers.current[id] = setTimeout(() => remove(id), 3000)
  }, [remove])

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d?.message) toast(d.message, d.type || 'success')
    }
    window.addEventListener('app-toast', handler)
    return () => window.removeEventListener('app-toast', handler)
  }, [toast])

  const ctx: ToastCtx = {
    toast,
    success: (msg) => toast(msg, 'success'),
    error:   (msg) => toast(msg, 'error'),
    info:    (msg) => toast(msg, 'info'),
  }

  return (
    <Ctx.Provider value={ctx}>
      {children}
      {items.length > 0 && (
        <div style={{
          position: 'fixed', bottom: '72px', left: '50%', transform: 'translateX(-50%)',
          display: 'flex', flexDirection: 'column', gap: '8px',
          zIndex: 9999, pointerEvents: 'none', width: 'calc(100% - 32px)', maxWidth: '400px',
        }}>
          {items.map(t => {
            const c = COLORS[t.type]
            return (
              <div key={t.id} style={{
                display: 'flex', alignItems: 'center', gap: '10px',
                padding: '12px 16px',
                background: c.bg, border: `1.5px solid ${c.border}`,
                borderRadius: '14px', fontSize: '13.5px', fontWeight: 600,
                color: c.color, pointerEvents: 'auto',
                boxShadow: '0 4px 20px rgba(0,0,0,.10)',
                animation: 'slideUp .2s ease',
              }}>
                <span style={{ fontSize: '16px', flexShrink: 0 }}>{ICONS[t.type]}</span>
                <span style={{ flex: 1 }}>{t.message}</span>
                <button
                  onClick={() => remove(t.id)}
                  style={{ background: 'none', border: 'none', cursor: 'pointer', color: c.color, fontSize: '16px', lineHeight: 1, padding: '0 0 0 4px', flexShrink: 0 }}
                >×</button>
              </div>
            )
          })}
        </div>
      )}
      <style>{`@keyframes slideUp { from { opacity:0; transform:translateY(8px) } to { opacity:1; transform:translateY(0) } }`}</style>
    </Ctx.Provider>
  )
}

// Helper global sin hook — para usar desde módulos que no pueden usar contexto
export function showToast(message: string, type: ToastType = 'success') {
  window.dispatchEvent(new CustomEvent('app-toast', { detail: { message, type } }))
}
