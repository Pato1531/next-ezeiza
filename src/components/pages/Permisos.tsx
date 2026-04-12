'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient, PERMISOS, Rol } from '@/lib/supabase'
import { logActivity, apiHeaders } from '@/lib/hooks'

const ROLE_LABELS: Record<string,string> = {
  director:'Director', coordinadora:'Coordinadora', secretaria:'Secretaria', profesora:'Profesora'
}
const ROL_COL: Record<string,{bg:string,color:string}> = {
  director:     {bg:'#f2e8f9',color:'#652f8d'},
  coordinadora: {bg:'#E0F0F7',color:'#1a6b8a'},
  secretaria:   {bg:'#E0F0F7',color:'#1a6b8a'},
  profesora:    {bg:'#f1eef8',color:'#5a4d6a'},
}

// Todos los módulos del sistema con etiqueta y descripción
const TODOS_MODULOS = [
  {id:'dashboard',  label:'Dashboard',        desc:'Inicio — KPIs y resumen del día'},
  {id:'alumnos',    label:'Alumnos',           desc:'Fichas, pagos y contacto de familias'},
  {id:'cursos',     label:'Cursos',            desc:'Gestión de grupos y planilla de asistencia'},
  {id:'horarios',   label:'Horarios',          desc:'Grilla semanal de todos los cursos'},
  {id:'profesoras', label:'Docentes',          desc:'Legajos, asistencia y liquidación'},
  {id:'reportes',   label:'Reportes',          desc:'Cobranza, asistencia docente e ingresos'},
  {id:'agenda',     label:'Agenda',            desc:'Calendario compartido del instituto'},
  {id:'comunicados',label:'Comunicados',       desc:'Mensajes internos por rol'},
  {id:'atencion',   label:'Atención al cliente',desc:'Consultas entrantes y lista de espera'},
  {id:'ejecutivo',  label:'Dashboard Ejecutivo',desc:'Cierre mensual financiero — solo director'},
  {id:'cuotas',     label:'Cuotas por curso',  desc:'Actualización masiva de cuotas'},
  {id:'actividad',  label:'Actividad',         desc:'Auditoría de acciones del sistema'},
  {id:'permisos',   label:'Permisos',          desc:'Gestión de usuarios y accesos'},
  {id:'perfil',     label:'Perfil',            desc:'Datos personales y contraseña'},
]

// Módulos que el director NUNCA puede quitarse a sí mismo
const PROTEGIDOS_DIRECTOR = ['dashboard', 'permisos', 'perfil']

