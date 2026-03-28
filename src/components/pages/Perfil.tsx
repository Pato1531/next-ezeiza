'use client'
import { useState, useEffect } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient } from '@/lib/supabase'

const ROLES = ['director','coordinadora','secretaria','profesora'] as const
const ROLE_LABELS: Record<string,string> = {
  director:'Director', coordinadora:'Coordinadora', secretaria:'Secretaria', profesora:'Profesora'
}
const PERMISOS_MAP: Record<string,string[]> = {
  director:     ['dashboard','profesoras','alumnos','cursos','horarios','reportes','permisos','perfil'],
  coordinadora: ['dashboard','profesoras','alumnos','cursos','horarios','perfil'],
  secretaria:   ['dashboard','alumnos','cursos','horarios','perfil'],
  profesora:    ['alumnos','cursos','horarios','perfil'],
}
const PAGE_LABELS: Record<string,string> = {
  dashboard:'Dashboard', profesoras:'Profesoras', alumnos:'Alumnos',
  cursos:'Cursos', horarios:'Horarios', reportes:'Reportes', permisos:'Permisos', perfil:'Perfil'
}
const ROL_COL: Record<string,{bg:string,color:string}> = {
  director:     {bg:'#f2e8f9',color:'#652f8d'},
  coordinadora: {bg:'#E0F0F7',color:'#1a6b8a'},
  secretaria:   {bg:'#E0F0F7',color:'#1a6b8a'},
  profesora:    {bg:'#f1eef8',color:'#5a4d6a'},
}
const COLORES_AV = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#1B6B4A','#7d3aab','#5C2D6B']

type Vista = 'perfil' | 'usuarios' | 'edit_usuario' | 'nuevo_usuario'

