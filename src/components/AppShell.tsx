'use client'

import React, { useState, useEffect, lazy, Suspense } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useComunicados } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'
import { ToastProvider, showToast } from './Toast'
import Dashboard from './pages/Dashboard'
import Alumnos from './pages/Alumnos'
const Pagos = lazy(() => import('./pages/Pagos'))
import Cursos from './pages/Cursos'
import Horarios from './pages/Horarios'
import Profesoras from './pages/Profesoras'
import Reportes from './pages/Reportes'
import Agenda from './pages/Agenda'
import Permisos from './pages/Permisos'
import Perfil from './pages/Perfil'
import Comunicados from './pages/Comunicados'

const Actividad = lazy(() => import('./pages/Actividad').catch(() => ({ default: () => <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Módulo no disponible</div> })))
const AtencionCliente = lazy(() => import('./pages/AtencionCliente').catch(() => ({ default: () => <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Módulo no disponible</div> })))
const DashboardEjecutivo = lazy(() => import('./pages/DashboardEjecutivo').catch(() => ({ default: () => <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Módulo no disponible</div> })))
const CuotasPorCurso = lazy(() => import('./pages/CuotasPorCurso').catch(() => ({ default: () => <div style={{padding:'40px',textAlign:'center',color:'var(--text3)'}}>Módulo no disponible</div> })))

const ALL_NAV = [
  { id: 'dashboard',   label: 'Inicio',       icon: 'M3 3h7v7H3zM13 3h7v7h-7zM3 13h7v7H3zM13 13h7v7h-7z' },
  { id: 'alumnos',     label: 'Alumnos',      icon: 'M10 3L18 7l-8 4-8-4 8-4zM6 11v4a6 3 0 008 0v-4' },
  { id: 'cursos',      label: 'Cursos',       icon: 'M3 3h14v14H3zM7 7h6M7 10h6M7 13h4' },
  { id: 'horarios',    label: 'Horarios',     icon: 'M2 3h16v14H2zM6 1v3M14 1v3M2 8h16' },
  { id: 'profesoras',  label: 'Colaboradores',     icon: 'M7 7a3 3 0 100-6 3 3 0 000 6zM1 18c0-3.3 2.7-6 6-6M15 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM12 18c0-2.5 2-4.5 5-4.5' },
  { id: 'reportes',    label: 'Reportes',     icon: 'M4 15l4-4 3 3 5-6M2 2h16v16H2z' },
  { id: 'permisos',    label: 'Permisos',     icon: 'M10 2a4 4 0 014 4v1h2a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4zM10 4a2 2 0 00-2 2v1h4V6a2 2 0 00-2-2z' },
  { id: 'agenda',      label: 'Agenda',       icon: 'M3 4h16v16H3zM16 2v4M8 2v4M3 10h16' },
  { id: 'pagos',       label: 'Pagos',        icon: 'M12 2H4a2 2 0 00-2 2v12a2 2 0 002 2h12a2 2 0 002-2V8l-6-6zM14 2v6h6M10 12v4M8 14h4' },
  { id: 'comunicados', label: 'Comunicados',  icon: 'M18 8a6 6 0 01-6 6H8l-4 4V8a6 6 0 016-6h2a6 6 0 016 6z' },
  { id: 'actividad',   label: 'Actividad',    icon: 'M10 3a7 7 0 100 14A7 7 0 0010 3zM10 7v3l2 2M3 3l14 14' },
  { id: 'atencion',    label: 'Atención',     icon: 'M18 8a6 6 0 01-6 6H8l-4 4V8a6 6 0 016-6h2a6 6 0 016 6zM9 10h.01M12 10h.01M15 10h.01' },
  { id: 'ejecutivo',   label: 'Cierre',       icon: 'M2 2h16v16H2zM6 10h4M6 14h8M10 2v4M6 6h2M12 6h2M4 15l4-4 3 3 5-6' },
  { id: 'cuotas',      label: 'Cuotas',       icon: 'M9 7h6M9 11h6M9 15h4M5 3h10a2 2 0 012 2v14a2 2 0 01-2 2H5a2 2 0 01-2-2V5a2 2 0 012-2z' },
]

const PAGES: Record<string, React.ComponentType> = {
  dashboard: Dashboard,
  alumnos: Alumnos,
  cursos: Cursos,
  horarios: Horarios,
  profesoras: Profesoras,
  reportes: Reportes,
  permisos: Permisos,
  perfil: Perfil,
  agenda: Agenda,
  comunicados: Comunicados,
  actividad: Actividad,
  atencion: AtencionCliente,
  ejecutivo: DashboardEjecutivo,
  cuotas: CuotasPorCurso,
  pagos: Pagos,
}

const PAGE_TITLES: Record<string, string> = {
  dashboard: 'Inicio', alumnos: 'Alumnos', cursos: 'Cursos',
  horarios: 'Horarios', profesoras: 'Colaboradores', reportes: 'Reportes',
  permisos: 'Permisos', perfil: 'Mi perfil', agenda: 'Agenda',
  comunicados: 'Comunicados', actividad: 'Actividad',
  atencion: 'Atención al Cliente', ejecutivo: 'Dashboard Ejecutivo', cuotas: 'Cuotas por Curso',
  pagos: 'Pagos',
}

const ROLE_LABELS: Record<string, string> = {
  director: 'Director', coordinadora: 'Coordinadora',
  secretaria: 'Secretaria', profesora: 'Profesora',
}
const ROLE_STYLES: Record<string, { bg: string; color: string }> = {
  director:     { bg: 'var(--vl)',    color: 'var(--v)'    },
  coordinadora: { bg: 'var(--bluel)', color: 'var(--blue)' },
  secretaria:   { bg: 'var(--bluel)', color: 'var(--blue)' },
  profesora:    { bg: '#f1eef8',      color: 'var(--text2)' },
}

