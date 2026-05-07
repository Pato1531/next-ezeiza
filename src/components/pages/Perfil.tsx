'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient, PERMISOS } from '@/lib/supabase'
import { apiHeaders } from '@/lib/hooks'

const LABEL_MODULOS: Record<string, string> = {
  dashboard:             'Dashboard',
  alumnos:               'Alumnos',
  cursos:                'Cursos',
  horarios:              'Horarios',
  docentes:              'Docentes',
  profesoras:            'Docentes',
  reportes:              'Reportes',
  permisos:              'Permisos',
  perfil:                'Perfil',
  comunicados:           'Comunicados',
  agenda:                'Agenda',
  actividad:             'Actividad',
  'atencion al cliente': 'Atención al cliente',
  atencion:              'Atención al cliente',
}

export default function Perfil() {
  const { usuario } = useAuth()
  const supabase = createClient()

  // ── Estado: cambio de contraseña ─────────────────────────────────────────
  const [passData,    setPassData]    = useState({ nueva: '', confirmar: '' })
  const [passMsg,     setPassMsg]     = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [passLoading, setPassLoading] = useState(false)
  const [mostrarPass, setMostrarPass] = useState(false)

  // ── Estado: cerrar sesión ────────────────────────────────────────────────
  const [cerrando, setCerrando] = useState(false)

  if (!usuario) return null

  // Módulos del rol actual leídos desde PERMISOS
  const modulosDelRol: string[] = usuario.rol
    ? ((PERMISOS as Record<string, string[]>)[usuario.rol] ?? [])
    : []

  // ── Cerrar sesión ────────────────────────────────────────────────────────
  async function cerrarSesion() {
    setCerrando(true)
    try {
      localStorage.removeItem('ne_session_uid')
      sessionStorage.removeItem('nav_page')
    } catch {}
    await supabase.auth.signOut()
    // El auth-context detecta el signOut y muestra LoginPage automáticamente
  }

  // ── Cambiar contraseña ───────────────────────────────────────────────────
  async function cambiarPassword(e: React.FormEvent) {
    e.preventDefault()
    setPassMsg(null)

    if (passData.nueva.length < 8) {
      setPassMsg({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres.' })
      return
    }
    if (passData.nueva !== passData.confirmar) {
      setPassMsg({ tipo: 'error', texto: 'Las contraseñas no coinciden.' })
      return
    }
    setPassLoading(true)
    const { error } = await supabase.auth.updateUser({ password: passData.nueva })
    setPassLoading(false)

    if (error) {
      setPassMsg({ tipo: 'error', texto: 'No se pudo actualizar: ' + error.message })
    } else {
      setPassMsg({ tipo: 'ok', texto: '✓ Contraseña actualizada correctamente.' })
      setPassData({ nueva: '', confirmar: '' })
      setMostrarPass(false)
    }
  }

  return (
    <div style={s.page}>

      {/* ── Cabecera ── */}
      <div style={s.heroCard}>
        <div style={{ ...s.avatar, background: usuario.color || '#652f8d' }}>
          {usuario.initials || usuario.nombre.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h2 style={s.heroNombre}>{usuario.nombre}</h2>
          <p style={s.heroRol}>
            {usuario.rol === 'director'     ? 'Director del instituto' :
             usuario.rol === 'coordinadora' ? 'Coordinadora'          :
             usuario.rol === 'secretaria'   ? 'Secretaria'            :
             usuario.rol === 'profesora'    ? 'Docente'               : usuario.rol}
          </p>
          <span style={s.rolChip}>{usuario.rol}</span>
        </div>
      </div>

      {/* ── Mi cuenta ── */}
      <div style={s.section}>
        <p style={s.sectionLabel}>MI CUENTA</p>
        <div style={s.field}>
          <label style={s.fieldLabel}>NOMBRE</label>
          <div style={s.fieldValue}>{usuario.nombre}</div>
        </div>
        <div style={s.field}>
          <label style={s.fieldLabel}>EMAIL</label>
          <div style={s.fieldValue}>{usuario.email || '—'}</div>
        </div>
        <div style={s.field}>
          <label style={s.fieldLabel}>ROL</label>
          <div style={s.fieldValue}>{usuario.rol}</div>
        </div>
      </div>

      {/* ── Módulos con acceso — FIX: flex-wrap ── */}
      <div style={s.section}>
        <p style={s.sectionLabel}>MÓDULOS CON ACCESO</p>
        <div style={s.modulosGrid}>
          {modulosDelRol.map(mod => (
            <span key={mod} style={s.moduloChip}>
              {LABEL_MODULOS[mod] ?? mod}
            </span>
          ))}
        </div>
        <p style={s.modulosCount}>
          {modulosDelRol.length} módulos disponibles para el rol <strong>{usuario.rol}</strong>
        </p>
      </div>

      {/* ── Cambiar contraseña ── */}
      <div style={s.section}>
        <p style={s.sectionLabel}>SEGURIDAD</p>

        {!mostrarPass ? (
          <button
            onClick={() => { setMostrarPass(true); setPassMsg(null) }}
            style={s.btnOutline}
          >
            Cambiar contraseña
          </button>
        ) : (
          <form onSubmit={cambiarPassword}>
            <div style={s.field}>
              <label style={s.fieldLabel}>NUEVA CONTRASEÑA</label>
              <input
                type="password"
                value={passData.nueva}
                onChange={e => setPassData(p => ({ ...p, nueva: e.target.value }))}
                placeholder="Mínimo 8 caracteres"
                style={s.input}
                autoFocus
              />
            </div>
            <div style={s.field}>
              <label style={s.fieldLabel}>CONFIRMAR CONTRASEÑA</label>
              <input
                type="password"
                value={passData.confirmar}
                onChange={e => setPassData(p => ({ ...p, confirmar: e.target.value }))}
                placeholder="Repetí la nueva contraseña"
                style={s.input}
              />
            </div>
            {passMsg && (
              <div style={{
                ...s.msgBox,
                background: passMsg.tipo === 'ok' ? 'var(--greenl)' : 'var(--redl)',
                color:      passMsg.tipo === 'ok' ? 'var(--green)'  : 'var(--red)',
              }}>
                {passMsg.texto}
              </div>
            )}
            <div style={{ display: 'flex', gap: '10px' }}>
              <button type="submit" disabled={passLoading} style={{ ...s.btnPrimary, flex: 1 }}>
                {passLoading ? 'Guardando...' : 'Actualizar contraseña'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setMostrarPass(false)
                  setPassMsg(null)
                  setPassData({ nueva: '', confirmar: '' })
                }}
                style={s.btnCancel}
              >
                Cancelar
              </button>
            </div>
          </form>
        )}

        <p style={s.securityHint}>
          También podés recuperar tu contraseña desde la pantalla de inicio de sesión si la olvidás.
        </p>
      </div>

      {/* ── Firma digital (solo director) ── */}
      {usuario.rol === 'director' && (
        <FirmaDigital institutoId={usuario.instituto_id} />
      )}

      {/* ── Accesos de usuarios (solo director) ── */}
      {usuario.rol === 'director' && (
        <AccesosUsuarios institutoId={usuario.instituto_id} />
      )}

      {/* ── Cerrar sesión ── */}
      <div style={s.section}>
        <button
          onClick={cerrarSesion}
          disabled={cerrando}
          style={s.btnCerrarSesion}
        >
          {cerrando ? 'Cerrando sesión...' : 'Cerrar sesión'}
        </button>
      </div>

    </div>
  )
}

// ── Componente FirmaDigital ──────────────────────────────────────────────────
function FirmaDigital({ institutoId }: { institutoId: string }) {
  const sb = createClient()
  const [firmaUrl, setFirmaUrl] = useState<string>('')
  const [subiendo, setSubiendo] = useState(false)
  const [msg, setMsg] = useState<{tipo:'ok'|'error', texto:string}|null>(null)
  const inputRef = useRef<HTMLInputElement>(null)

  useEffect(() => {
    if (!institutoId) return
    sb.from('institutos').select('firma_director_url').eq('id', institutoId).single()
      .then(({ data }) => { if (data?.firma_director_url) setFirmaUrl(data.firma_director_url) })
  }, [institutoId])

  const subirFirma = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (!file) return
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(file.type)) {
      setMsg({ tipo:'error', texto:'Solo se aceptan imágenes PNG, JPG o WEBP' }); return
    }
    if (file.size > 1024 * 1024) {
      setMsg({ tipo:'error', texto:'La imagen no puede superar 1MB' }); return
    }
    setSubiendo(true)
    setMsg(null)
    try {
      // Subir al bucket 'firmas' de Supabase Storage
      const ext   = file.name.split('.').pop()
      const path  = `${institutoId}/firma_director.${ext}`
      const { error: upErr } = await sb.storage.from('firmas').upload(path, file, {
        upsert: true, contentType: file.type
      })
      if (upErr) throw new Error(upErr.message)
      // Obtener URL pública
      const { data: urlData } = sb.storage.from('firmas').getPublicUrl(path)
      const url = urlData.publicUrl + '?t=' + Date.now() // cache-bust
      // Guardar en institutos
      const { error: dbErr } = await sb.from('institutos')
        .update({ firma_director_url: url }).eq('id', institutoId)
      if (dbErr) throw new Error(dbErr.message)
      setFirmaUrl(url)
      setMsg({ tipo:'ok', texto:'✓ Firma actualizada correctamente' })
    } catch (e: any) {
      setMsg({ tipo:'error', texto: e.message || 'Error al subir la firma' })
    }
    setSubiendo(false)
  }

  const eliminarFirma = async () => {
    if (!confirm('¿Eliminar la firma digital?')) return
    await sb.from('institutos').update({ firma_director_url: null }).eq('id', institutoId)
    setFirmaUrl('')
    setMsg({ tipo:'ok', texto:'Firma eliminada' })
  }

  return (
    <div style={{ background:'var(--white)', border:'1.5px solid var(--border)', borderRadius:'16px', padding:'20px', marginBottom:'14px' }}>
      <div style={{ fontSize:'13px', fontWeight:700, color:'var(--text3)', textTransform:'uppercase', letterSpacing:'.05em', marginBottom:'14px' }}>
        Firma digital
      </div>
      <div style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'14px', lineHeight:1.5 }}>
        Se usa en boletines y certificados. Recomendamos una imagen PNG con fondo transparente.
      </div>

      {/* Preview actual */}
      {firmaUrl && (
        <div style={{ marginBottom:'14px', padding:'16px', background:'var(--bg)', borderRadius:'12px', border:'1.5px solid var(--border)', display:'flex', alignItems:'center', justifyContent:'space-between' }}>
          <img src={firmaUrl} style={{ maxHeight:'60px', maxWidth:'200px', objectFit:'contain' }} alt="Firma actual" />
          <button onClick={eliminarFirma} style={{ padding:'5px 12px', background:'var(--redl)', color:'var(--red)', border:'1px solid #f5c5c5', borderRadius:'8px', fontSize:'12px', fontWeight:600, cursor:'pointer' }}>
            Eliminar
          </button>
        </div>
      )}

      {/* Botón subir */}
      <input ref={inputRef} type="file" accept="image/png,image/jpeg,image/webp" onChange={subirFirma} style={{ display:'none' }} />
      <button
        onClick={() => inputRef.current?.click()}
        disabled={subiendo}
        style={{ width:'100%', padding:'12px', background: firmaUrl ? 'var(--white)' : 'var(--v)', color: firmaUrl ? 'var(--v)' : '#fff', border: '1.5px solid var(--v)', borderRadius:'10px', fontSize:'14px', fontWeight:600, cursor: subiendo ? 'not-allowed' : 'pointer' }}
      >
        {subiendo ? 'Subiendo...' : firmaUrl ? 'Cambiar firma' : '+ Subir firma digital'}
      </button>

      {msg && (
        <div style={{ marginTop:'10px', padding:'10px 14px', borderRadius:'10px', fontSize:'13px', fontWeight:500, background: msg.tipo==='ok' ? 'var(--greenl)' : 'var(--redl)', color: msg.tipo==='ok' ? 'var(--green)' : 'var(--red)' }}>
          {msg.texto}
        </div>
      )}
    </div>
  )
}


