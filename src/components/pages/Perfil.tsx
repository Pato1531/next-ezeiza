'use client'

import { useState } from 'react'
import { useAuth } from '@/lib/auth-context'
import { supabase, PERMISOS } from '@/lib/supabase'

// Labels legibles para cada módulo del sistema
const LABEL_MODULOS: Record<string, string> = {
  dashboard:           'Dashboard',
  alumnos:             'Alumnos',
  cursos:              'Cursos',
  horarios:            'Horarios',
  docentes:            'Docentes',
  reportes:            'Reportes',
  permisos:            'Permisos',
  perfil:              'Perfil',
  comunicados:         'Comunicados',
  agenda:              'Agenda',
  actividad:           'Actividad',
  'atencion al cliente': 'Atención al cliente',
}

export default function Perfil() {
  const { usuario } = useAuth()

  // ── Estado: cambio de contraseña ─────────────────────────────────────────
  const [passData, setPassData] = useState({ nueva: '', confirmar: '' })
  const [passMsg,  setPassMsg]  = useState<{ tipo: 'ok' | 'error'; texto: string } | null>(null)
  const [passLoading, setPassLoading] = useState(false)
  const [mostrarPass, setMostrarPass] = useState(false)

  if (!usuario) return null

  // Módulos del rol actual leídos desde PERMISOS (fuente de verdad)
  const modulosDelRol: string[] = usuario.rol
    ? ((PERMISOS as Record<string, string[]>)[usuario.rol] ?? [])
    : []

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

      {/* ── Cabecera de perfil ── */}
      <div style={s.heroCard}>
        <div style={{ ...s.avatar, background: usuario.color || '#652f8d' }}>
          {usuario.initials || usuario.nombre.slice(0, 2).toUpperCase()}
        </div>
        <div>
          <h2 style={s.heroNombre}>{usuario.nombre}</h2>
          <p  style={s.heroRol}>
            {usuario.rol === 'director'      ? 'Director del instituto'   :
             usuario.rol === 'coordinadora'  ? 'Coordinadora'             :
             usuario.rol === 'secretaria'    ? 'Secretaria'               :
             usuario.rol === 'profesora'     ? 'Docente'                  : usuario.rol}
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

      {/* ── Módulos con acceso ── */}
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
          <button onClick={() => { setMostrarPass(true); setPassMsg(null) }} style={s.btnOutline}>
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
                onClick={() => { setMostrarPass(false); setPassMsg(null); setPassData({ nueva: '', confirmar: '' }) }}
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

    </div>
  )
}

// ── Estilos ──────────────────────────────────────────────────────────────────
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
    textTransform: 'capitalize' as const,
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
  field: {
    marginBottom: '14px',
  },
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
  // FIX PRINCIPAL: flex-wrap para que se vean todos los módulos
  modulosGrid: {
    display: 'flex',
    flexWrap: 'wrap' as const,
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
    whiteSpace: 'nowrap' as const,
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
  } as React.CSSProperties,
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