class PanelErrorBoundary extends React.Component<
  { children: React.ReactNode; name: string },
  { error: Error | null }
> {
  constructor(props: any) { super(props); this.state = { error: null } }
  static getDerivedStateFromError(error: Error) { return { error } }
  componentDidCatch(error: Error) { console.error('[Panel Error]', this.props.name, error) }
  render() {
    if (this.state.error) {
      return (
        <div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
          Error en módulo {this.props.name}.{' '}
          <button
            onClick={() => this.setState({ error: null })}
            style={{ color: 'var(--v)', background: 'none', border: 'none', cursor: 'pointer', textDecoration: 'underline' }}
          >
            Reintentar
          </button>
        </div>
      )
    }
    return this.props.children
  }
}

// ── ConfirmDialog global ──────────────────────────────────────────────────────
// Uso desde cualquier módulo:
// window.dispatchEvent(new CustomEvent('confirm-action', {
//   detail: { mensaje: '¿Eliminar alumno?', detalle: 'Esta acción no se puede deshacer.', labelConfirm: 'Eliminar', onConfirm: () => { ... } }
// }))
interface ConfirmDialogProps {
  mensaje: string
  detalle?: string
  labelConfirm?: string
  onConfirm: () => void
  onClose: () => void
}
function ConfirmDialog({ mensaje, detalle, labelConfirm = 'Confirmar', onConfirm, onClose }: ConfirmDialogProps) {
  return (
    <div
      style={{ position: 'fixed', inset: 0, zIndex: 2000, background: 'rgba(20,0,40,.55)', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 20px' }}
      onClick={onClose}
    >
      <div
        style={{ background: 'var(--white)', borderRadius: '20px', padding: '28px 24px 24px', width: '100%', maxWidth: '360px', boxShadow: '0 8px 32px rgba(0,0,0,.18)' }}
        onClick={e => e.stopPropagation()}
      >
        <div style={{ fontSize: '17px', fontWeight: 700, color: 'var(--text)', marginBottom: detalle ? '8px' : '20px', lineHeight: 1.3 }}>
          {mensaje}
        </div>
        {detalle && (
          <div style={{ fontSize: '13px', color: 'var(--text2)', marginBottom: '20px', lineHeight: 1.5 }}>
            {detalle}
          </div>
        )}
        <div style={{ display: 'flex', gap: '10px' }}>
          <button
            onClick={onClose}
            style={{ flex: 1, padding: '12px', background: 'transparent', border: '1.5px solid var(--border)', borderRadius: '12px', fontSize: '14px', fontWeight: 600, cursor: 'pointer', color: 'var(--text2)' }}
          >
            Cancelar
          </button>
          <button
            onClick={() => { onConfirm(); onClose() }}
            style={{ flex: 1, padding: '12px', background: 'var(--red)', border: 'none', borderRadius: '12px', fontSize: '14px', fontWeight: 700, cursor: 'pointer', color: '#fff' }}
          >
            {labelConfirm}
          </button>
        </div>
      </div>
    </div>
  )
}

function NavEditor({ allAllowed, navOrdered, MAX_NAV, saveNavCustom, onClose }: any) {
  const [activeIds, setActiveIds] = React.useState<string[]>(
    () => navOrdered.slice(0, MAX_NAV).map((n: any) => n.id)
  )

  const toggleItem = (id: string) => {
    setActiveIds(prev => {
      const estaActivo = prev.includes(id)
      let next: string[]
      if (estaActivo) {
        if (prev.length <= 3) return prev
        next = prev.filter(i => i !== id)
      } else {
        next = prev.length < MAX_NAV
          ? [...prev, id]
          : [...prev.slice(0, MAX_NAV - 1), id]
      }
      const resto = allAllowed.map((n: any) => n.id).filter((i: string) => !next.includes(i))
      saveNavCustom([...next, ...resto])
      return next
    })
  }

  return (
    <div style={{ position:'fixed', inset:0, zIndex:200, background:'rgba(20,0,40,.45)', display:'flex', alignItems:'flex-end', justifyContent:'center' }} onClick={onClose}>
      <div style={{ background:'var(--white)', borderRadius:'24px 24px 0 0', padding:'24px 20px 36px', width:'100%', maxWidth:'480px', maxHeight:'85vh', overflowY:'auto' }} onClick={e => e.stopPropagation()}>
        <div style={{ width:'40px', height:'4px', background:'var(--border)', borderRadius:'2px', margin:'0 auto 16px' }} />
        <div style={{ fontSize:'16px', fontWeight:700, marginBottom:'4px' }}>Personalizar navegación</div>
        <div style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'6px' }}>
          Elegí hasta 5 módulos para la barra inferior.
        </div>
        <div style={{ fontSize:'12px', color:'var(--v)', fontWeight:600, marginBottom:'16px' }}>
          {activeIds.length}/5 seleccionados
        </div>

        <div style={{ fontSize:'11px', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px' }}>
          En la barra
        </div>
        <div style={{ display:'flex', flexWrap:'wrap', gap:'8px', marginBottom:'18px', minHeight:'40px' }}>
          {activeIds.length === 0 && (
            <div style={{ fontSize:'13px', color:'var(--text3)', fontStyle:'italic' }}>Sin módulos seleccionados</div>
          )}
          {allAllowed.filter((n: any) => activeIds.includes(n.id)).map((item: any) => (
            <button key={item.id} onClick={() => toggleItem(item.id)}
              style={{ display:'flex', alignItems:'center', gap:'6px', padding:'8px 14px', background:'var(--v)', color:'#fff', border:'none', borderRadius:'20px', fontSize:'13px', fontWeight:600, cursor:'pointer' }}>
              <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                {item.icon.split('M').filter(Boolean).map((d: string, i: number) => <path key={i} d={`M${d}`} />)}
              </svg>
              {item.label}
              <span style={{ opacity:.7, fontSize:'14px', lineHeight:1 }}>×</span>
            </button>
          ))}
        </div>

        <div style={{ fontSize:'11px', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.06em', marginBottom:'10px' }}>
          Disponibles
        </div>
        <div style={{ display:'flex', flexDirection:'column', gap:'6px' }}>
          {allAllowed.filter((n: any) => !activeIds.includes(n.id)).map((item: any) => (
            <button key={item.id} onClick={() => toggleItem(item.id)}
              disabled={activeIds.length >= MAX_NAV}
              style={{ display:'flex', alignItems:'center', gap:'12px', padding:'11px 14px', background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'12px', cursor: activeIds.length >= MAX_NAV ? 'not-allowed' : 'pointer', opacity: activeIds.length >= MAX_NAV ? 0.45 : 1, textAlign:'left' }}>
              <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {item.icon.split('M').filter(Boolean).map((d: string, i: number) => <path key={i} d={`M${d}`} />)}
              </svg>
              <span style={{ flex:1, fontSize:'14px', fontWeight:500, color:'var(--text)' }}>{item.label}</span>
              <span style={{ fontSize:'18px', color:'var(--text3)', lineHeight:1 }}>+</span>
            </button>
          ))}
        </div>

        <button onClick={() => { const allIds = allAllowed.map((n: any) => n.id); setActiveIds(allIds.slice(0, MAX_NAV)); saveNavCustom(allIds); onClose() }}
          style={{ width:'100%', marginTop:'16px', padding:'12px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'13px', fontWeight:600, cursor:'pointer', color:'var(--text2)' }}>
          Restablecer orden por defecto
        </button>
      </div>
    </div>
  )
}

export default function AppShell() {
  // ── instituto agregado al destructuring para leer el nombre desde DB ─────
  const { usuario, instituto, puedeVer } = useAuth()

  const [page, setPage] = useState<string>('dashboard')
  const [pageReady, setPageReady] = useState(false)

  const [masOpen, setMasOpen] = useState(false)
  const [mounted, setMounted] = useState<Set<string>>(new Set(['dashboard']))
  const [comunicadosBadge, setComunicadosBadge] = useState(0)
  const { comunicados } = useComunicados()
  const [vistosLocal, setVistosLocal] = useState<string[]>([])
  const [atencionBadge, setAtencionBadge] = useState(0)
  const [onboardingVisto, setOnboardingVisto] = useState<Set<string>>(new Set())
  const [showOnboarding, setShowOnboarding] = useState(false)
  const [onboardingStep, setOnboardingStep] = useState(0)
  const [onboardingChecks, setOnboardingChecks] = useState({ cursos: false, profesoras: false, alumnos: false, pagos: false })
  const [navCustom, setNavCustom] = useState<string[] | null>(null)
  const [navEditOpen, setNavEditOpen] = useState(false)
  const [busqGlobalOpen, setBusqGlobalOpen] = useState(false)
  const [busqGlobalQ, setBusqGlobalQ] = useState('')
  const [busqResultados, setBusqResultados] = useState<{tipo:string;id:string;titulo:string;sub:string;color?:string;nav:string}[]>([])
  const [busqLoading, setBusqLoading] = useState(false)
  const [confirmDialog, setConfirmDialog] = useState<{
    mensaje: string; detalle?: string; labelConfirm?: string; onConfirm: () => void
  } | null>(null)

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d?.nombre) showToast(`\u2713 Pago de ${d.nombre} registrado`)
      else showToast('\u2713 Pago registrado')
    }
    window.addEventListener('pago-registrado', handler)
    return () => window.removeEventListener('pago-registrado', handler)
  }, [])

  // Listener para navegación programática desde otros componentes
  // Uso: window.dispatchEvent(new CustomEvent('navigate-to', { detail: { page: 'profesoras' } }))
  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d?.page) {
        setPage(d.page)
        setMounted(prev => new Set([...prev, d.page]))
        setMasOpen(false)
        try { sessionStorage.setItem('nav_page', d.page) } catch {}
      }
    }
    window.addEventListener('navigate-to', handler)
    return () => window.removeEventListener('navigate-to', handler)
  }, [])

  useEffect(() => {
    const handler = (e: Event) => {
      const d = (e as CustomEvent).detail
      if (d?.mensaje && typeof d.onConfirm === 'function') {
        setConfirmDialog({ mensaje: d.mensaje, detalle: d.detalle, labelConfirm: d.labelConfirm, onConfirm: d.onConfirm })
      }
    }
    window.addEventListener('confirm-action', handler)
    return () => window.removeEventListener('confirm-action', handler)
  }, [])

  useEffect(() => {
    if (!busqGlobalQ.trim() || busqGlobalQ.length < 2) { setBusqResultados([]); return }
    const t = setTimeout(async () => {
      setBusqLoading(true)
      try {
        const sb = createClient()
        const q = busqGlobalQ.toLowerCase()
        const [alRes, curRes, profRes] = await Promise.all([
          sb.from('alumnos').select('id,nombre,apellido,nivel,color').eq('activo',true).ilike('apellido', `%${q}%`).limit(5),
          sb.from('cursos').select('id,nombre,nivel').limit(5),
          sb.from('profesoras').select('id,nombre,apellido,color').eq('activo',true).limit(3),
        ])
        const resultados: any[] = []
        ;(alRes.data||[]).filter((a:any) => `${a.nombre} ${a.apellido}`.toLowerCase().includes(q)).forEach((a:any) =>
          resultados.push({ tipo:'alumno', id:a.id, titulo:`${a.nombre} ${a.apellido}`, sub:a.nivel||'Alumno', color:a.color, nav:'alumnos' })
        )
        const alRes2 = await sb.from('alumnos').select('id,nombre,apellido,nivel,color').eq('activo',true).ilike('nombre', `%${q}%`).limit(5)
        ;(alRes2.data||[]).filter((a:any) => !resultados.some(r=>r.id===a.id)).forEach((a:any) =>
          resultados.push({ tipo:'alumno', id:a.id, titulo:`${a.nombre} ${a.apellido}`, sub:a.nivel||'Alumno', color:a.color, nav:'alumnos' })
        )
        ;(curRes.data||[]).filter((c:any) => c.nombre.toLowerCase().includes(q)).forEach((c:any) =>
          resultados.push({ tipo:'curso', id:c.id, titulo:c.nombre, sub:c.nivel||'Curso', nav:'cursos' })
        )
        ;(profRes.data||[]).filter((p:any) => `${p.nombre} ${p.apellido}`.toLowerCase().includes(q)).forEach((p:any) =>
          resultados.push({ tipo:'colaborador', id:p.id, titulo:`${p.nombre} ${p.apellido}`, sub:'Colaborador', color:p.color, nav:'profesoras' })
        )
        setBusqResultados(resultados.slice(0,8))
      } catch {}
      setBusqLoading(false)
    }, 280)
    return () => clearTimeout(t)
  }, [busqGlobalQ])

  useEffect(() => {
    if (!usuario) return
    try {
      const saved = sessionStorage.getItem('nav_page')
      if (saved && puedeVer(saved)) {
        setPage(saved)
        setMounted(new Set([saved]))
      } else {
        const perms = ['dashboard', 'alumnos', 'cursos', 'horarios', 'profesoras', 'reportes', 'permisos']
        const primera = perms.find(p => puedeVer(p)) ?? 'alumnos'
        setPage(primera)
        setMounted(new Set([primera]))
      }
    } catch {
      setPage('dashboard')
    }
    setPageReady(true)
  }, [usuario?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!usuario) return
    try {
      const saved = JSON.parse(localStorage.getItem(`comunicados_vistos_${usuario.id}`) || '[]')
      setVistosLocal(saved)
    } catch { setVistosLocal([]) }
  }, [usuario?.id])

  useEffect(() => {
    if (!usuario) return
    try {
      const saved = JSON.parse(localStorage.getItem(`nav_custom_${usuario.id}`) || 'null')
      if (Array.isArray(saved) && saved.length >= 3) setNavCustom(saved)
    } catch {}
  }, [usuario?.id])

  useEffect(() => {
    if (!usuario) return
    if (!['director', 'coordinadora', 'secretaria'].includes(usuario.rol)) return
    const sb = createClient()
    sb.from('lista_espera')
      .select('id', { count: 'exact', head: true })
      .eq('estado_seguimiento', 'nuevo')
      .then(({ count }) => setAtencionBadge(count || 0))
      .catch(() => {})
  }, [usuario?.id])

  useEffect(() => {
    if (!usuario) return
    try {
      const saved = JSON.parse(localStorage.getItem(`onboarding_${usuario.id}`) || '[]')
      setOnboardingVisto(new Set(saved))
    } catch {}
  }, [usuario?.id])

  // Detectar sede nueva: solo director, primera vez (clave no vista en localStorage)
  useEffect(() => {
    if (!usuario || usuario.rol !== 'director') return
    const key = `onboarding_completado_${usuario.instituto_id}`
    try {
      const visto = localStorage.getItem(key)
      if (!visto) setShowOnboarding(true)
    } catch {}
  }, [usuario?.id])

  useEffect(() => {
    if (!comunicados.length || !usuario) return
    const misComunicados = comunicados.filter(c => {
      if (c.rol_destino === 'todos') return true
      if (c.rol_destino === 'individual') {
        return Array.isArray(c.destinatarios_ids) &&
          c.destinatarios_ids.length > 0 &&
          c.destinatarios_ids.includes(usuario.id)
      }
      if (c.rol_destino === usuario.rol) return true
      if (c.rol_destino === 'coordinacion' && usuario.rol === 'coordinadora') return true
      return false
    })
    const noLeidos = misComunicados.filter(c => !vistosLocal.includes(c.id)).length
    setComunicadosBadge(noLeidos)
  }, [comunicados, vistosLocal, usuario?.id])

  const irAComunicados = () => {
    if (!usuario) return
    const misComunicados = comunicados.filter(c => {
      if (c.rol_destino === 'todos') return true
      if (c.rol_destino === 'individual') {
        return Array.isArray(c.destinatarios_ids) &&
          c.destinatarios_ids.length > 0 &&
          c.destinatarios_ids.includes(usuario.id)
      }
      if (c.rol_destino === usuario.rol) return true
      if (c.rol_destino === 'coordinacion' && usuario.rol === 'coordinadora') return true
      return false
    })
    const ids = misComunicados.map(c => c.id)
    try { localStorage.setItem(`comunicados_vistos_${usuario.id}`, JSON.stringify(ids)) } catch {}
    setVistosLocal(ids)
    setComunicadosBadge(0)
    setPage('comunicados')
    setMounted(prev => new Set([...prev, 'comunicados']))
    setMasOpen(false)
    try { sessionStorage.setItem('nav_page', 'comunicados') } catch {}
  }

  if (!usuario) return null
  if (!pageReady) return (
    <div style={{ minHeight: '100vh', background: 'var(--bg)' }} />
  )

  const allAllowed = ALL_NAV.filter(n => puedeVer(n.id))
  const MAX_NAV = 5
  const navOrdered = navCustom
    ? [...navCustom.filter(id => allAllowed.some(n => n.id === id)).map(id => allAllowed.find(n => n.id === id)!),
       ...allAllowed.filter(n => !navCustom.includes(n.id))]
    : allAllowed
  const navItems = navOrdered.slice(0, MAX_NAV)
  const masItems = navOrdered.slice(MAX_NAV)
  const hayMas = masItems.length > 0

  const saveNavCustom = (ids: string[]) => {
    setNavCustom(ids)
    try { localStorage.setItem(`nav_custom_${usuario?.id}`, JSON.stringify(ids)) } catch {}
  }

  const rs = ROLE_STYLES[usuario.rol] ?? ROLE_STYLES.profesora

  const navTo = (id: string) => {
    if (id === 'comunicados') { irAComunicados(); return }
    if (id === 'atencion') setAtencionBadge(0)
    setPage(id)
    setMounted(prev => new Set([...prev, id]))
    setMasOpen(false)
    try { sessionStorage.setItem('nav_page', id) } catch {}
    if (!onboardingVisto.has(id)) {
      const nuevo = new Set([...onboardingVisto, id])
      setOnboardingVisto(nuevo)
      try { localStorage.setItem(`onboarding_${usuario?.id}`, JSON.stringify([...nuevo])) } catch {}
    }
  }

  const cerrarOnboarding = () => {
    setShowOnboarding(false)
    try { localStorage.setItem(`onboarding_completado_${usuario?.instituto_id}`, '1') } catch {}
  }

  const pasoOnboarding = (page: string) => {
    navTo(page)
    setShowOnboarding(false)
    try { localStorage.setItem(`onboarding_completado_${usuario?.instituto_id}`, '1') } catch {}
  }

  const PASOS_ONBOARDING = [
    {
      id: 'cursos', icon: '📚', titulo: 'Crear tus cursos',
      desc: 'Agregá los cursos activos con su horario, nivel y profesora asignada.',
      page: 'cursos', label: 'Ir a Cursos'
    },
    {
      id: 'profesoras', icon: '👩‍🏫', titulo: 'Registrar colaboradores',
      desc: 'Cargá el equipo docente y administrativo en la sección Colaboradores.',
      page: 'profesoras', label: 'Ir a Colaboradores'
    },
    {
      id: 'alumnos', icon: '🎓', titulo: 'Cargar alumnos',
      desc: 'Ingresá los alumnos activos con su información de contacto y nivel.',
      page: 'alumnos', label: 'Ir a Alumnos'
    },
    {
      id: 'permisos', icon: '🔑', titulo: 'Dar accesos al equipo',
      desc: 'Creá usuarios para que profesoras y secretarias puedan ingresar a la app.',
      page: 'permisos', label: 'Ir a Permisos'
    },
  ]

  return (
    <ToastProvider>
    <div style={{ display: 'flex', flexDirection: 'column', minHeight: '100vh' }}>

      {/* ── MODAL ONBOARDING PRIMERA VEZ ─────────────────────────────────── */}
      {showOnboarding && usuario?.rol === 'director' && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.6)',zIndex:1000,display:'flex',alignItems:'flex-end',justifyContent:'center',padding:'0'}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 40px',width:'100%',maxWidth:'520px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 24px'}} />

            {/* Header */}
            <div style={{textAlign:'center',marginBottom:'28px'}}>
              <div style={{fontSize:'36px',marginBottom:'10px'}}>🎉</div>
              <div style={{fontSize:'20px',fontWeight:800,color:'var(--text)',marginBottom:'6px'}}>
                ¡Bienvenido a EduGest!
              </div>
              <div style={{fontSize:'13px',color:'var(--text3)',lineHeight:1.5,maxWidth:'360px',margin:'0 auto'}}>
                Tu sede está lista. Seguí estos pasos para configurarla y empezar a gestionar tu instituto.
              </div>
            </div>

            {/* Checklist de pasos */}
            <div style={{display:'flex',flexDirection:'column',gap:'10px',marginBottom:'24px'}}>
              {PASOS_ONBOARDING.map((paso, i) => (
                <div key={paso.id} style={{display:'flex',alignItems:'center',gap:'14px',padding:'14px 16px',background:'var(--bg)',borderRadius:'14px',border:'1.5px solid var(--border)'}}>
                  <div style={{fontSize:'24px',flexShrink:0}}>{paso.icon}</div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{fontSize:'14px',fontWeight:700,color:'var(--text)',marginBottom:'2px'}}>{paso.titulo}</div>
                    <div style={{fontSize:'12px',color:'var(--text3)',lineHeight:1.4}}>{paso.desc}</div>
                  </div>
                  <button
                    onClick={() => pasoOnboarding(paso.page)}
                    style={{padding:'7px 12px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'8px',fontSize:'11.5px',fontWeight:600,cursor:'pointer',flexShrink:0,whiteSpace:'nowrap'}}>
                    {paso.label}
                  </button>
                </div>
              ))}
            </div>

            {/* Footer */}
            <div style={{display:'flex',gap:'10px'}}>
              <button
                onClick={cerrarOnboarding}
                style={{flex:1,padding:'13px',background:'transparent',color:'var(--text3)',border:'1.5px solid var(--border)',borderRadius:'12px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
                Ya configuré todo
              </button>
              <button
                onClick={() => pasoOnboarding('cursos')}
                style={{flex:2,padding:'13px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:700,cursor:'pointer'}}>
                Empezar por Cursos →
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div style={{ background: 'var(--white)', borderBottom: '1px solid var(--border)', padding: '0 20px', height: '60px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', position: 'sticky', top: 0, zIndex: 40 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <div style={{ width: '36px', height: '36px', borderRadius: '10px', background: 'var(--v)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 }}>
            <svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
              <path d="M16 5L27 11v10L16 27 5 21V11L16 5z" />
              <path d="M16 5v22M5 11l11 10 11-10" />
            </svg>
          </div>
          {/* ── Nombre del instituto desde DB — dinámico para todas las sedes ── */}
          <div style={{ fontSize: '16px', fontWeight: 700, letterSpacing: '-.2px' }}>
            {(() => {
              const nombre = instituto?.nombre || 'EduGest'
              const partes = nombre.split(' ')
              const primera = partes[0]
              const resto = partes.slice(1).join(' ')
              return <><span style={{ color: 'var(--v)' }}>{primera}</span>{resto ? ' ' + resto : ''}</>
            })()}
          </div>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <button onClick={() => { setBusqGlobalOpen(true); setBusqGlobalQ(''); setBusqResultados([]) }}
            style={{ width:'32px', height:'32px', borderRadius:'10px', background:'var(--bg)', border:'1px solid var(--border)', color:'var(--text2)', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            <svg width="15" height="15" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
          </button>
          <div style={{ padding: '5px 12px', borderRadius: '20px', fontSize: '12px', fontWeight: 600, background: rs.bg, color: rs.color }}>
            {ROLE_LABELS[usuario.rol]}
          </div>
          <button onClick={() => setNavEditOpen(true)} title="Personalizar navegación" style={{ width:'32px', height:'32px', borderRadius:'10px', background:'var(--bg)', border:'1px solid var(--border)', color:'var(--text2)', fontSize:'16px', cursor:'pointer', display:'flex', alignItems:'center', justifyContent:'center' }}>
            ⚙
          </button>
          <button onClick={() => navTo('perfil')} style={{ width: '36px', height: '36px', borderRadius: '12px', background: usuario.color, border: 'none', color: '#fff', fontSize: '12px', fontWeight: 700, cursor: 'pointer' }}>
            {usuario.initials}
          </button>
        </div>
      </div>

      {/* CONTENT */}
      <div style={{ flex: 1, overflowY: 'auto', position: 'relative' }}>
        {mounted.has('dashboard')   && <div style={{ padding: '16px 16px 24px', display: page === 'dashboard'   ? 'block' : 'none' }}><PanelErrorBoundary name="Dashboard">  <Dashboard />         </PanelErrorBoundary></div>}
        {mounted.has('alumnos')     && <div style={{ padding: '16px 16px 24px', display: page === 'alumnos'     ? 'block' : 'none' }}><PanelErrorBoundary name="Alumnos">    <Alumnos />           </PanelErrorBoundary></div>}
        {mounted.has('cursos')      && <div style={{ padding: '16px 16px 24px', display: page === 'cursos'      ? 'block' : 'none' }}><PanelErrorBoundary name="Cursos">     <Cursos />            </PanelErrorBoundary></div>}
        {mounted.has('horarios')    && <div style={{ padding: '16px 16px 24px', display: page === 'horarios'    ? 'block' : 'none' }}><PanelErrorBoundary name="Horarios">   <Horarios />          </PanelErrorBoundary></div>}
        {mounted.has('profesoras')  && <div style={{ padding: '16px 16px 24px', display: page === 'profesoras'  ? 'block' : 'none' }}><PanelErrorBoundary name="Colaboradores"> <Profesoras />        </PanelErrorBoundary></div>}
        {mounted.has('reportes')    && <div style={{ padding: '16px 16px 24px', display: page === 'reportes'    ? 'block' : 'none' }}><PanelErrorBoundary name="Reportes">   <Reportes />          </PanelErrorBoundary></div>}
        {mounted.has('permisos')    && <div style={{ padding: '16px 16px 24px', display: page === 'permisos'    ? 'block' : 'none' }}><PanelErrorBoundary name="Permisos">   <Permisos />          </PanelErrorBoundary></div>}
        {mounted.has('perfil')      && <div style={{ padding: '16px 16px 24px', display: page === 'perfil'      ? 'block' : 'none' }}><PanelErrorBoundary name="Perfil">     <Perfil />            </PanelErrorBoundary></div>}
        {mounted.has('agenda')      && <div style={{ padding: '16px 16px 24px', display: page === 'agenda'      ? 'block' : 'none' }}><PanelErrorBoundary name="Agenda">     <Agenda />            </PanelErrorBoundary></div>}
        {mounted.has('comunicados') && <div style={{ padding: '16px 16px 24px', display: page === 'comunicados' ? 'block' : 'none' }}><PanelErrorBoundary name="Comunicados"><Comunicados />       </PanelErrorBoundary></div>}
        {mounted.has('actividad')   && <div style={{ padding: '16px 16px 24px', display: page === 'actividad'   ? 'block' : 'none' }}><Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Cargando...</div>}><Actividad /></Suspense></div>}
        {mounted.has('atencion')    && <div style={{ padding: '16px 16px 24px', display: page === 'atencion'    ? 'block' : 'none' }}><Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Cargando...</div>}><AtencionCliente /></Suspense></div>}
        {mounted.has('ejecutivo')   && <div style={{ padding: '16px 16px 24px', display: page === 'ejecutivo'   ? 'block' : 'none' }}><Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Cargando...</div>}><DashboardEjecutivo /></Suspense></div>}
        {mounted.has('cuotas')      && <div style={{ padding: '16px 16px 24px', display: page === 'cuotas'      ? 'block' : 'none' }}><Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Cargando...</div>}><CuotasPorCurso /></Suspense></div>}
        {mounted.has('pagos')       && <div style={{ padding: '16px 16px 24px', display: page === 'pagos'       ? 'block' : 'none' }}><Suspense fallback={<div style={{ padding: '40px', textAlign: 'center', color: 'var(--text3)' }}>Cargando...</div>}><Pagos /></Suspense></div>}
      </div>

      {/* DRAWER MÁS */}
      {masOpen && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 100 }} onClick={() => setMasOpen(false)}>
          <div style={{ position: 'absolute', bottom: '60px', left: 0, right: 0, background: 'var(--white)', borderTop: '1.5px solid var(--border)', borderRadius: '20px 20px 0 0', padding: '8px 0 4px', boxShadow: '0 -4px 20px rgba(0,0,0,.08)' }} onClick={e => e.stopPropagation()}>
            <div style={{ width: '40px', height: '4px', background: 'var(--border)', borderRadius: '2px', margin: '0 auto 12px' }} />
            {masItems.map(item => (
              <button key={item.id} onClick={() => navTo(item.id)} style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', padding: '14px 24px', border: 'none', background: page === item.id ? 'var(--vl)' : 'transparent', cursor: 'pointer', transition: 'background .15s' }}>
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke={page === item.id ? 'var(--v)' : 'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {item.icon.split('M').filter(Boolean).map((d, i) => <path key={i} d={`M${d}`} />)}
                </svg>
                <span style={{ fontSize: '15px', fontWeight: 600, color: page === item.id ? 'var(--v)' : 'var(--text)', flex: 1, textAlign: 'left' }}>{item.label}</span>
                {item.id === 'comunicados' && comunicadosBadge > 0 && (
                  <div style={{ minWidth: '20px', height: '20px', borderRadius: '10px', background: 'var(--red)', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{comunicadosBadge}</div>
                )}
                {item.id === 'atencion' && atencionBadge > 0 && (
                  <div style={{ minWidth: '20px', height: '20px', borderRadius: '10px', background: '#1a6b8a', color: '#fff', fontSize: '11px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 5px' }}>{atencionBadge}</div>
                )}
                {page === item.id && <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--v)' }} />}
              </button>
            ))}
            <button onClick={() => navTo('perfil')} style={{ display: 'flex', alignItems: 'center', gap: '14px', width: '100%', padding: '14px 24px', border: 'none', background: page === 'perfil' ? 'var(--vl)' : 'transparent', cursor: 'pointer', borderTop: '1px solid var(--border)', marginTop: '4px' }}>
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke={page === 'perfil' ? 'var(--v)' : 'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="7" r="4" /><path d="M2 18c0-3.3 3.6-6 8-6s8 2.7 8 6" />
              </svg>
              <span style={{ fontSize: '15px', fontWeight: 600, color: page === 'perfil' ? 'var(--v)' : 'var(--text)' }}>Mi perfil</span>
              {page === 'perfil' && <div style={{ marginLeft: 'auto', width: '8px', height: '8px', borderRadius: '50%', background: 'var(--v)' }} />}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav style={{ background: 'var(--white)', borderTop: '1px solid var(--border)', display: 'flex', alignItems: 'stretch', position: 'sticky', bottom: 0, zIndex: 50 }}>
        {navItems.map(item => {
          const badgeCount = item.id === 'comunicados' ? comunicadosBadge : item.id === 'atencion' ? atencionBadge : 0
          return (
            <button key={item.id} onClick={() => navTo(item.id)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px 12px', border: 'none', background: 'none', cursor: 'pointer', color: page === item.id ? 'var(--v)' : 'var(--text3)', gap: '4px', minHeight: '60px', transition: 'color .15s', position: 'relative' }}>
              {badgeCount > 0 && (
                <div style={{ position: 'absolute', top: '6px', right: 'calc(50% - 16px)', minWidth: '16px', height: '16px', borderRadius: '10px', background: item.id === 'atencion' ? '#1a6b8a' : 'var(--red)', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px', pointerEvents: 'none' }}>
                  {badgeCount}
                </div>
              )}
              {!onboardingVisto.has(item.id) && badgeCount === 0 && page !== item.id && (
                <div style={{ position: 'absolute', top: '8px', right: 'calc(50% - 12px)', width: '7px', height: '7px', borderRadius: '50%', background: 'var(--green)', pointerEvents: 'none' }} />
              )}
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                {item.icon.split('M').filter(Boolean).map((d, i) => <path key={i} d={`M${d}`} />)}
              </svg>
              <span style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1 }}>{item.label}</span>
            </button>
          )
        })}
        {hayMas && (
          <button onClick={() => setMasOpen(!masOpen)} style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '10px 4px 12px', border: 'none', background: 'none', cursor: 'pointer', color: masOpen || masItems.some(i => i.id === page) || page === 'perfil' ? 'var(--v)' : 'var(--text3)', gap: '4px', minHeight: '60px', transition: 'color .15s', position: 'relative' }}>
            {(masItems.some(i => i.id === page) || page === 'perfil') && (
              <div style={{ position: 'absolute', top: '8px', right: 'calc(50% - 14px)', width: '6px', height: '6px', borderRadius: '50%', background: 'var(--v)' }} />
            )}
            {comunicadosBadge > 0 && masItems.some(i => i.id === 'comunicados') && (
              <div style={{ position: 'absolute', top: '6px', right: 'calc(50% - 18px)', minWidth: '16px', height: '16px', borderRadius: '10px', background: 'var(--red)', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{comunicadosBadge}</div>
            )}
            {atencionBadge > 0 && masItems.some(i => i.id === 'atencion') && comunicadosBadge === 0 && (
              <div style={{ position: 'absolute', top: '6px', right: 'calc(50% - 18px)', minWidth: '16px', height: '16px', borderRadius: '10px', background: '#1a6b8a', color: '#fff', fontSize: '10px', fontWeight: 700, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: '0 4px' }}>{atencionBadge}</div>
            )}
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="4" cy="10" r="1.5" /><circle cx="10" cy="10" r="1.5" /><circle cx="16" cy="10" r="1.5" />
            </svg>
            <span style={{ fontSize: '10px', fontWeight: 500, lineHeight: 1, display: 'flex', alignItems: 'center', gap: '3px' }}>
              Más
              <span style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                minWidth: '14px', height: '14px', borderRadius: '7px',
                background: masOpen || masItems.some(i => i.id === page) || page === 'perfil' ? 'var(--v)' : 'var(--border)',
                color: masOpen || masItems.some(i => i.id === page) || page === 'perfil' ? '#fff' : 'var(--text3)',
                fontSize: '9px', fontWeight: 700, padding: '0 3px', lineHeight: 1,
              }}>
                {masItems.length + 1 /* +1 por Mi perfil */}
              </span>
            </span>
          </button>
        )}
      </nav>

      {/* BUSCADOR GLOBAL */}
      {busqGlobalOpen && (
        <div style={{ position:'fixed', inset:0, zIndex:300, background:'rgba(20,0,40,.5)' }} onClick={() => setBusqGlobalOpen(false)}>
          <div style={{ position:'absolute', top:'60px', left:'50%', transform:'translateX(-50%)', width:'calc(100% - 32px)', maxWidth:'500px', background:'var(--white)', borderRadius:'16px', overflow:'hidden', boxShadow:'0 8px 32px rgba(0,0,0,.18)' }} onClick={e => e.stopPropagation()}>
            <div style={{ display:'flex', alignItems:'center', gap:'10px', padding:'12px 16px', borderBottom:'1px solid var(--border)' }}>
              <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round" style={{flexShrink:0}}><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
              <input
                autoFocus
                type="text"
                value={busqGlobalQ}
                onChange={e => setBusqGlobalQ(e.target.value)}
                placeholder="Buscar alumno, curso, colaborador..."
                style={{ flex:1, border:'none', outline:'none', fontSize:'15px', background:'transparent', color:'var(--text)', fontFamily:'inherit' }}
                onKeyDown={e => { if (e.key === 'Escape') setBusqGlobalOpen(false) }}
              />
              {busqLoading && <div style={{width:'14px',height:'14px',border:'2px solid var(--border)',borderTopColor:'var(--v)',borderRadius:'50%',animation:'spin .6s linear infinite',flexShrink:0}} />}
              <button onClick={() => setBusqGlobalOpen(false)} style={{background:'none',border:'none',cursor:'pointer',color:'var(--text3)',fontSize:'18px',lineHeight:1,flexShrink:0}}>×</button>
            </div>
            {busqResultados.length > 0 && (
              <div style={{ maxHeight:'320px', overflowY:'auto' }}>
                {busqResultados.map((r, i) => (
                  <button key={i} onClick={() => { navTo(r.nav); setBusqGlobalOpen(false) }}
                    style={{ display:'flex', alignItems:'center', gap:'12px', width:'100%', padding:'12px 16px', border:'none', background:'transparent', cursor:'pointer', textAlign:'left', borderBottom: i<busqResultados.length-1 ? '1px solid var(--border)' : 'none' }}
                    onMouseEnter={e => (e.currentTarget.style.background='var(--vl)')}
                    onMouseLeave={e => (e.currentTarget.style.background='transparent')}
                  >
                    <div style={{ width:36, height:36, borderRadius:11, background:r.color||'var(--border)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:'12px', fontWeight:700, color:'#fff', flexShrink:0 }}>
                      {r.tipo==='alumno' ? r.titulo.split(' ').map((n:string)=>n[0]).slice(0,2).join('').toUpperCase()
                       : r.tipo==='curso' ? r.titulo.slice(0,2).toUpperCase()
                       : r.titulo[0].toUpperCase()}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'14px',fontWeight:600,color:'var(--text)'}}>{r.titulo}</div>
                      <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'1px'}}>{r.sub} · {r.tipo==='alumno'?'Alumno':r.tipo==='curso'?'Curso':'Colaborador'}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M7 5l5 5-5 5"/></svg>
                  </button>
                ))}
              </div>
            )}
            {busqGlobalQ.length >= 2 && !busqLoading && busqResultados.length === 0 && (
              <div style={{ padding:'24px', textAlign:'center', color:'var(--text3)', fontSize:'13px' }}>Sin resultados para "{busqGlobalQ}"</div>
            )}
            {!busqGlobalQ && (
              <div style={{ padding:'20px 16px', color:'var(--text3)', fontSize:'13px' }}>Escribí el nombre de un alumno, curso o docente</div>
            )}
          </div>
        </div>
      )}
      <style>{`@keyframes spin { to { transform: rotate(360deg) } }`}</style>

      {navEditOpen && (
        <NavEditor
          allAllowed={allAllowed}
          navOrdered={navOrdered}
          MAX_NAV={MAX_NAV}
          saveNavCustom={saveNavCustom}
          onClose={() => setNavEditOpen(false)}
        />
      )}

      {/* CONFIRM DIALOG GLOBAL */}
      {confirmDialog && (
        <ConfirmDialog
          mensaje={confirmDialog.mensaje}
          detalle={confirmDialog.detalle}
          labelConfirm={confirmDialog.labelConfirm}
          onConfirm={confirmDialog.onConfirm}
          onClose={() => setConfirmDialog(null)}
        />
      )}

    </div>
    </ToastProvider>
  )
}
