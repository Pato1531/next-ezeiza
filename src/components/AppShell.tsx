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
}

const PAGE_TITLES: Record<string,string> = {
  dashboard:'Inicio', alumnos:'Alumnos', cursos:'Cursos',
  horarios:'Horarios', profesoras:'Docentes', reportes:'Reportes',
  permisos:'Permisos', perfil:'Mi perfil', agenda:'Agenda', comunicados:'Comunicados',
  actividad:'Actividad',  // ← NUEVO
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
  const [page, setPage] = useState(() => {
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
  }

  return (
    <div style={{display:'flex',flexDirection:'column',minHeight:'100vh'}}>

      {/* TOPBAR */}
      <div style={{background:'var(--white)',borderBottom:'1px solid var(--border)',padding:'0 20px',height:'60px',display:'flex',alignItems:'center',justifyContent:'space-between',position:'sticky',top:0,zIndex:40}}>
        <div style={{display:'flex',alignItems:'center',gap:'8px'}}>
          <img src="data:image/jpeg;base64,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AAAACMAAAAAAAAAAAAAALAAAAAAAAAAAAAAHIAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAJAAAAAAAAAAHIAAAAAAAAAAAAAAAAAAAECAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAEAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAACAAAAAABAAAAAAAAHYU8gAAAFdwAAAAAFAAAAAAAAAAAAAAADAiQiwABhgQAAAAAAKAAAAAAAAAAAAAAEF0ikgoeVgQAAAAAAIAAAAAIAAAAAAAAFAwIwgfgFgQAAAAAAAAAAAACAAAAAAAAPFwCKAg4whQAAAAAAAAAAAAKAAAAAAAAPByowBQgXEAAAAAAABAAAAACAAAAAAAAPkwAAEgAosQAAAAAAFAAAAAIAAAAAAAAAYgAAAEscUQAAAAAAEAAAAAKAAAAEKDgCcQj1BSijwwCTgAAAEAAAAAAAAAAFoABbUkku06ZEynBQKwAACAAAAAEIAAAEMcNu0AsEEAAooAskgAABAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAFIAAAAAAAAECAAAAAAAAAAAAAAAAAAABCAAAAAAAAAACAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAACAAAAAAAAAAAAAAABPAAAAAAAAAAAAAAJCAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAABCAAAAAAAAADEAAAAAAAAAAAAAAAAAAAAABADABBACAEAAAAAAAAAAAAAAAAAAAAAAAAAMMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACAAMAAAAQ888888888888888888888888888888888888888888888888888888888888888888888888884wI8cs8cEw088888888888888888888oM888888888MY088888888888888884c88888888888884U88888888888888w8888888888888888sw888888888888w8888888888888888888Y8888888888gc8888888888888888888sQ8888888848888888888888888888888488888888Q88888888888888888888888c888888808888888hgTD88887Q888888o088888488888888eHLAV8836X8888888c88888c88888888SD5AQxcU+T8888888o88888888888888WW8/ADc8qT8888888888888U88888888+T8xFADU+H8888888488888c88888888+Do0svAGkG8888888888888U88888888AH888tjAhs8888888o88888888888888Nc8888/f/APfPPPPPPOPPPPPHPPPPLkt+9kM/+3tc83fvv9vPPOPPPPPOPPPPOTRvdC4bRBAkuuMlKdPPPFPPPPPLHPPPLPHrd7nTvHjjbfzfbfvPLHPPPPPPNPPPPPPPPPPPPPPPPPPPPPPPEPPPPPPPONPPPPPPPPPPPPPPPPPPPPPPPLFPPPPPPPPKNPPPPPPPPPPPPPPPPPPPODPPPPPPPPPPPBPPPPPPPPPPPPPPPPPPOFPPPPPPPPPPPPPPPPDGMPPPPPPPPPPOPPPPPPPPPPPPPPPPPPPPLOMOPPONJBLPPPPPPPPPPPPPPPPPPPPPPPPPLPLPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP/EADYRAAIBAgQCBwUHBQAAAAAAAAECAAMRBBIhMQVBEBMyM0BRgSBCYbHBFSNScYCR0RQiMHKh/9oACAECAQE/AP0l0MyXqAXA3lMUqihlAtOqT8ImMwgIz0x7PDkVma4vMdTVaVwPD8NFwwPwjA4N8w7B/wCRWDC426MbhMv3ibc+labMLgThnaacQ7nw/DPe9JxHuvWYPFdUcrbfLo3mMwvVHMu3ymBFJmyuNeUxmIDHq02E4Z2mnEO58Pwz3vScR7r14CXRHibUHLKM46kj9P3oqm1NeYRrdU4j0KidV3YuGinquPiamm5HX+PQQ3UoHrNXVkT7SaRxr1l0M5OBfBP2ixhtpw1Ep9yA9HuOfViEKJuaFiNfL4oAjLYWTn0MMLQ0Y3TyBqQ0E8qp81bvdJHQ00ZHLPF1I5GmhNMVEHVj3bG+W1jqmzUg7MnvGv8q0FRVYSd0yjULtqsZw4OMd5MaNMQ8IqG2OaXTe3BPGGjKGj/ADVzCUlW9kXTWqr5D1tgr9Fq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" alt="Next Ezeiza" style={{width:'36px',height:'36px',borderRadius:'10px',objectFit:'cover'}} />
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

      {/* CONTENT */}
      <div style={{flex:1,padding:'16px 16px 24px',overflowY:'auto'}}>
        <PageComponent />
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
