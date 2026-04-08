'use client'

import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { useComunicados } from '@/lib/hooks'
import { createClient } from '@/lib/supabase'
import Dashboard from './pages/Dashboard'
import Alumnos from './pages/Alumnos'
import Cursos from './pages/Cursos'
import Horarios from './pages/Horarios'
import Profesoras from './pages/Profesoras'
import Reportes from './pages/Reportes'
import Agenda from './pages/Agenda'
import Permisos from './pages/Permisos'
import Perfil from './pages/Perfil'
import Comunicados from './pages/Comunicados'
import Actividad from './pages/Actividad'  // ← NUEVO
import AtencionCliente from './pages/AtencionCliente'

const ALL_NAV = [
  { id: 'dashboard',  label: 'Inicio',    icon: 'M3 3h7v7H3zM13 3h7v7h-7zM3 13h7v7H3zM13 13h7v7h-7z' },
  { id: 'alumnos',    label: 'Alumnos',   icon: 'M10 3L18 7l-8 4-8-4 8-4zM6 11v4a6 3 0 008 0v-4' },
  { id: 'cursos',     label: 'Cursos',    icon: 'M3 3h14v14H3zM7 7h6M7 10h6M7 13h4' },
  { id: 'horarios',   label: 'Horarios',  icon: 'M2 3h16v14H2zM6 1v3M14 1v3M2 8h16' },
  { id: 'profesoras', label: 'Docentes',  icon: 'M7 7a3 3 0 100-6 3 3 0 000 6zM1 18c0-3.3 2.7-6 6-6M15 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM12 18c0-2.5 2-4.5 5-4.5' },
  { id: 'reportes',   label: 'Reportes',  icon: 'M4 15l4-4 3 3 5-6M2 2h16v16H2z' },
  { id: 'permisos',      label: 'Permisos',      icon: 'M10 2a4 4 0 014 4v1h2a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4zM10 4a2 2 0 00-2 2v1h4V6a2 2 0 00-2-2z' },
  { id: 'agenda',        label: 'Agenda',        icon: 'M3 4h16v16H3zM16 2v4M8 2v4M3 10h16' },
  { id: 'comunicados',   label: 'Comunicados',   icon: 'M18 8a6 6 0 01-6 6H8l-4 4V8a6 6 0 016-6h2a6 6 0 016 6z' },
  { id: 'actividad',     label: 'Actividad',     icon: 'M10 3a7 7 0 100 14A7 7 0 0010 3zM10 7v3l2 2M3 3l14 14' },  // ← NUEVO
  { id: 'atencion',      label: 'Atención',      icon: 'M18 8a6 6 0 01-6 6H8l-4 4V8a6 6 0 016-6h2a6 6 0 016 6zM9 10h.01M12 10h.01M15 10h.01' },
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
  actividad: Actividad,  // ← NUEVO
  atencion: AtencionCliente,
}

const PAGE_TITLES: Record<string,string> = {
  dashboard:'Inicio', alumnos:'Alumnos', cursos:'Cursos',
  horarios:'Horarios', profesoras:'Docentes', reportes:'Reportes',
  permisos:'Permisos', perfil:'Mi perfil', agenda:'Agenda', comunicados:'Comunicados',
  actividad:'Actividad',  // ← NUEVO
  atencion:'Atención al Cliente',
}

const ROLE_LABELS: Record<string,string> = {
  director:'Director', coordinadora:'Coordinadora',
  secretaria:'Secretaria', profesora:'Profesora',
}
const ROLE_STYLES: Record<string,{bg:string,color:string}> = {
  director:     {bg:'var(--vl)',    color:'var(--v)'},
  coordinadora: {bg:'var(--bluel)',color:'var(--blue)'},
  secretaria:   {bg:'var(--bluel)',color:'var(--blue)'},
  profesora:    {bg:'#f1eef8',     color:'var(--text2)'},
}