// ── Componente AccesosUsuarios ─────────────────────────────────────────────────
const ROLES_OPCIONES = ['profesora', 'secretaria', 'coordinadora']
const LABEL_ROL: Record<string, string> = {
  profesora: 'Profesora / Docente',
  secretaria: 'Secretaria',
  coordinadora: 'Coordinadora',
  director: 'Director',
}

function AccesosUsuarios({ institutoId }: { institutoId: string }) {
  const sb = createClient()
  const IS: React.CSSProperties = {
    width: '100%', padding: '10px 14px', border: '1px solid var(--border)',
    borderRadius: '8px', fontSize: '14px', color: 'var(--text)',
    background: '#fff', outline: 'none', fontFamily: 'inherit', boxSizing: 'border-box',
  }

  // Lista de colaboradores
  const [colaboradores, setColaboradores] = useState<any[]>([])
  const [loadingLista, setLoadingLista] = useState(true)

  // Formulario nuevo usuario
  const [mostrarForm, setMostrarForm] = useState(false)
  const [form, setForm] = useState({ nombre: '', email: '', password: '', rol: 'profesora' })
  const [creando, setCreando] = useState(false)
  const [msg, setMsg] = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)

  // Editar rol
  const [editandoId, setEditandoId] = useState<string | null>(null)
  const [nuevoRol, setNuevoRol] = useState('')

  const cargarColaboradores = useCallback(async () => {
    setLoadingLista(true)
    const { data } = await sb.from('usuarios')
      .select('id, nombre, email, rol, color')
      .eq('instituto_id', institutoId)
      .neq('rol', 'director')
      .order('nombre')
    setColaboradores(data || [])
    setLoadingLista(false)
  }, [institutoId])

  useEffect(() => { cargarColaboradores() }, [cargarColaboradores])

  const crearUsuario = async () => {
    setMsg(null)
    if (!form.nombre.trim() || !form.email.trim() || !form.password.trim()) {
      setMsg({ tipo: 'error', texto: 'Completá todos los campos' }); return
    }
    if (form.password.length < 8) {
      setMsg({ tipo: 'error', texto: 'La contraseña debe tener al menos 8 caracteres' }); return
    }
    setCreando(true)
    try {
      const res = await fetch('/api/admin-crear-usuario', {
        method: 'POST',
        headers: apiHeaders(),
        body: JSON.stringify({
          nombre: form.nombre.trim(),
          email: form.email.trim().toLowerCase(),
          password: form.password,
          rol: form.rol,
          instituto_id: institutoId,
        }),
      })
      const json = await res.json()
      if (json.error) { setMsg({ tipo: 'error', texto: json.error }); setCreando(false); return }

      setMsg({ tipo: 'ok', texto: `✓ Usuario ${form.nombre} creado correctamente` })
      setForm({ nombre: '', email: '', password: '', rol: 'profesora' })
      setMostrarForm(false)
      cargarColaboradores()
    } catch (e: any) {
      setMsg({ tipo: 'error', texto: e.message || 'Error al crear usuario' })
    }
    setCreando(false)
  }

  const cambiarRol = async (userId: string) => {
    await fetch('/api/actualizar-usuario', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ id: userId, datos: { rol: nuevoRol } }),
    })
    setEditandoId(null)
    cargarColaboradores()
  }

  const eliminarUsuario = async (userId: string, nombre: string) => {
    if (!confirm(`¿Eliminar el acceso de ${nombre}? Esta acción no se puede deshacer.`)) return
    await fetch('/api/eliminar-usuario', {
      method: 'POST',
      headers: apiHeaders(),
      body: JSON.stringify({ id: userId }),
    })
    cargarColaboradores()
  }

  const iniciales = (nombre: string) => nombre.trim().split(' ').slice(0, 2).map(p => p[0]).join('').toUpperCase()

  return (
    <div style={{ background: 'var(--white)', border: '1.5px solid var(--border)', borderRadius: '16px', padding: '20px', margin: '0 16px 12px' }}>
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '16px' }}>
        <p style={{ fontSize: '11px', fontWeight: 700, color: 'var(--text3)', letterSpacing: '.07em', margin: 0 }}>
          ACCESOS DE USUARIOS
        </p>
        <button
          onClick={() => { setMostrarForm(v => !v); setMsg(null) }}
          style={{ padding: '6px 14px', background: mostrarForm ? 'transparent' : 'var(--v)', color: mostrarForm ? 'var(--text2)' : '#fff', border: '1.5px solid ' + (mostrarForm ? 'var(--border)' : 'var(--v)'), borderRadius: '20px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>
          {mostrarForm ? 'Cancelar' : '+ Nuevo usuario'}
        </button>
      </div>

      {/* Formulario nuevo usuario */}
      {mostrarForm && (
        <div style={{ background: 'var(--bg)', borderRadius: '12px', padding: '16px', marginBottom: '16px', border: '1px solid var(--border)' }}>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '4px' }}>Nombre completo</div>
            <input style={IS} placeholder="Ej: María González" value={form.nombre} onChange={e => setForm(p => ({ ...p, nombre: e.target.value }))} />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '4px' }}>Email</div>
            <input style={IS} type="email" placeholder="usuario@instituto.edu" value={form.email} onChange={e => setForm(p => ({ ...p, email: e.target.value }))} />
          </div>
          <div style={{ marginBottom: '10px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '4px' }}>Contraseña inicial</div>
            <input style={IS} type="password" placeholder="Mínimo 8 caracteres" value={form.password} onChange={e => setForm(p => ({ ...p, password: e.target.value }))} />
          </div>
          <div style={{ marginBottom: '14px' }}>
            <div style={{ fontSize: '10.5px', fontWeight: 700, color: 'var(--text3)', textTransform: 'uppercase', marginBottom: '4px' }}>Rol</div>
            <select style={IS} value={form.rol} onChange={e => setForm(p => ({ ...p, rol: e.target.value }))}>
              {ROLES_OPCIONES.map(r => <option key={r} value={r}>{LABEL_ROL[r]}</option>)}
            </select>
          </div>
          {msg && (
            <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, marginBottom: '12px', background: msg.tipo === 'ok' ? 'var(--greenl)' : 'var(--redl)', color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>
              {msg.texto}
            </div>
          )}
          <button
            onClick={crearUsuario}
            disabled={creando}
            style={{ width: '100%', padding: '11px', background: 'var(--v)', color: '#fff', border: 'none', borderRadius: '8px', fontSize: '14px', fontWeight: 600, cursor: creando ? 'not-allowed' : 'pointer', fontFamily: 'inherit' }}>
            {creando ? 'Creando...' : 'Crear usuario'}
          </button>
        </div>
      )}

      {/* Mensaje fuera del form */}
      {!mostrarForm && msg && (
        <div style={{ padding: '10px 14px', borderRadius: '8px', fontSize: '13px', fontWeight: 500, marginBottom: '12px', background: msg.tipo === 'ok' ? 'var(--greenl)' : 'var(--redl)', color: msg.tipo === 'ok' ? 'var(--green)' : 'var(--red)' }}>
          {msg.texto}
        </div>
      )}

      {/* Lista de colaboradores */}
      {loadingLista ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '13px' }}>Cargando...</div>
      ) : colaboradores.length === 0 ? (
        <div style={{ textAlign: 'center', padding: '20px', color: 'var(--text3)', fontSize: '13px' }}>
          No hay colaboradores registrados todavía.
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
          {colaboradores.map(u => (
            <div key={u.id} style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px', background: 'var(--bg)', borderRadius: '10px', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                <div style={{ width: 34, height: 34, borderRadius: '8px', background: u.color || '#652f8d', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: '12px', fontWeight: 700, color: '#fff', flexShrink: 0 }}>
                  {iniciales(u.nombre)}
                </div>
                <div>
                  <div style={{ fontSize: '13.5px', fontWeight: 600, color: 'var(--text)' }}>{u.nombre}</div>
                  {editandoId === u.id ? (
                    <div style={{ display: 'flex', gap: '6px', marginTop: '4px' }}>
                      <select
                        value={nuevoRol}
                        onChange={e => setNuevoRol(e.target.value)}
                        style={{ fontSize: '12px', padding: '3px 8px', border: '1px solid var(--v)', borderRadius: '6px', color: 'var(--v)', background: '#fff', fontFamily: 'inherit' }}>
                        {ROLES_OPCIONES.map(r => <option key={r} value={r}>{LABEL_ROL[r]}</option>)}
                      </select>
                      <button onClick={() => cambiarRol(u.id)} style={{ padding: '3px 10px', background: 'var(--v)', color: '#fff', border: 'none', borderRadius: '6px', fontSize: '12px', fontWeight: 600, cursor: 'pointer' }}>✓</button>
                      <button onClick={() => setEditandoId(null)} style={{ padding: '3px 8px', background: 'transparent', color: 'var(--text3)', border: '1px solid var(--border)', borderRadius: '6px', fontSize: '12px', cursor: 'pointer' }}>✕</button>
                    </div>
                  ) : (
                    <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '1px' }}>{LABEL_ROL[u.rol] ?? u.rol}</div>
                  )}
                </div>
              </div>
              {editandoId !== u.id && (
                <div style={{ display: 'flex', gap: '6px' }}>
                  <button
                    onClick={() => { setEditandoId(u.id); setNuevoRol(u.rol) }}
                    style={{ padding: '5px 10px', background: 'var(--vl)', color: 'var(--v)', border: '1px solid var(--v)', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Rol
                  </button>
                  <button
                    onClick={() => eliminarUsuario(u.id, u.nombre)}
                    style={{ padding: '5px 10px', background: 'var(--redl)', color: 'var(--red)', border: '1px solid #fca5a5', borderRadius: '7px', fontSize: '11px', fontWeight: 600, cursor: 'pointer' }}>
                    Baja
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

const s: Record<string, React.CSSProperties> = {
  page: {
    padding: '0 0 80px',
    maxWidth: '600px',
    margin: '0 auto',
  },
  heroCard: {
    background: 'var(--vll)',
    padding: '24px 20px',
    display: 'flex',
    alignItems: 'center',
    gap: '16px',
    marginBottom: '12px',
  },
  avatar: {
    width: '56px',
    height: '56px',
    borderRadius: '14px',
    display: 'flex',
    alignItems: 'center',
    justifyContent: 'center',
    color: '#fff',
    fontSize: '20px',
    fontWeight: 700,
    flexShrink: 0,
  },
  heroNombre: {
    fontSize: '20px',
    fontWeight: 700,
    color: 'var(--text)',
    marginBottom: '2px',
  },
  heroRol: {
    fontSize: '13px',
    color: 'var(--text2)',
    marginBottom: '8px',
  },
  rolChip: {
    display: 'inline-block',
    background: 'var(--v)',
    color: '#fff',
    borderRadius: '20px',
    padding: '3px 12px',
    fontSize: '12px',
    fontWeight: 600,
    textTransform: 'capitalize',
  },
  section: {
    background: '#fff',
    border: '1px solid var(--border)',
    borderRadius: '14px',
    padding: '20px',
    margin: '0 16px 12px',
  },
  sectionLabel: {
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text3)',
    letterSpacing: '.07em',
    marginBottom: '14px',
  },
  field: { marginBottom: '14px' },
  fieldLabel: {
    display: 'block',
    fontSize: '11px',
    fontWeight: 700,
    color: 'var(--text3)',
    letterSpacing: '.06em',
    marginBottom: '5px',
  },
  fieldValue: {
    padding: '10px 14px',
    background: 'var(--bg)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '15px',
    color: 'var(--text)',
  },
  modulosGrid: {
    display: 'flex',
    flexWrap: 'wrap',       // ← FIX: todos los módulos visibles
    gap: '8px',
    marginBottom: '10px',
  },
  moduloChip: {
    background: 'var(--vl)',
    color: 'var(--v)',
    border: '1px solid var(--v)',
    borderRadius: '20px',
    padding: '4px 14px',
    fontSize: '13px',
    fontWeight: 500,
    whiteSpace: 'nowrap',
  },
  modulosCount: {
    fontSize: '12px',
    color: 'var(--text3)',
    marginTop: '4px',
  },
  input: {
    width: '100%',
    padding: '10px 14px',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '15px',
    color: 'var(--text)',
    background: '#fff',
    outline: 'none',
    fontFamily: 'inherit',
  },
  btnPrimary: {
    padding: '11px 16px',
    background: 'var(--v)',
    color: '#fff',
    border: 'none',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnOutline: {
    display: 'block',
    width: '100%',
    padding: '11px',
    background: 'transparent',
    color: 'var(--v)',
    border: '1px solid var(--v)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
    marginBottom: '8px',
  },
  btnCancel: {
    padding: '11px 16px',
    background: 'transparent',
    color: 'var(--text2)',
    border: '1px solid var(--border)',
    borderRadius: '8px',
    fontSize: '14px',
    fontWeight: 500,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  btnCerrarSesion: {
    display: 'block',
    width: '100%',
    padding: '13px',
    background: 'transparent',
    color: 'var(--red)',
    border: '1.5px solid var(--red)',
    borderRadius: '10px',
    fontSize: '15px',
    fontWeight: 600,
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
  msgBox: {
    padding: '10px 14px',
    borderRadius: '8px',
    fontSize: '13px',
    marginBottom: '12px',
    fontWeight: 500,
  },
  securityHint: {
    fontSize: '12px',
    color: 'var(--text3)',
    marginTop: '12px',
    lineHeight: 1.5,
  },
}