export default function Perfil() {
  const { usuario, logout } = useAuth()
  const [vista, setVista] = useState<Vista>('perfil')
  const [usuarios, setUsuarios] = useState<any[]>([])
  const [loadingU, setLoadingU] = useState(false)
  const [selUser, setSelUser] = useState<any>(null)
  const [form, setForm] = useState<any>(null)
  const [guardando, setGuardando] = useState(false)
  const [nuevaClave, setNuevaClave] = useState('')
  const [confirmClave, setConfirmClave] = useState('')
  const [msgClave, setMsgClave] = useState('')
  const [confirmDelete, setConfirmDelete] = useState(false)

  const puedeGestionar = usuario?.rol === 'director' || usuario?.rol === 'secretaria'

  useEffect(() => {
    if (vista === 'usuarios' && puedeGestionar) cargarUsuarios()
  }, [vista])

  const cargarUsuarios = async () => {
    setLoadingU(true)
    const sb = createClient()
    const { data } = await sb.from('usuarios').select('*').order('nombre')
    setUsuarios(data || [])
    setLoadingU(false)
  }

  const irAEditUser = (u: any) => {
    setSelUser(u)
    setForm({ nombre: u.nombre, rol: u.rol, color: u.color, initials: u.initials })
    setNuevaClave('')
    setConfirmClave('')
    setMsgClave('')
    setVista('edit_usuario')
  }

  const irANuevoUser = () => {
    setForm({ nombre:'', rol:'profesora', color: COLORES_AV[usuarios.length % COLORES_AV.length], email:'', clave:'' })
    setVista('nuevo_usuario')
  }

  const callAPI = async (accion: string, datos: any) => {
    const res = await fetch('/api/usuarios', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ accion, ...datos })
    })
    const json = await res.json()
    if (!res.ok) throw new Error(json.error || 'Error desconocido')
    return json
  }

  const guardarUsuario = async () => {
    if (!form?.nombre) return alert('El nombre es obligatorio')
    setGuardando(true)
    try {
      const sb = createClient()
      const initials = form.nombre.split(' ').map((p:string)=>p[0]).join('').toUpperCase().slice(0,2)
      await sb.from('usuarios').update({ nombre: form.nombre, rol: form.rol, color: form.color, initials }).eq('id', selUser.id)
      // Actualizar metadata en Auth también
      await callAPI('actualizar_metadata', { user_id: selUser.id, nombre: form.nombre, rol: form.rol })
      await cargarUsuarios()
      setVista('usuarios')
    } catch(e:any) { alert('Error: ' + e.message) }
    setGuardando(false)
  }

  const cambiarClave = async () => {
    if (!nuevaClave) return setMsgClave('Ingresá la nueva contraseña')
    if (nuevaClave.length < 6) return setMsgClave('Mínimo 6 caracteres')
    if (nuevaClave !== confirmClave) return setMsgClave('Las contraseñas no coinciden')
    setGuardando(true)
    try {
      await callAPI('cambiar_password', { user_id: selUser.id, nueva_password: nuevaClave })
      setMsgClave('✓ Contraseña actualizada correctamente')
      setNuevaClave('')
      setConfirmClave('')
    } catch(e:any) {
      // Fallback SQL si falla la API
      setMsgClave(`Si no funciona, ejecutá en Supabase SQL Editor:\nupdate auth.users set encrypted_password = crypt('${nuevaClave}', gen_salt('bf')) where id = '${selUser.id}';`)
    }
    setGuardando(false)
  }

  const eliminarUsuario = async () => {
    if (!selUser) return
    setGuardando(true)
    try {
      await callAPI('desactivar', { user_id: selUser.id })
      await cargarUsuarios()
      setVista('usuarios')
    } catch(e:any) { alert('Error: ' + e.message) }
    setGuardando(false)
    setConfirmDelete(false)
  }

  const crearUsuario = async () => {
    if (!form?.nombre || !form?.email || !form?.clave) return alert('Nombre, email y contraseña son obligatorios')
    if (form.clave.length < 6) return alert('La contraseña debe tener mínimo 6 caracteres')
    setGuardando(true)
    try {
      await callAPI('crear', {
        email: form.email,
        password: form.clave,
        nombre: form.nombre,
        rol: form.rol,
        color: form.color || '#652f8d'
      })
      await cargarUsuarios()
      setVista('usuarios')
    } catch(e:any) { alert('Error al crear usuario: ' + e.message) }
    setGuardando(false)
  }


  if (!usuario) return null

  const rs = ROL_COL[usuario.rol] ?? ROL_COL.profesora

  // ── PERFIL PROPIO ──
  if (vista === 'perfil') return (
    <div className="fade-in">
      <div style={{background:'var(--vl)',borderRadius:'16px',padding:'20px',marginBottom:'16px'}}>
        <div style={{display:'flex',alignItems:'flex-start',gap:'14px'}}>
          <Av color={usuario.color} size={64}>{usuario.initials}</Av>
          <div style={{flex:1}}>
            <div style={{fontSize:'20px',fontWeight:700}}>{usuario.nombre}</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'3px'}}>{usuario.rol === 'director' ? 'Director del instituto' : ROLE_LABELS[usuario.rol]}</div>
            <div style={{marginTop:'10px'}}>
              <span style={{padding:'5px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:rs.bg,color:rs.color}}>{ROLE_LABELS[usuario.rol]}</span>
            </div>
          </div>
        </div>
      </div>

      <Card>
        <SL style={{marginBottom:'14px'}}>Mi cuenta</SL>
        <FieldRO label="Nombre" value={usuario.nombre} />
        <FieldRO label="Rol" value={ROLE_LABELS[usuario.rol]} />
        <FieldRO label="Módulos disponibles" value={`${PERMISOS_MAP[usuario.rol].length} módulos`} />
      </Card>

      <Card>
        <SL style={{marginBottom:'12px'}}>Módulos con acceso</SL>
        <div style={{display:'flex',flexWrap:'wrap',gap:'8px'}}>
          {PERMISOS_MAP[usuario.rol].map(m => (
            <span key={m} style={{padding:'6px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--vl)',color:'var(--v)'}}>
              {PAGE_LABELS[m]||m}
            </span>
          ))}
        </div>
      </Card>

      {puedeGestionar && (
        <button onClick={() => setVista('usuarios')} style={{width:'100%',padding:'14px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'12px',fontSize:'14px',fontWeight:600,cursor:'pointer',marginBottom:'10px',display:'flex',alignItems:'center',justifyContent:'center',gap:'8px'}}>
          <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M10 12a4 4 0 100-8 4 4 0 000 8z"/><path d="M2 18c0-3.3 2.7-6 8-6s8 2.7 8 6"/></svg>
          Gestión de usuarios
        </button>
      )}

      <button onClick={logout} style={{display:'flex',alignItems:'center',gap:'8px',width:'100%',padding:'13px 16px',border:'1.5px solid var(--border)',borderRadius:'12px',background:'var(--white)',cursor:'pointer',fontSize:'14px',fontWeight:500,color:'var(--red)'}}>
        <svg width="18" height="18" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2"><path d="M9 3H5a2 2 0 00-2 2v10a2 2 0 002 2h4"/><path d="M16 10H8M16 10l-3-3M16 10l-3 3"/></svg>
        Cerrar sesión
      </button>
    </div>
  )

  // ── LISTA USUARIOS ──
  if (vista === 'usuarios') return (
    <div className="fade-in">
      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'16px'}}>
        <BtnG sm onClick={() => setVista('perfil')}>← Volver</BtnG>
        {usuario.rol === 'director' && <BtnP sm onClick={irANuevoUser}>+ Nuevo usuario</BtnP>}
      </div>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>Gestión de usuarios</div>

      {loadingU ? <Loader /> : (
        <>
          {ROLES.map(rol => {
            const grupo = usuarios.filter(u => u.rol === rol)
            if (grupo.length === 0) return null
            const rc = ROL_COL[rol]
            return (
              <div key={rol} style={{marginBottom:'20px'}}>
                <div style={{display:'flex',alignItems:'center',gap:'8px',marginBottom:'10px'}}>
                  <span style={{padding:'4px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:700,background:rc.bg,color:rc.color}}>{ROLE_LABELS[rol]}</span>
                  <span style={{fontSize:'12px',color:'var(--text3)'}}>{grupo.length} usuario{grupo.length!==1?'s':''}</span>
                </div>
                {grupo.map(u => (
                  <div key={u.id} onClick={() => irAEditUser(u)} style={{display:'flex',alignItems:'center',gap:'12px',padding:'14px 16px',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',marginBottom:'8px',cursor:'pointer',transition:'all .15s'}}
                    onMouseEnter={e=>(e.currentTarget.style.borderColor='var(--v)')}
                    onMouseLeave={e=>(e.currentTarget.style.borderColor='var(--border)')}>
                    <Av color={u.color||'#652f8d'} size={44}>{u.initials||u.nombre[0]}</Av>
                    <div style={{flex:1,minWidth:0}}>
                      <div style={{fontSize:'15px',fontWeight:600}}>{u.nombre}</div>
                      <div style={{fontSize:'12px',color:'var(--text2)',marginTop:'2px'}}>{ROLE_LABELS[u.rol]}</div>
                    </div>
                    <span style={{padding:'3px 10px',borderRadius:'20px',fontSize:'11px',fontWeight:600,background:u.activo!==false?'var(--greenl)':'var(--redl)',color:u.activo!==false?'var(--green)':'var(--red)'}}>
                      {u.activo!==false?'Activo':'Inactivo'}
                    </span>
                    <Chevron />
                  </div>
                ))}
              </div>
            )
          })}
        </>
      )}
    </div>
  )

  // ── EDITAR USUARIO ──
  if (vista === 'edit_usuario' && selUser) return (
    <div className="fade-in">
      <BtnG sm onClick={() => setVista('usuarios')} style={{marginBottom:'20px'}}>← Volver</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>Editar usuario</div>

      {/* Info básica */}
      <Card>
        <SL style={{marginBottom:'14px'}}>Datos del usuario</SL>
        <Field2 label="Nombre completo">
          <Input value={form?.nombre||''} onChange={v=>setForm({...form,nombre:v})} />
        </Field2>
        {usuario.rol === 'director' && (
          <Field2 label="Rol">
            <select style={IS} value={form?.rol||'profesora'} onChange={e=>setForm({...form,rol:e.target.value})}>
              {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
            </select>
          </Field2>
        )}
        <Field2 label="Color de avatar">
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'4px'}}>
            {COLORES_AV.map(c => (
              <button key={c} type="button" onClick={() => setForm({...form,color:c})} style={{width:'36px',height:'36px',borderRadius:'10px',background:c,border:form?.color===c?'3px solid var(--text)':'3px solid transparent',cursor:'pointer',transition:'all .15s'}} />
            ))}
          </div>
        </Field2>
        <div style={{marginTop:'8px',display:'flex',gap:'10px'}}>
          <BtnG style={{flex:1}} onClick={() => setVista('usuarios')}>Cancelar</BtnG>
          <BtnP style={{flex:2}} onClick={guardarUsuario} disabled={guardando}>{guardando?'Guardando...':'Guardar cambios'}</BtnP>
        </div>
      </Card>

      {/* Vista previa */}
      <Card>
        <SL style={{marginBottom:'12px'}}>Vista previa</SL>
        <div style={{display:'flex',alignItems:'center',gap:'12px',padding:'12px',background:'var(--bg)',borderRadius:'12px'}}>
          <Av color={form?.color||'#652f8d'} size={44}>
            {form?.nombre?.split(' ').map((p:string)=>p[0]).join('').toUpperCase().slice(0,2)||'??'}
          </Av>
          <div>
            <div style={{fontWeight:600,fontSize:'15px'}}>{form?.nombre||'Nombre'}</div>
            <div style={{fontSize:'12px',color:'var(--text2)'}}>{ROLE_LABELS[form?.rol]||'—'}</div>
          </div>
          <span style={{marginLeft:'auto',padding:'4px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,...ROL_COL[form?.rol||'profesora']}}>{ROLE_LABELS[form?.rol]}</span>
        </div>
      </Card>

      {/* Módulos según rol */}
      {usuario.rol === 'director' && (
        <Card>
          <SL style={{marginBottom:'12px'}}>Módulos con acceso ({form?.rol})</SL>
          <div style={{display:'flex',flexWrap:'wrap',gap:'6px'}}>
            {PERMISOS_MAP[form?.rol||'profesora'].map(m => (
              <span key={m} style={{padding:'5px 12px',borderRadius:'20px',fontSize:'12px',fontWeight:600,background:'var(--vl)',color:'var(--v)'}}>{PAGE_LABELS[m]}</span>
            ))}
          </div>
          <div style={{marginTop:'10px',fontSize:'12px',color:'var(--text3)'}}>Los módulos se asignan automáticamente según el rol seleccionado.</div>
        </Card>
      )}

      {/* Cambio de contraseña */}
      <Card>
        <SL style={{marginBottom:'14px'}}>Cambiar contraseña</SL>
        <Field2 label="Nueva contraseña">
          <input type="password" value={nuevaClave} onChange={e=>setNuevaClave(e.target.value)} style={IS} placeholder="Mínimo 6 caracteres" />
        </Field2>
        <Field2 label="Confirmar contraseña">
          <input type="password" value={confirmClave} onChange={e=>setConfirmClave(e.target.value)} style={IS} placeholder="Repetí la contraseña" />
        </Field2>
        {msgClave && (
          <div style={{padding:'10px 12px',borderRadius:'10px',fontSize:'13px',marginBottom:'10px',whiteSpace:'pre-wrap',
            background:msgClave.startsWith('✓')?'var(--greenl)':msgClave.includes('update')?'#1a1020':'var(--redl)',
            color:msgClave.startsWith('✓')?'var(--green)':msgClave.includes('update')?'#86efac':'var(--red)',
            fontFamily:msgClave.includes('update')?'monospace':'inherit',fontSize:msgClave.includes('update')?'11px':'13px'}}>
            {msgClave}
          </div>
        )}
        <BtnP onClick={cambiarClave} disabled={guardando} style={{width:'100%'}}>{guardando?'Actualizando...':'Actualizar contraseña'}</BtnP>
        <div style={{marginTop:'10px',fontSize:'12px',color:'var(--text3)',lineHeight:1.5}}>
          Si el botón no funciona, copiá y ejecutá el SQL que aparece en Supabase → SQL Editor.
        </div>
      </Card>

      {/* Zona peligrosa */}
      {usuario.rol === 'director' && selUser.id !== usuario.id && (
        <div style={{border:'1.5px solid #f5c5c5',borderRadius:'16px',padding:'18px',marginBottom:'14px'}}>
          <SL style={{marginBottom:'10px',color:'var(--red)'}}>Zona de riesgo</SL>
          <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'12px'}}>Desactivar este usuario le impide ingresar al sistema.</div>
          <button onClick={() => setConfirmDelete(true)} style={{padding:'10px 18px',background:'var(--redl)',color:'var(--red)',border:'1.5px solid #f5c5c5',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>
            Desactivar usuario
          </button>
          {confirmDelete && (
            <div style={{marginTop:'14px',padding:'14px',background:'var(--redl)',borderRadius:'12px'}}>
              <div style={{fontSize:'14px',fontWeight:600,color:'var(--red)',marginBottom:'10px'}}>¿Confirmar desactivación?</div>
              <div style={{display:'flex',gap:'8px'}}>
                <BtnG style={{flex:1}} onClick={() => setConfirmDelete(false)}>Cancelar</BtnG>
                <button onClick={eliminarUsuario} style={{flex:1,padding:'10px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'13px',fontWeight:600,cursor:'pointer'}}>Confirmar</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  )

  // ── NUEVO USUARIO ──
  if (vista === 'nuevo_usuario') return (
    <div className="fade-in">
      <BtnG sm onClick={() => setVista('usuarios')} style={{marginBottom:'20px'}}>← Volver</BtnG>
      <div style={{fontSize:'20px',fontWeight:700,marginBottom:'20px'}}>Nuevo usuario</div>

      <Card>
        <Field2 label="Nombre completo"><Input value={form?.nombre||''} onChange={v=>setForm({...form,nombre:v})} /></Field2>
        <Field2 label="Email (será el usuario de acceso)"><Input type="email" value={form?.email||''} onChange={v=>setForm({...form,email:v})} placeholder="nombre@nextezeiza.edu" /></Field2>
        <Field2 label="Contraseña inicial">
          <input type="password" value={form?.clave||''} onChange={e=>setForm({...form,clave:e.target.value})} style={IS} placeholder="Mínimo 6 caracteres" />
        </Field2>
        <Field2 label="Rol">
          <select style={IS} value={form?.rol||'profesora'} onChange={e=>setForm({...form,rol:e.target.value})}>
            {ROLES.map(r=><option key={r} value={r}>{ROLE_LABELS[r]}</option>)}
          </select>
        </Field2>
        <Field2 label="Color de avatar">
          <div style={{display:'flex',gap:'8px',flexWrap:'wrap',marginTop:'4px'}}>
            {COLORES_AV.map(c => (
              <button key={c} type="button" onClick={() => setForm({...form,color:c})} style={{width:'36px',height:'36px',borderRadius:'10px',background:c,border:form?.color===c?'3px solid var(--text)':'3px solid transparent',cursor:'pointer'}} />
            ))}
          </div>
        </Field2>

        <div style={{display:'flex',gap:'10px',marginTop:'8px'}}>
          <BtnG style={{flex:1}} onClick={() => setVista('usuarios')}>Cancelar</BtnG>
          <BtnP style={{flex:2}} onClick={crearUsuario} disabled={guardando}>
            {guardando ? 'Creando usuario...' : 'Crear usuario'}
          </BtnP>
        </div>
      </Card>
    </div>
  )

  return null
}

// helpers
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const
const Input = ({value,onChange,type='text',placeholder=''}:any) => <input type={type} value={value} placeholder={placeholder} onChange={(e:any)=>onChange(e.target.value)} style={IS} />
const Loader = () => <div style={{color:'var(--text3)',padding:'24px',textAlign:'center'}}>Cargando...</div>
const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const BtnG = ({children,sm,onClick,style}:any) => <button onClick={onClick} style={{padding:sm?'9px 14px':'12px 20px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:'pointer',...style}}>{children}</button>
const Av = ({color,size,children}:any) => <div style={{width:size,height:size,borderRadius:Math.round(size*.32)+'px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:size*.28+'px',fontWeight:700,color:'#fff',flexShrink:0}}>{children}</div>
const Card = ({children}:any) => <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'16px',padding:'18px',marginBottom:'14px'}}>{children}</div>
const Field2 = ({label,children}:any) => <div style={{marginBottom:'11px'}}><div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>{label}</div>{children}</div>
const FieldRO = ({label,value}:any) => <Field2 label={label}><div style={{padding:'8px 11px',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'13px',background:'var(--bg)',color:'var(--text2)'}}>{value}</div></Field2>
const Chevron = () => <svg width="16" height="16" viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><path d="M7 5l5 5-5 5"/></svg>
