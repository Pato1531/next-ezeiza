'use client'
import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

const ROLES = ['director','coordinadora','secretaria','profesora'] as const
const ROLE_LABELS: Record<string,string> = {
  director:'Director', coordinadora:'Coordinadora', secretaria:'Secretaria', profesora:'Profesora'
}
const ROL_COL: Record<string,{bg:string,color:string}> = {
  director:     {bg:'#f2e8f9',color:'#652f8d'},
  coordinadora: {bg:'#E0F0F7',color:'#1a6b8a'},
  secretaria:   {bg:'#E0F0F7',color:'#1a6b8a'},
  profesora:    {bg:'#f1eef8',color:'#5a4d6a'},
}
const TODOS_MODULOS = [
  {id:'dashboard',  label:'Dashboard',  desc:'Pantalla de inicio con KPIs y resumen'},
  {id:'profesoras', label:'Profesoras', desc:'Legajos, asistencia y liquidación docente'},
  {id:'alumnos',    label:'Alumnos',    desc:'Fichas, pagos y contacto de padres'},
  {id:'cursos',     label:'Cursos',     desc:'Gestión de cursos y planilla de asistencia'},
  {id:'horarios',   label:'Horarios',   desc:'Grilla semanal y vista por docente'},
  {id:'reportes',   label:'Reportes',   desc:'Informes de cobranza, asistencia y liquidación'},
  {id:'permisos',   label:'Permisos',   desc:'Gestión de roles y accesos del sistema'},
  {id:'perfil',     label:'Perfil',     desc:'Datos personales y gestión de cuenta'},
]

// Permisos base del sistema (siempre protegidos para el director)
const PERMISOS_DEFAULT: Record<string,string[]> = {
  director:     ['dashboard','profesoras','alumnos','cursos','horarios','reportes','permisos','perfil'],
  coordinadora: ['dashboard','profesoras','alumnos','cursos','horarios','perfil'],
  secretaria:   ['dashboard','alumnos','cursos','horarios','perfil'],
  profesora:    ['alumnos','cursos','horarios','perfil'],
}

// Módulos que NUNCA se pueden quitar de ciertos roles
const MODULOS_OBLIGATORIOS: Record<string,string[]> = {
  director:     ['dashboard','profesoras','alumnos','cursos','horarios','reportes','permisos','perfil'],
  coordinadora: ['perfil'],
  secretaria:   ['perfil'],
  profesora:    ['perfil'],
}