export default function AppShell() {
  const { usuario, puedeVer } = useAuth()
  const [page, setPage] = useState<string>(() => {
    // Restaurar página activa desde sessionStorage al volver del background
    if (typeof window !== 'undefined') {
      const saved = sessionStorage.getItem('nav_page')
      if (saved) return saved
    }
    if (!usuario) return 'dashboard'
    const perms = ['dashboard','alumnos','cursos','horarios','profesoras','reportes','permisos']
    return perms.find(p => puedeVer(p)) ?? 'alumnos'
  })
  const [masOpen, setMasOpen] = useState(false)
  const [comunicadosBadge, setComunicadosBadge] = useState(0)
  const { comunicados } = useComunicados()
  const [vistosLocal, setVistosLocal] = useState<string[]>([])

  // Inicializar vistos desde localStorage UNA sola vez al cargar
  useEffect(() => {
    if (!usuario) return
    try {
      const saved = JSON.parse(localStorage.getItem(`comunicados_vistos_${usuario.id}`) || '[]')
      setVistosLocal(saved)
    } catch { setVistosLocal([]) }
  }, [usuario?.id])

  // Calcular badge cuando cambian comunicados o vistos
  useEffect(() => {
    if (!comunicados.length || !usuario) return
    const misComunicados = comunicados.filter(c => c.rol_destino === 'todos' || c.rol_destino === usuario.rol)
    const noLeidos = misComunicados.filter(c => !vistosLocal.includes(c.id)).length
    setComunicadosBadge(noLeidos)
  }, [comunicados, vistosLocal, usuario?.id])

  // Marcar como leídos al entrar a comunicados
  const irAComunicados = () => {
    if (!usuario) return
    const misComunicados = comunicados.filter(c => c.rol_destino === 'todos' || c.rol_destino === usuario.rol)
    const ids = misComunicados.map(c => c.id)
    try { localStorage.setItem(`comunicados_vistos_${usuario.id}`, JSON.stringify(ids)) } catch {}
    setVistosLocal(ids)
    setComunicadosBadge(0)
    setPage('comunicados')
    setMasOpen(false)
    try { sessionStorage.setItem('nav_page', 'comunicados') } catch {}
  }

  if (!usuario) return null

  const allAllowed = ALL_NAV.filter(n => puedeVer(n.id))
  const MAX_NAV = 5
  const navItems = allAllowed.slice(0, MAX_NAV)
  const masItems = allAllowed.slice(MAX_NAV)
  const hayMas = masItems.length > 0

  const PageComponent = PAGES[page] ?? Dashboard
  const rs = ROLE_STYLES[usuario.rol] ?? ROLE_STYLES.profesora

  const navTo = (id: string) => {
    if (id === 'comunicados') { irAComunicados(); return }
    setPage(id)
    setMasOpen(false)
    try { sessionStorage.setItem('nav_page', id) } catch {}
  }

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>

      {/* TOPBAR */}
      <div style={{background:'var(--white)',borderBottom:'1px solid var(--border)',padding:'0 20px',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:40}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{width:'36px',height:'36px',borderRadius:'10px',background:'var(--v)',display:'flex',alignItems:'center',justifyContent:'center',flexShrink:0}}>
          <svg width="20" height="20" viewBox="0 0 32 32" fill="none" stroke="white" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 5L27 11v10L16 27 5 21V11L16 5z"/>
            <path d="M16 5v22M5 11l11 10 11-10"/>
          </svg>
        </div>
          <div style={{fontSize:'16px',fontWeight:700,letterSpacing:'-.2px'}}>
            <span style={{color:'var(--v)'}}>Next</span> Ezeiza
          </div>
        </div>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <div style={{padding:'5px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:rs.bg,color:rs.color}}>
            {ROLE_LABELS[usuario.rol]}
          </div>
          <button onClick={() => navTo('perfil')} style={{width:'36px',height:'36px',borderRadius:'12px',background:usuario.color,border:'none',color:'#fff',fontSize:'12px',fontWeight:700,cursor:'pointer'}}>
            {usuario.initials}
          </button>
        </div>
      </div>

      {/* CONTENT — display:none para mantener estado sin desmontar */}
      <div style={{flex:1,overflowY:'auto',position:'relative'}}>
        <div style={{padding:'16px 16px 24px',display:page==='dashboard'?'block':'none'}}><Dashboard /></div>
        <div style={{padding:'16px 16px 24px',display:page==='alumnos'?'block':'none'}}><Alumnos /></div>
        <div style={{padding:'16px 16px 24px',display:page==='cursos'?'block':'none'}}><Cursos /></div>
        <div style={{padding:'16px 16px 24px',display:page==='horarios'?'block':'none'}}><Horarios /></div>
        <div style={{padding:'16px 16px 24px',display:page==='profesoras'?'block':'none'}}><Profesoras /></div>
        <div style={{padding:'16px 16px 24px',display:page==='reportes'?'block':'none'}}><Reportes /></div>
        <div style={{padding:'16px 16px 24px',display:page==='permisos'?'block':'none'}}><Permisos /></div>
        <div style={{padding:'16px 16px 24px',display:page==='perfil'?'block':'none'}}><Perfil /></div>
        <div style={{padding:'16px 16px 24px',display:page==='agenda'?'block':'none'}}><Agenda /></div>
        <div style={{padding:'16px 16px 24px',display:page==='comunicados'?'block':'none'}}><Comunicados /></div>
        <div style={{padding:'16px 16px 24px',display:page==='actividad'?'block':'none'}}><Actividad /></div>
        <div style={{padding:'16px 16px 24px',display:page==='atencion'?'block':'none'}}><AtencionCliente /></div>
      </div>

      {/* DRAWER "MÁS" */}
      {masOpen && (
        <div style={{position:'fixed',inset:0,zIndex:100}} onClick={() => setMasOpen(false)}>
          <div style={{position:'absolute',bottom:'60px',left:0,right:0,background:'var(--white)',borderTop:'1.5px solid var(--border)',borderRadius:'20px 20px 0 0',padding:'8px 0 4px',boxShadow:'0 -4px 20px rgba(0,0,0,.08)'}} onClick={e=>e.stopPropagation()}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 12px'}} />
            {masItems.map(item => (
              <button key={item.id} onClick={() => navTo(item.id)} style={{display:'flex',alignItems:'center',gap:'14px',width:'100%',padding:'14px 24px',border:'none',background:page===item.id?'var(--vl)':'transparent',cursor:'pointer',transition:'background .15s'}}>
                <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke={page===item.id?'var(--v)':'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                  {item.icon.split('M').filter(Boolean).map((d,i) => <path key={i} d={`M${d}`} />)}
                </svg>
                <span style={{fontSize:'15px',fontWeight:600,color:page===item.id?'var(--v)':'var(--text)',flex:1,textAlign:'left'}}>{item.label}</span>
                {item.id === 'comunicados' && comunicadosBadge > 0 && (
                  <div style={{minWidth:'20px',height:'20px',borderRadius:'10px',background:'var(--red)',color:'#fff',fontSize:'11px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 5px'}}>
                    {comunicadosBadge}
                  </div>
                )}
                {page===item.id && item.id !== 'comunicados' && <div style={{marginLeft:'auto',width:'8px',height:'8px',borderRadius:'50%',background:'var(--v)'}} />}
              </button>
            ))}
            {/* Perfil siempre en el drawer si no cabe */}
            <button onClick={() => navTo('perfil')} style={{display:'flex',alignItems:'center',gap:'14px',width:'100%',padding:'14px 24px',border:'none',background:page==='perfil'?'var(--vl)':'transparent',cursor:'pointer',borderTop:'1px solid var(--border)',marginTop:'4px'}}>
              <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke={page==='perfil'?'var(--v)':'var(--text3)'} strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="10" cy="7" r="4"/><path d="M2 18c0-3.3 3.6-6 8-6s8 2.7 8 6"/>
              </svg>
              <span style={{fontSize:'15px',fontWeight:600,color:page==='perfil'?'var(--v)':'var(--text)'}}>Mi perfil</span>
              {page==='perfil' && <div style={{marginLeft:'auto',width:'8px',height:'8px',borderRadius:'50%',background:'var(--v)'}} />}
            </button>
          </div>
        </div>
      )}

      {/* BOTTOM NAV */}
      <nav style={{background:'var(--white)',borderTop:'1px solid var(--border)',display:'flex',alignItems:'stretch',position:'sticky',bottom:0,zIndex:50}}>
        {navItems.map(item => (
          <button key={item.id} onClick={() => navTo(item.id)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'10px 4px 12px',border:'none',background:'none',cursor:'pointer',color:page===item.id?'var(--v)':'var(--text3)',gap:'4px',minHeight:'60px',transition:'color .15s'}}>
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round">
              {item.icon.split('M').filter(Boolean).map((d,i) => <path key={i} d={`M${d}`} />)}
            </svg>
            <span style={{fontSize:'10px',fontWeight:500,lineHeight:1}}>{item.label}</span>
          </button>
        ))}

        {/* BOTÓN "MÁS" */}
        {hayMas && (
          <button onClick={() => setMasOpen(!masOpen)} style={{flex:1,display:'flex',flexDirection:'column',alignItems:'center',justifyContent:'center',padding:'10px 4px 12px',border:'none',background:'none',cursor:'pointer',color:masOpen||masItems.some(i=>i.id===page)||page==='perfil'?'var(--v)':'var(--text3)',gap:'4px',minHeight:'60px',transition:'color .15s',position:'relative'}}>
            {(masItems.some(i=>i.id===page)||page==='perfil') && (
              <div style={{position:'absolute',top:'8px',right:'calc(50% - 14px)',width:'6px',height:'6px',borderRadius:'50%',background:'var(--v)'}} />
            )}
            {comunicadosBadge > 0 && masItems.some(i=>i.id==='comunicados') && (
              <div style={{position:'absolute',top:'6px',right:'calc(50% - 18px)',minWidth:'16px',height:'16px',borderRadius:'10px',background:'var(--red)',color:'#fff',fontSize:'10px',fontWeight:700,display:'flex',alignItems:'center',justifyContent:'center',padding:'0 4px'}}>
                {comunicadosBadge}
              </div>
            )}
            <svg width="22" height="22" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round">
              <circle cx="4" cy="10" r="1.5"/><circle cx="10" cy="10" r="1.5"/><circle cx="16" cy="10" r="1.5"/>
            </svg>
            <span style={{fontSize:'10px',fontWeight:500,lineHeight:1}}>Más</span>
          </button>
        )}
      </nav>
    </div>
  )
}
