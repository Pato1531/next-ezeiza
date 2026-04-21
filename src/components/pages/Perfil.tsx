'use client'

import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { createClient, PERMISOS } from '@/lib/supabase'

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