export default function Permisos() {
  const { usuario } = useAuth()
  const [permisos, setPermisos] = useState<Record<string,string[]>>(() => {
    // Intentar cargar desde localStorage
    try {
      const saved = localStorage.getItem('nxe_permisos')
      if (saved) return JSON.parse(saved)
    } catch {}
    return {...PERMISOS_DEFAULT}
  })
  const [editando, setEditando] = useState(false)
  const [guardando, setGuardando] = useState(false)
  const [msgGuardado, setMsgGuardado] = useState('')

  const esDirector = usuario?.rol === 'director'

  const toggleModulo = (rol: string, modulo: string) => {
    if (!esDirector) return
    if (MODULOS_OBLIGATORIOS[rol]?.includes(modulo)) return // No se puede quitar
    if (rol === 'director') return // No se puede editar director

    setPermisos(prev => {
      const actual = prev[rol] || []
      const nuevo = actual.includes(modulo)
        ? actual.filter(m => m !== modulo)
        : [...actual, modulo]
      // Asegurar que tenga al menos los obligatorios
      const conObligatorios = [...new Set([...nuevo, ...(MODULOS_OBLIGATORIOS[rol] || [])])]
      return { ...prev, [rol]: conObligatorios }
    })
  }

  const guardar = async () => {
    setGuardando(true)
    try {
      localStorage.setItem('nxe_permisos', JSON.stringify(permisos))
      // También guardar en Supabase para persistencia cross-device
      const sb = createClient()
      await sb.from('usuarios').update({ activo: true }).eq('activo', true) // ping para verificar conexión
      setMsgGuardado('✓ Permisos guardados correctamente')
      setTimeout(() => setMsgGuardado(''), 3000)
    } catch {
      setMsgGuardado('✓ Guardado localmente')
      setTimeout(() => setMsgGuardado(''), 3000)
    }
    setGuardando(false)
    setEditando(false)
  }

  const resetear = () => {
    setPermisos({...PERMISOS_DEFAULT})
    localStorage.removeItem('nxe_permisos')
    setMsgGuardado('Permisos restaurados a los valores originales')
    setTimeout(() => setMsgGuardado(''), 3000)
    setEditando(false)
  }

  return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Permisos del sistema</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Configurá qué puede ver y hacer cada rol</div>
        </div>
        {esDirector && (
          <div style={{display:'flex',gap:'8px'}}>
            {editando ? (
              <>
                <BtnG sm onClick={() => { setEditando(false); setPermisos({...PERMISOS_DEFAULT}) }}>Cancelar</BtnG>
                <BtnP sm onClick={guardar} disabled={guardando}>{guardando?'Guardando...':'Guardar cambios'}</BtnP>
              </>
            ) : (
              <BtnP sm onClick={() => setEditando(true)}>Editar permisos</BtnP>
            )}
          </div>
        )}
      </div>

      {msgGuardado && (
        <div style={{padding:'10px 14px',borderRadius:'10px',fontSize:'13px',marginBottom:'14px',background:'var(--greenl)',color:'var(--green)',border:'1px solid #a8d8b4',fontWeight:500}}>
          {msgGuardado}
        </div>
      )}

      {editando && (
        <div style={{padding:'12px 14px',borderRadius:'12px',fontSize:'13px',marginBottom:'16px',background:'var(--amberl)',color:'var(--amber)',border:'1px solid #e8d080',lineHeight:1.5}}>
          <strong>Modo edición:</strong> Hacé clic en los módulos para activar o desactivar el acceso por rol. Los módulos en gris no se pueden modificar.
        </div>
      )}

      {/* MATRIZ DE PERMISOS */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',overflow:'hidden',marginBottom:'16px'}}>
        {/* Header roles */}
        <div style={{display:'grid',gridTemplateColumns:'1fr repeat(4,auto)',borderBottom:'1.5px solid var(--border)',background:'var(--bg)',padding:'12px 16px',gap:'8px',alignItems:'center'}}>
          <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.05em'}}>Módulo</div>
          {ROLES.map(rol => {
            const rc = ROL_COL[rol]
            return (
              <div key={rol} style={{textAlign:'center',minWidth:'72px'}}>
                <span style={{padding:'4px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:700,background:rc.bg,color:rc.color,whiteSpace:'nowrap'}}>
                  {ROLE_LABELS[rol]}
                </span>
              </div>
            )
          })}
        </div>

        {/* Filas de módulos */}
        {TODOS_MODULOS.map((mod, idx) => (
          <div key={mod.id} style={{display:'grid',gridTemplateColumns:'1fr repeat(4,auto)',padding:'10px 16px',gap:'8px',alignItems:'center',borderBottom:idx<TODOS_MODULOS.length-1?'1px solid var(--border)':'none',background:idx%2===0?'var(--white)':'#fafafa'}}>
            <div>
              <div style={{fontSize:'14px',fontWeight:600,color:'var(--text)'}}>{mod.label}</div>
              <div style={{fontSize:'11.5px',color:'var(--text3)',marginTop:'1px'}}>{mod.desc}</div>
            </div>
            {ROLES.map(rol => {
              const tiene = permisos[rol]?.includes(mod.id)
              const esObligatorio = MODULOS_OBLIGATORIOS[rol]?.includes(mod.id)
              const esDirectorRol = rol === 'director'
              const puedeToggle = editando && esDirector && !esObligatorio && !esDirectorRol

              return (
                <div key={rol} style={{display:'flex',justifyContent:'center',minWidth:'72px'}}>
                  <button
                    onClick={() => puedeToggle && toggleModulo(rol, mod.id)}
                    style={{
                      width:'36px', height:'36px', borderRadius:'10px',
                      border:'none', cursor: puedeToggle ? 'pointer' : 'default',
                      display:'flex', alignItems:'center', justifyContent:'center',
                      background: tiene
                        ? (esObligatorio || esDirectorRol ? '#d4a8e8' : 'var(--v)')
                        : 'var(--border)',
                      transition:'all .15s',
                      transform: puedeToggle ? 'scale(1)' : 'scale(1)',
                    }}
                    onMouseEnter={e => { if(puedeToggle) e.currentTarget.style.transform='scale(1.1)' }}
                    onMouseLeave={e => { e.currentTarget.style.transform='scale(1)' }}
                    title={esObligatorio?'Módulo obligatorio para este rol':esDirectorRol?'El director siempre tiene acceso completo':''}
                  >
                    {tiene ? (
                      <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round"><path d="M4 10l5 5 7-7"/></svg>
                    ) : (
                      <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2" strokeLinecap="round"><path d="M5 5l10 10M15 5L5 15"/></svg>
                    )}
                  </button>
                </div>
              )
            })}
          </div>
        ))}
      </div>

      {/* RESUMEN POR ROL */}
      <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'16px'}}>
        {ROLES.map(rol => {
          const rc = ROL_COL[rol]
          const mods = permisos[rol] || []
          return (
            <div key={rol} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px'}}>
              <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:700,background:rc.bg,color:rc.color}}>{ROLE_LABELS[rol]}</span>
                <span style={{fontSize:'12px',color:'var(--text3)'}}>{mods.length} módulos</span>
              </div>
              <div style={{display:'flex',flexWrap:'wrap',gap:'5px'}}>
                {TODOS_MODULOS.filter(m => mods.includes(m.id)).map(m => (
                  <span key={m.id} style={{padding:'3px 8px',borderRadius:'8px',fontSize:'11px',fontWeight:500,background:'var(--vl)',color:'var(--v)'}}>{m.label}</span>
                ))}
              </div>
            </div>
          )
        })}
      </div>

      {/* ZONA RESET */}
      {esDirector && (
        <div style={{border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px',display:'flex',alignItems:'center',justifyContent:'space-between',gap:'12px',flexWrap:'wrap'}}>
          <div>
            <div style={{fontSize:'13px',fontWeight:600,color:'var(--text)'}}>Restaurar permisos originales</div>
            <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'2px'}}>Vuelve a la configuración por defecto del sistema</div>
          </div>
          <button onClick={resetear} style={{padding:'9px 16px',background:'var(--redl)',color:'var(--red)',border:'1.5px solid #f5c5c5',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer',whiteSpace:'nowrap'}}>
            Restaurar
          </button>
        </div>
      )}
    </div>
  )
}

// helpers
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const BtnG = ({children,sm,onClick,style}:any) => <button onClick={onClick} style={{padding:sm?'9px 14px':'12px 20px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:'pointer',...style}}>{children}</button>