export default function Permisos() {
  const { usuario, permisosCustomPorUsuario, recargarPermisosUsuarios } = useAuth()
  const esDirector = usuario?.rol === 'director'

  // Lista de usuarios activos del instituto
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loadingUsuarios, setLoadingUsuarios] = useState(true)

  // Usuario seleccionado para editar
  const [selUsuarioId, setSelUsuarioId] = useState<string | null>(null)
  // Permisos en edición para el usuario seleccionado
  const [permisosEdit, setPermisosEdit] = useState<string[]>([])
  const [guardando,    setGuardando]    = useState(false)
  const [msg,          setMsg]          = useState<{tipo:'ok'|'err', texto:string} | null>(null)

  // Vista secundaria: gestión de usuarios (crear / activar / contraseña)
  const [vistaGestion, setVistaGestion] = useState(false)
  // Formulario nuevo usuario
  const [formNuevo, setFormNuevo] = useState({ nombre:'', email:'', password:'', rol:'coordinadora', color:'#652f8d' })
  const [creando, setCreando]   = useState(false)
  // Modal cambio contraseña
  const [modalPwd, setModalPwd] = useState<{id:string,nombre:string}|null>(null)
  const [nuevaPwd, setNuevaPwd] = useState('')
  const [cambiandoPwd, setCambiandoPwd] = useState(false)

  useEffect(() => {
    cargarUsuarios()
  }, [])

  const cargarUsuarios = async () => {
    setLoadingUsuarios(true)
    const sb = createClient()
    const { data } = await sb
      .from('usuarios')
      .select('id, nombre, rol, color, initials, activo, email, permisos_custom')
      .order('rol').order('nombre')
    setUsuarios(data || [])
    setLoadingUsuarios(false)
  }

  // Al seleccionar un usuario, pre-carga sus permisos efectivos para editar
  const seleccionarUsuario = (u: any) => {
    setSelUsuarioId(u.id)
    const custom = permisosCustomPorUsuario[u.id]
    if (Array.isArray(custom) && custom.length > 0) {
      setPermisosEdit([...custom])
    } else {
      // Sin custom → usar los defaults del rol
      setPermisosEdit([...(PERMISOS[u.rol as Rol] ?? [])])
    }
    setMsg(null)
  }

  const toggleModulo = (modulo: string) => {
    const uSel = usuarios.find(u => u.id === selUsuarioId)
    if (!uSel) return
    // El director no puede quitarse módulos protegidos
    if (uSel.id === usuario?.id && PROTEGIDOS_DIRECTOR.includes(modulo)) return

    setPermisosEdit(prev =>
      prev.includes(modulo)
        ? prev.filter(m => m !== modulo)
        : [...prev, modulo]
    )
  }

  const guardarPermisos = async () => {
    if (!selUsuarioId) return
    const uSel = usuarios.find(u => u.id === selUsuarioId)
    setGuardando(true)

    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          accion: 'actualizar_permisos',
          user_id: selUsuarioId,
          permisos: permisosEdit,
        }),
      })
      const json = await res.json()
      if (json.ok) {
        setMsg({ tipo:'ok', texto:`✓ Permisos de ${uSel?.nombre} actualizados` })
        await recargarPermisosUsuarios()
        await cargarUsuarios()
        logActivity('Actualizó permisos', 'Permisos', uSel?.nombre)
      } else {
        setMsg({ tipo:'err', texto: json.error || 'Error al guardar' })
      }
    } catch {
      setMsg({ tipo:'err', texto:'Error de conexión' })
    }
    setGuardando(false)
    setTimeout(() => setMsg(null), 4000)
  }

  const resetearPermisos = async () => {
    const uSel = usuarios.find(u => u.id === selUsuarioId)
    if (!uSel) return
    if (!window.confirm(`¿Restaurar los permisos de ${uSel.nombre} a los defaults del rol ${ROLE_LABELS[uSel.rol]}?`)) return

    setGuardando(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ accion: 'actualizar_permisos', user_id: selUsuarioId, permisos: null }),
      })
      const json = await res.json()
      if (json.ok) {
        setPermisosEdit([...(PERMISOS[uSel.rol as Rol] ?? [])])
        setMsg({ tipo:'ok', texto:`✓ Permisos de ${uSel.nombre} restaurados al rol ${ROLE_LABELS[uSel.rol]}` })
        await recargarPermisosUsuarios()
        await cargarUsuarios()
      }
    } catch {
      setMsg({ tipo:'err', texto:'Error de conexión' })
    }
    setGuardando(false)
    setTimeout(() => setMsg(null), 4000)
  }

  // Crear nuevo usuario
  const crearUsuario = async () => {
    if (!formNuevo.nombre || !formNuevo.email || !formNuevo.password) return alert('Completá todos los campos')
    if (formNuevo.password.length < 6) return alert('La contraseña debe tener al menos 6 caracteres')
    setCreando(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ accion: 'crear', ...formNuevo }),
      })
      const json = await res.json()
      if (json.ok) {
        setFormNuevo({ nombre:'', email:'', password:'', rol:'coordinadora', color:'#652f8d' })
        await cargarUsuarios()
        setMsg({ tipo:'ok', texto:'✓ Usuario creado correctamente' })
        logActivity('Creó usuario', 'Permisos', formNuevo.nombre)
      } else {
        alert(json.error || 'Error al crear usuario')
      }
    } catch { alert('Error de conexión') }
    setCreando(false)
    setTimeout(() => setMsg(null), 4000)
  }

  const toggleActivo = async (u: any) => {
    const sb = createClient()
    await sb.from('usuarios').update({ activo: !u.activo }).eq('id', u.id)
    await cargarUsuarios()
    logActivity(u.activo ? 'Desactivó usuario' : 'Activó usuario', 'Permisos', u.nombre)
  }

  const cambiarPassword = async () => {
    if (!modalPwd || nuevaPwd.length < 6) return alert('Mínimo 6 caracteres')
    setCambiandoPwd(true)
    try {
      const res = await fetch('/api/usuarios', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({ accion: 'cambiar_password', user_id: modalPwd.id, nueva_password: nuevaPwd }),
      })
      const json = await res.json()
      if (json.ok) {
        setModalPwd(null); setNuevaPwd('')
        setMsg({ tipo:'ok', texto:'✓ Contraseña actualizada' })
      } else {
        alert(json.error || 'Error al cambiar contraseña')
      }
    } catch { alert('Error de conexión') }
    setCambiandoPwd(false)
    setTimeout(() => setMsg(null), 4000)
  }

  if (!esDirector) return null

  const usuarioSel = usuarios.find(u => u.id === selUsuarioId)

  const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

  return (
    <div className="fade-in">

      {/* Encabezado + tabs de vista */}
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'18px',flexWrap:'wrap',gap:'8px'}}>
        <div>
          <div style={{fontSize:'20px',fontWeight:700}}>Permisos y usuarios</div>
          <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>
            Controlá el acceso de cada usuario a los módulos del sistema
          </div>
        </div>
        <div style={{display:'flex',gap:'6px'}}>
          <TabBtn active={!vistaGestion} onClick={() => { setVistaGestion(false); setSelUsuarioId(null) }}>
            Permisos
          </TabBtn>
          <TabBtn active={vistaGestion}  onClick={() => { setVistaGestion(true);  setSelUsuarioId(null) }}>
            Usuarios
          </TabBtn>
        </div>
      </div>

      {/* Mensaje de feedback */}
      {msg && (
        <div style={{
          padding:'10px 14px', borderRadius:'10px', fontSize:'13px', marginBottom:'14px', fontWeight:500,
          background: msg.tipo==='ok' ? 'var(--greenl)' : 'var(--redl)',
          color:      msg.tipo==='ok' ? 'var(--green)'  : 'var(--red)',
          border:     `1px solid ${msg.tipo==='ok' ? '#a8d8b4' : '#f5c5c5'}`,
        }}>
          {msg.texto}
        </div>
      )}

      {/* ── VISTA PERMISOS ─────────────────────────────────────────────── */}
      {!vistaGestion && (
        <div>
          {/* Lista de usuarios para seleccionar */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',marginBottom:'16px',overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em'}}>
                Seleccioná un usuario para editar sus permisos
              </div>
            </div>
            {loadingUsuarios ? (
              <div style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
            ) : (
              usuarios.filter(u => u.activo).map((u, idx) => {
                const rc   = ROL_COL[u.rol] ?? ROL_COL.profesora
                const isSel = u.id === selUsuarioId
                const tieneCustom = Array.isArray(permisosCustomPorUsuario[u.id]) && (permisosCustomPorUsuario[u.id]?.length ?? 0) > 0

                return (
                  <button key={u.id} onClick={() => seleccionarUsuario(u)}
                    style={{
                      display:'flex', alignItems:'center', gap:'12px',
                      width:'100%', padding:'12px 16px', border:'none',
                      borderBottom: idx < usuarios.filter(x=>x.activo).length-1 ? '1px solid var(--border)' : 'none',
                      background: isSel ? 'var(--vl)' : 'var(--white)',
                      cursor:'pointer', textAlign:'left',
                    }}
                  >
                    {/* Avatar */}
                    <div style={{width:36,height:36,borderRadius:'11px',background:u.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                      {u.initials || u.nombre?.[0]}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'7px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'14px',fontWeight:600,color: isSel ? 'var(--v)' : 'var(--text)'}}>
                          {u.nombre}
                          {u.id === usuario?.id && <span style={{fontSize:'11px',color:'var(--text3)',fontWeight:400}}> (vos)</span>}
                        </span>
                        <span style={{padding:'2px 9px',borderRadius:'20px',fontSize:'11px',fontWeight:600,background:rc.bg,color:rc.color}}>
                          {ROLE_LABELS[u.rol]}
                        </span>
                        {tieneCustom && (
                          <span style={{padding:'2px 8px',borderRadius:'20px',fontSize:'10px',fontWeight:600,background:'var(--amberl)',color:'var(--amber)'}}>
                            permisos editados
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'2px'}}>{u.email}</div>
                    </div>
                    <svg width="14" height="14" viewBox="0 0 20 20" fill="none" stroke={isSel?'var(--v)':'var(--text3)'} strokeWidth="2"><path d="M7 5l5 5-5 5"/></svg>
                  </button>
                )
              })
            )}
          </div>

          {/* Panel de edición de permisos del usuario seleccionado */}
          {usuarioSel && (
            <div style={{background:'var(--white)',border:`1.5px solid ${selUsuarioId ? 'var(--v)' : 'var(--border)'}`,borderRadius:'14px',overflow:'hidden',marginBottom:'14px'}}>

              {/* Encabezado del panel */}
              <div style={{padding:'14px 16px',borderBottom:'1.5px solid var(--border)',background:'var(--vl)',display:'flex',alignItems:'center',justifyContent:'space-between',flexWrap:'wrap',gap:'8px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'10px'}}>
                  <div style={{width:32,height:32,borderRadius:'10px',background:usuarioSel.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'11px',fontWeight:700,color:'#fff',flexShrink:0}}>
                    {usuarioSel.initials || usuarioSel.nombre?.[0]}
                  </div>
                  <div>
                    <div style={{fontSize:'14px',fontWeight:700,color:'var(--v)'}}>{usuarioSel.nombre}</div>
                    <div style={{fontSize:'11px',color:'var(--text3)'}}>{ROLE_LABELS[usuarioSel.rol]} · {permisosEdit.length} módulos activos</div>
                  </div>
                </div>
                <div style={{display:'flex',gap:'6px',flexWrap:'wrap'}}>
                  <button onClick={resetearPermisos} disabled={guardando}
                    style={{padding:'7px 12px',background:'var(--amberl)',color:'var(--amber)',border:'1px solid #e8d080',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                    Restaurar defaults
                  </button>
                  <button onClick={guardarPermisos} disabled={guardando}
                    style={{padding:'7px 14px',background:guardando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'8px',fontSize:'12px',fontWeight:600,cursor:guardando?'not-allowed':'pointer'}}>
                    {guardando ? 'Guardando...' : 'Guardar cambios'}
                  </button>
                </div>
              </div>

              {/* Grilla de módulos */}
              <div style={{padding:'8px 0'}}>
                {TODOS_MODULOS.map((mod, idx) => {
                  const activo     = permisosEdit.includes(mod.id)
                  const esProtegido = usuarioSel.id === usuario?.id && PROTEGIDOS_DIRECTOR.includes(mod.id)

                  return (
                    <div key={mod.id}
                      style={{
                        display:'flex', alignItems:'center', justifyContent:'space-between',
                        padding:'10px 16px', cursor: esProtegido ? 'default' : 'pointer',
                        background: activo ? (idx%2===0?'#fdfbff':'#f9f5fd') : (idx%2===0?'var(--white)':'#fafafa'),
                        borderBottom: idx < TODOS_MODULOS.length-1 ? '1px solid var(--border)' : 'none',
                        opacity: esProtegido ? 0.55 : 1,
                      }}
                      onClick={() => !esProtegido && toggleModulo(mod.id)}
                    >
                      <div style={{flex:1}}>
                        <div style={{fontSize:'13px',fontWeight:600,color: activo ? 'var(--text)' : 'var(--text2)'}}>
                          {mod.label}
                          {esProtegido && <span style={{fontSize:'10px',color:'var(--text3)',marginLeft:'6px',fontWeight:400}}>siempre activo</span>}
                        </div>
                        <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'1px'}}>{mod.desc}</div>
                      </div>
                      {/* Toggle switch */}
                      <div style={{
                        width:42, height:24, borderRadius:12, flexShrink:0, marginLeft:16,
                        background: activo ? 'var(--v)' : 'var(--border)',
                        position:'relative', transition:'background .2s',
                      }}>
                        <div style={{
                          width:18, height:18, borderRadius:'50%', background:'#fff',
                          position:'absolute', top:3,
                          left: activo ? 21 : 3,
                          transition:'left .2s',
                          boxShadow:'0 1px 3px rgba(0,0,0,.2)',
                        }} />
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>
          )}
        </div>
      )}

      {/* ── VISTA GESTIÓN DE USUARIOS ──────────────────────────────────── */}
      {vistaGestion && (
        <div>
          {/* Crear nuevo usuario */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'16px',marginBottom:'16px'}}>
            <div style={{fontSize:'14px',fontWeight:700,marginBottom:'14px'}}>Crear nuevo usuario</div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <div>
                <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Nombre completo</div>
                <input style={IS} value={formNuevo.nombre} onChange={e=>setFormNuevo(f=>({...f,nombre:e.target.value}))} placeholder="Ana García" />
              </div>
              <div>
                <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Email</div>
                <input style={IS} type="email" value={formNuevo.email} onChange={e=>setFormNuevo(f=>({...f,email:e.target.value}))} placeholder="ana@instituto.com" />
              </div>
              <div>
                <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Contraseña inicial</div>
                <input style={IS} type="password" value={formNuevo.password} onChange={e=>setFormNuevo(f=>({...f,password:e.target.value}))} placeholder="Mínimo 6 caracteres" />
              </div>
              <div>
                <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>Rol</div>
                <select style={IS} value={formNuevo.rol} onChange={e=>setFormNuevo(f=>({...f,rol:e.target.value}))}>
                  <option value="coordinadora">Coordinadora</option>
                  <option value="secretaria">Secretaria</option>
                  <option value="profesora">Profesora</option>
                  <option value="director">Director</option>
                </select>
              </div>
            </div>
            <button onClick={crearUsuario} disabled={creando}
              style={{width:'100%',padding:'11px',background:creando?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:creando?'not-allowed':'pointer'}}>
              {creando ? 'Creando...' : '+ Crear usuario'}
            </button>
          </div>

          {/* Lista de usuarios */}
          <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',overflow:'hidden'}}>
            <div style={{padding:'12px 16px',borderBottom:'1px solid var(--border)',background:'var(--bg)'}}>
              <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.06em'}}>
                Usuarios del sistema ({usuarios.length})
              </div>
            </div>
            {loadingUsuarios ? (
              <div style={{padding:'24px',textAlign:'center',color:'var(--text3)'}}>Cargando...</div>
            ) : (
              usuarios.map((u, idx) => {
                const rc = ROL_COL[u.rol] ?? ROL_COL.profesora
                return (
                  <div key={u.id} style={{
                    display:'flex', alignItems:'center', gap:'12px', padding:'12px 16px',
                    borderBottom: idx<usuarios.length-1?'1px solid var(--border)':'none',
                    opacity: u.activo ? 1 : 0.5,
                  }}>
                    <div style={{width:36,height:36,borderRadius:'11px',background:u.color||'#652f8d',display:'flex',alignItems:'center',justifyContent:'center',fontSize:'12px',fontWeight:700,color:'#fff',flexShrink:0}}>
                      {u.initials || u.nombre?.[0]}
                    </div>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{display:'flex',alignItems:'center',gap:'6px',flexWrap:'wrap'}}>
                        <span style={{fontSize:'13px',fontWeight:600}}>{u.nombre}</span>
                        <span style={{padding:'2px 8px',borderRadius:'20px',fontSize:'10px',fontWeight:600,background:rc.bg,color:rc.color}}>
                          {ROLE_LABELS[u.rol]}
                        </span>
                        {!u.activo && (
                          <span style={{padding:'2px 8px',borderRadius:'20px',fontSize:'10px',fontWeight:600,background:'var(--redl)',color:'var(--red)'}}>
                            Inactivo
                          </span>
                        )}
                      </div>
                      <div style={{fontSize:'11px',color:'var(--text3)',marginTop:'1px'}}>{u.email}</div>
                    </div>
                    {/* Acciones — no se puede modificar al director actual */}
                    {u.id !== usuario?.id && (
                      <div style={{display:'flex',gap:'6px',flexShrink:0}}>
                        <button onClick={() => { setModalPwd({id:u.id,nombre:u.nombre}); setNuevaPwd('') }}
                          style={{padding:'6px 10px',background:'var(--bg)',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer',color:'var(--text2)'}}>
                          Contraseña
                        </button>
                        <button onClick={() => toggleActivo(u)}
                          style={{padding:'6px 10px',background:u.activo?'var(--redl)':'var(--greenl)',border:`1px solid ${u.activo?'#f5c5c5':'#a8d8b4'}`,borderRadius:'8px',fontSize:'11px',fontWeight:600,cursor:'pointer',color:u.activo?'var(--red)':'var(--green)'}}>
                          {u.activo ? 'Desactivar' : 'Activar'}
                        </button>
                      </div>
                    )}
                  </div>
                )
              })
            )}
          </div>
        </div>
      )}

      {/* MODAL CAMBIO DE CONTRASEÑA */}
      {modalPwd && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}}
          onClick={e=>{if(e.target===e.currentTarget){setModalPwd(null);setNuevaPwd('')}}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}}/>
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'4px'}}>Cambiar contraseña</div>
            <div style={{fontSize:'13px',color:'var(--text3)',marginBottom:'16px'}}>{modalPwd.nombre}</div>
            <div style={{marginBottom:'16px'}}>
              <div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'4px'}}>Nueva contraseña</div>
              <input style={IS} type="password" value={nuevaPwd} onChange={e=>setNuevaPwd(e.target.value)} placeholder="Mínimo 6 caracteres" autoFocus />
            </div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={()=>{setModalPwd(null);setNuevaPwd('')}}
                style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>
                Cancelar
              </button>
              <button onClick={cambiarPassword} disabled={cambiandoPwd||nuevaPwd.length<6}
                style={{flex:2,padding:'12px',background:cambiandoPwd||nuevaPwd.length<6?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:cambiandoPwd||nuevaPwd.length<6?'not-allowed':'pointer'}}>
                {cambiandoPwd?'Guardando...':'Actualizar contraseña'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

const TabBtn = ({children,active,onClick}:any) =>
  <button onClick={onClick} style={{padding:'9px 16px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:active?'var(--v)':'var(--border)',background:active?'var(--v)':'var(--white)',color:active?'#fff':'var(--text2)'}}>
    {children}
  </button>
