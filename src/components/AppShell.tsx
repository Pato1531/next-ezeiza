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
import Permisos from './pages/Permisos'
import Perfil from './pages/Perfil'
import Comunicados from './pages/Comunicados'

const ALL_NAV = [
  { id: 'dashboard',  label: 'Inicio',    icon: 'M3 3h7v7H3zM13 3h7v7h-7zM3 13h7v7H3zM13 13h7v7h-7z' },
  { id: 'alumnos',    label: 'Alumnos',   icon: 'M10 3L18 7l-8 4-8-4 8-4zM6 11v4a6 3 0 008 0v-4' },
  { id: 'cursos',     label: 'Cursos',    icon: 'M3 3h14v14H3zM7 7h6M7 10h6M7 13h4' },
  { id: 'horarios',   label: 'Horarios',  icon: 'M2 3h16v14H2zM6 1v3M14 1v3M2 8h16' },
  { id: 'profesoras', label: 'Docentes',  icon: 'M7 7a3 3 0 100-6 3 3 0 000 6zM1 18c0-3.3 2.7-6 6-6M15 8a2.5 2.5 0 100-5 2.5 2.5 0 000 5zM12 18c0-2.5 2-4.5 5-4.5' },
  { id: 'reportes',   label: 'Reportes',  icon: 'M4 15l4-4 3 3 5-6M2 2h16v16H2z' },
  { id: 'permisos',      label: 'Permisos',      icon: 'M10 2a4 4 0 014 4v1h2a2 2 0 012 2v7a2 2 0 01-2 2H4a2 2 0 01-2-2V9a2 2 0 012-2h2V6a4 4 0 014-4zM10 4a2 2 0 00-2 2v1h4V6a2 2 0 00-2-2z' },
  { id: 'comunicados',   label: 'Comunicados',   icon: 'M18 8a6 6 0 01-6 6H8l-4 4V8a6 6 0 016-6h2a6 6 0 016 6z' },
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
  comunicados: Comunicados,
}

const PAGE_TITLES: Record<string,string> = {
  dashboard:'Inicio', alumnos:'Alumnos', cursos:'Cursos',
  horarios:'Horarios', profesoras:'Docentes', reportes:'Reportes',
  permisos:'Permisos', perfil:'Mi perfil', comunicados:'Comunicados',
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
  const MAX_NAV = 4
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
          <img src="data:image/jpeg;base64,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AAAACMAAAAAAAAAAAAAALAAAAAAAAAAAAAAHIAAAAAAAAAAAAAAAEBAAAAAAAAAAAAAIAAAAAAAAAAAAAAAAAAJAAAAAAAAAAHIAAAAAAAAAAAAAAAAAAAECAAAAAAAAAIAAAAAAAAAAAAAAAAAAAAAEAAAAAAAACAAAAAAAAAAAAAAAAAAAAAAACAAAAAABAAAAAAAAHYU8gAAAFdwAAAAAFAAAAAAAAAAAAAAADAiQiwABhgQAAAAAAKAAAAAAAAAAAAAAEF0ikgoeVgQAAAAAAIAAAAAIAAAAAAAAFAwIwgfgFgQAAAAAAAAAAAACAAAAAAAAPFwCKAg4whQAAAAAAAAAAAAKAAAAAAAAPByowBQgXEAAAAAAABAAAAACAAAAAAAAPkwAAEgAosQAAAAAAFAAAAAIAAAAAAAAAYgAAAEscUQAAAAAAEAAAAAKAAAAEKDgCcQj1BSijwwCTgAAAEAAAAAAAAAAFoABbUkku06ZEynBQKwAACAAAAAEIAAAEMcNu0AsEEAAooAskgAABAAAAAAACAAAAAAAAAAAAAAAAAAAAAAAGAAAAAAAAKAAAAAAAAAAAAAAAAAAAAAFIAAAAAAAAECAAAAAAAAAAAAAAAAAAABCAAAAAAAAAACAAAAAAAAAAAAAAAAAAAPAAAAAAAAAAAAACAAAAAAAAAAAAAAABPAAAAAAAAAAAAAAJCAAAAAAAAAAAAADAAAAAAAAAAAAAAAAAABCAAAAAAAAADEAAAAAAAAAAAAAAAAAAAAABADABBACAEAAAAAAAAAAAAAAAAAAAAAAAAAMMAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAP/aAAwDAQACAAMAAAAQ888888888888888888888888888888888888888888888888888888888888888888888888884wI8cs8cEw088888888888888888888oM888888888MY088888888888888884c88888888888884U88888888888888w8888888888888888sw888888888888w8888888888888888888Y8888888888gc8888888888888888888sQ8888888848888888888888888888888488888888Q88888888888888888888888c888888808888888hgTD88887Q888888o088888488888888eHLAV8836X8888888c88888c88888888SD5AQxcU+T8888888o88888888888888WW8/ADc8qT8888888888888U88888888+T8xFADU+H8888888488888c88888888+Do0svAGkG8888888888888U88888888AH888tjAhs8888888o88888888888888Nc8888/f/APfPPPPPPOPPPPPHPPPPLkt+9kM/+3tc83fvv9vPPOPPPPPOPPPPOTRvdC4bRBAkuuMlKdPPPFPPPPPLHPPPLPHrd7nTvHjjbfzfbfvPLHPPPPPPNPPPPPPPPPPPPPPPPPPPPPPPEPPPPPPPONPPPPPPPPPPPPPPPPPPPPPLFPPPPPPPPKNPPPPPPPPPPPPPPPPPPPODPPPPPPPPPPBPPPPPPPPPPPPPPPPPPOFPPPPPPPPPPPPMPPPPPPPPPPPPPPPPOOHPPPPPPPPPPPPLOPPPPPPPPPPPPPPOFPPPPPPPPPPPPPPPPDGMPPPPPPPPPPOPPPPPPPPPPPPPPPPPPPPLOMOPPONJBLPPPPPPPPPPPPPPPPPPPPPPPPPLPLPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPPP/EADYRAAIBAgQCBwUHBQAAAAAAAAECAAMRBBIhMQVBEBMyM0BRgSBCYbHBFSNScYCR0RQiMHKh/9oACAECAQE/AP0l0MyXqAXA3lMUqihlAtOqT8ImMwgIz0x7PDkVma4vMdTVaVwPD8NFwwPwjA4N8w7B/wCRWDC426MbhMv3ibc+labMLgThnaacQ7nw/DPe9JxHuvWYPFdUcrbfLo3mMwvVHMu3ymBFJmyuNeUxmIDHq02E4Z2mnEO58Pwz3vScR7r16MFi8v3b7cuhlDCx2mJw5oNpty6OGdppxDufD8M970nEe69ZvKuCenTD/v8ACYLF5vu335dFSmtRSrbSvQai2UzhnaaY/ufD8M970nEe69ZhqlOkc7ankJVx9R9BoIDbUTB4rrRlbtDorUVrLlaYQdRVNN9zMf3J8Pwz3vScR7r19hWKnMN5hsSK6/HoxGHFZbc+UrVy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" alt="Next Ezeiza" style={{width:'36px',height:'36px',borderRadius:'10px',objectFit:'cover'}} />
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
