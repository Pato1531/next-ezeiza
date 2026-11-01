import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiHeaders } from '@/lib/hooks'
import { showToast } from '../Toast'
import { COLORES_PREDEFINIDOS, COLOR_MARCA_DEFAULT, aplicarColorMarca } from '@/lib/brand'
import { PLANTILLAS, plantillaDef } from '@/lib/plantillas'

const UMBRAL_MIN = 1
const UMBRAL_MAX = 10
const UMBRAL_DEFAULT = 2
const LOGO_MAX_BYTES = 300 * 1024

const CARD: React.CSSProperties = {
  background: 'var(--white)',
  border: '1.5px solid var(--border)',
  borderRadius: '14px',
  padding: '14px 16px',
}
const SEPARADOR = <div style={{ height: '1px', background: 'var(--border)', margin: '12px 0' }} />
const BTN_SEC: React.CSSProperties = {
  padding: '8px 12px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--white)', fontSize: '13px', fontWeight: 600, cursor: 'pointer', color: 'var(--text2)',
}
const BTN_PRI: React.CSSProperties = {
  padding: '10px 16px', borderRadius: '10px', border: 'none', background: 'var(--v)',
  color: '#fff', fontSize: '13px', fontWeight: 700, cursor: 'pointer',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--border)',
  fontSize: '14px', background: 'var(--white)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box',
}

type Feriado = { id: string; titulo: string; fecha: string }

export default function Personalizaciones() {
  const { usuario, instituto, recargarUsuario } = useAuth()
  const esDirector = usuario?.rol === 'director'
  const puedePlantillas = esDirector || usuario?.rol === 'secretaria'

  const nombreGuardado = instituto?.nombre || ''
  const colorGuardado = instituto?.color_primario || COLOR_MARCA_DEFAULT
  const umbralGuardado = instituto?.umbral_ausencias ?? UMBRAL_DEFAULT
  const logoGuardado = instituto?.logo_url || null
  const plantillasGuardadas: Record<string, string> = ((instituto as any)?.plantillas_whatsapp as Record<string, string>) || {}
  const plantillasKey = JSON.stringify(plantillasGuardadas)

  // Identidad y operativas
  const [nombre, setNombre] = useState(nombreGuardado)
  const [color, setColor] = useState(colorGuardado)
  const [umbral, setUmbral] = useState(umbralGuardado)
  const [guardandoIdent, setGuardandoIdent] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Feriados provinciales
  const anio = new Date().getFullYear()
  const [feriados, setFeriados] = useState<Feriado[]>([])
  const [feriadoFecha, setFeriadoFecha] = useState('')
  const [feriadoTitulo, setFeriadoTitulo] = useState('')
  const [guardandoFeriado, setGuardandoFeriado] = useState(false)

  // Plantillas
  const [abierta, setAbierta] = useState<string | null>(null)
  const [draft, setDraft] = useState<Record<string, string>>({})
  const [guardandoPlant, setGuardandoPlant] = useState(false)

  useEffect(() => {
    setNombre(nombreGuardado)
    setColor(colorGuardado)
    setUmbral(umbralGuardado)
  }, [nombreGuardado, colorGuardado, umbralGuardado])

  useEffect(() => { setDraft({}) }, [plantillasKey])

  const cargarFeriados = async () => {
    if (!esDirector) return
    try {
      const res = await fetch(`/api/feriados-provinciales?anio=${anio}`, { headers: apiHeaders() })
      const json = await res.json()
      if (res.ok) setFeriados(json.data || [])
    } catch {}
  }
  useEffect(() => { cargarFeriados() }, [esDirector, instituto?.id]) // eslint-disable-line react-hooks/exhaustive-deps

  // ── Identidad y operativas ──────────────────────────────────────────────
  const hayIdentCambios =
    nombre.trim() !== nombreGuardado ||
    color.toLowerCase() !== colorGuardado.toLowerCase() ||
    umbral !== umbralGuardado

  const descartarIdent = () => {
    setNombre(nombreGuardado)
    setColor(colorGuardado)
    setUmbral(umbralGuardado)
  }

  const guardarIdentidad = async () => {
    if (!nombre.trim()) { showToast('El nombre del instituto no puede estar vacío', 'warning'); return }
    setGuardandoIdent(true)
    try {
      const res = await fetch('/api/personalizaciones', {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), color_primario: color, umbral_ausencias: umbral }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron guardar los cambios')
      aplicarColorMarca(color)
      await recargarUsuario()
      showToast('Cambios guardados')
    } catch (e: any) {
      showToast(e?.message || 'No se pudieron guardar los cambios', 'error')
    }
    setGuardandoIdent(false)
  }

  // ── Logo ────────────────────────────────────────────────────────────────
  const subirLogo = async (archivo: File) => {
    if (archivo.size > LOGO_MAX_BYTES) { showToast('El logo no puede pesar más de 300 KB', 'warning'); return }
    if (!['image/png', 'image/jpeg', 'image/webp'].includes(archivo.type)) {
      showToast('El logo debe ser PNG, JPG o WEBP', 'warning'); return
    }
    setSubiendoLogo(true)
    try {
      const headers: Record<string, string> = { ...apiHeaders() }
      delete headers['Content-Type']
      const form = new FormData()
      form.append('archivo', archivo)
      const res = await fetch('/api/personalizaciones/logo', { method: 'POST', headers, body: form })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo subir el logo')
      await recargarUsuario()
      showToast('Logo actualizado')
    } catch (e: any) {
      showToast(e?.message || 'No se pudo subir el logo', 'error')
    }
    setSubiendoLogo(false)
    if (fileRef.current) fileRef.current.value = ''
  }

  const quitarLogo = async () => {
    try {
      const res = await fetch('/api/personalizaciones/logo', { method: 'DELETE', headers: apiHeaders() })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo quitar el logo')
      await recargarUsuario()
      showToast('Logo quitado')
    } catch (e: any) {
      showToast(e?.message || 'No se pudo quitar el logo', 'error')
    }
  }

  // ── Feriados provinciales ───────────────────────────────────────────────
  const agregarFeriado = async () => {
    if (!feriadoFecha || !feriadoTitulo.trim()) { showToast('Completá la fecha y el nombre', 'warning'); return }
    setGuardandoFeriado(true)
    try {
      const res = await fetch('/api/feriados-provinciales', {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha: feriadoFecha, titulo: feriadoTitulo }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo guardar el feriado')
      setFeriadoFecha('')
      setFeriadoTitulo('')
      await cargarFeriados()
      showToast('Feriado agregado')
    } catch (e: any) {
      showToast(e?.message || 'No se pudo guardar el feriado', 'error')
    }
    setGuardandoFeriado(false)
  }

  const quitarFeriado = async (id: string) => {
    try {
      const res = await fetch(`/api/feriados-provinciales?id=${encodeURIComponent(id)}`, { method: 'DELETE', headers: apiHeaders() })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudo eliminar el feriado')
      await cargarFeriados()
    } catch (e: any) {
      showToast(e?.message || 'No se pudo eliminar el feriado', 'error')
    }
  }

  // ── Plantillas de WhatsApp ──────────────────────────────────────────────
  const textoActual = (key: string) =>
    draft[key] !== undefined ? draft[key] : (plantillasGuardadas[key] || plantillaDef(key as any).texto)

  // Solo se envían las plantillas que cambiaron respecto de lo guardado.
  const cambiosPlant = Object.keys(draft).filter(k => (draft[k] ?? '') !== (plantillasGuardadas[k] || ''))

  const guardarPlantillas = async () => {
    if (!cambiosPlant.length) return
    const enviar: Record<string, string> = {}
    for (const k of cambiosPlant) enviar[k] = draft[k] ?? ''
    setGuardandoPlant(true)
    try {
      const res = await fetch('/api/plantillas-whatsapp', {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ plantillas: enviar }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron guardar las plantillas')
      setDraft({})
      await recargarUsuario()
      showToast('Plantillas guardadas')
    } catch (e: any) {
      showToast(e?.message || 'No se pudieron guardar las plantillas', 'error')
    }
    setGuardandoPlant(false)
  }

  const colorNombre = COLORES_PREDEFINIDOS.find(c => c.hex.toLowerCase() === color.toLowerCase())?.nombre

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>Personalizaciones</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '2px' }}>
          {esDirector
            ? 'Identidad, reglas y mensajes del instituto. Los cambios los ven todos los usuarios de la sede.'
            : 'Mensajes de WhatsApp del instituto.'}
        </div>
      </div>

      {esDirector && (
        <>
          {/* IDENTIDAD */}
          <div style={CARD}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Identidad</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', margin: '2px 0 12px' }}>
              El nombre, el color y el logo se usan en la app y en los documentos.
            </div>

            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Nombre del instituto</div>
            <input style={INPUT} value={nombre} maxLength={80} onChange={e => setNombre(e.target.value)} />

            {SEPARADOR}

            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Color principal</div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, minmax(0, 1fr))', gap: '8px' }}>
              {COLORES_PREDEFINIDOS.map(c => {
                const seleccionado = c.hex.toLowerCase() === color.toLowerCase()
                return (
                  <button key={c.hex} type="button" onClick={() => setColor(c.hex)} aria-label={c.nombre} aria-pressed={seleccionado}
                    style={{ height: '44px', borderRadius: '10px', background: c.hex, cursor: 'pointer',
                      border: seleccionado ? '3px solid var(--text)' : '1.5px solid var(--border)' }} />
                )
              })}
            </div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '8px' }}>
              Seleccionado: {colorNombre || 'Personalizado'}
            </div>

            {SEPARADOR}

            <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>Logo</div>
            <div style={{ display: 'flex', gap: '12px', alignItems: 'center', flexWrap: 'wrap' }}>
              <div style={{ width: '64px', height: '64px', borderRadius: '12px', border: '1.5px dashed var(--border)', display: 'flex', alignItems: 'center', justifyContent: 'center', overflow: 'hidden', background: 'var(--bg)', flexShrink: 0 }}>
                {logoGuardado
                  ? <img src={logoGuardado} alt="Logo del instituto" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
                  : <span style={{ fontSize: '11px', color: 'var(--text3)' }}>Sin logo</span>}
              </div>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <button type="button" style={BTN_SEC} disabled={subiendoLogo} onClick={() => fileRef.current?.click()}>
                  {subiendoLogo ? 'Subiendo…' : logoGuardado ? 'Cambiar logo' : 'Subir logo'}
                </button>
                {logoGuardado && (
                  <button type="button" style={BTN_SEC} onClick={quitarLogo}>Quitar</button>
                )}
              </div>
              <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp" style={{ display: 'none' }}
                onChange={e => { const f = e.target.files?.[0]; if (f) subirLogo(f) }} />
            </div>
            <div style={{ fontSize: '11px', color: 'var(--text3)', marginTop: '6px' }}>PNG, JPG o WEBP de hasta 300 KB.</div>

            {SEPARADOR}

            {/* Vista previa */}
            <div style={{ borderRadius: '12px', overflow: 'hidden', border: '1px solid var(--border)' }}>
              <div style={{ height: '44px', background: color, display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '0 14px', color: '#fff', fontWeight: 700, fontSize: '14px' }}>
                <span>{nombre.trim() || 'Mi instituto'}</span>
                <span style={{ fontSize: '12px', fontWeight: 500 }}>Vista previa</span>
              </div>
              <div style={{ padding: '12px', display: 'flex', gap: '10px', alignItems: 'center', background: 'var(--white)' }}>
                <span style={{ background: color, color: '#fff', borderRadius: '10px', padding: '8px 14px', fontSize: '13px', fontWeight: 600 }}>+ Nuevo</span>
                <span style={{ fontSize: '13px', fontWeight: 600, color }}>Próximos</span>
              </div>
            </div>
          </div>

          {/* OPERATIVAS */}
          <div style={CARD}>
            <div style={{ fontSize: '15px', fontWeight: 700 }}>Operativas</div>
            <div style={{ fontSize: '13px', color: 'var(--text2)', margin: '2px 0 12px' }}>
              Reglas que usa el sistema todos los días.
            </div>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
              <div style={{ minWidth: 0 }}>
                <div style={{ fontSize: '14px', fontWeight: 600 }}>Alerta de ausencias consecutivas</div>
                <div style={{ fontSize: '12px', color: 'var(--text3)' }}>Avisar a partir de faltas seguidas</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <button type="button" aria-label="Bajar umbral" onClick={() => setUmbral(u => Math.max(UMBRAL_MIN, u - 1))} disabled={umbral <= UMBRAL_MIN}
                  style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--white)', fontSize: '16px', cursor: 'pointer' }}>−</button>
                <span style={{ minWidth: '24px', textAlign: 'center', fontSize: '15px', fontWeight: 700 }}>{umbral}</span>
                <button type="button" aria-label="Subir umbral" onClick={() => setUmbral(u => Math.min(UMBRAL_MAX, u + 1))} disabled={umbral >= UMBRAL_MAX}
                  style={{ width: '34px', height: '34px', borderRadius: '10px', border: '1.5px solid var(--border)', background: 'var(--white)', fontSize: '16px', cursor: 'pointer' }}>+</button>
              </div>
            </div>

            {SEPARADOR}

            <div style={{ fontSize: '14px', fontWeight: 600 }}>Feriados provinciales {anio}</div>
            <div style={{ fontSize: '12px', color: 'var(--text3)', margin: '2px 0 10px' }}>
              Se suman a los nacionales en Agenda y se descuentan en Liquidaciones.
            </div>

            {feriados.length === 0 && (
              <div style={{ fontSize: '13px', color: 'var(--text3)', marginBottom: '10px' }}>Todavía no cargaste feriados provinciales.</div>
            )}
            {feriados.map(f => (
              <div key={f.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '6px 0', borderBottom: '1px solid var(--border)' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '13px', fontWeight: 600 }}>{f.titulo}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{new Date(f.fecha + 'T12:00').toLocaleDateString('es-AR', { weekday: 'short', day: 'numeric', month: 'short' })}</div>
                </div>
                <button type="button" onClick={() => quitarFeriado(f.id)} aria-label={`Quitar ${f.titulo}`}
                  style={{ background: 'none', border: 'none', color: 'var(--text3)', fontSize: '18px', cursor: 'pointer', padding: '4px 8px' }}>×</button>
              </div>
            ))}

            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(0, 1fr) minmax(0, 1.4fr)', gap: '8px', marginTop: '12px' }}>
              <input type="date" style={INPUT} value={feriadoFecha} onChange={e => setFeriadoFecha(e.target.value)} aria-label="Fecha del feriado" />
              <input style={INPUT} value={feriadoTitulo} maxLength={80} placeholder="Ej: Día de la Provincia" onChange={e => setFeriadoTitulo(e.target.value)} aria-label="Nombre del feriado" />
            </div>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
              <button type="button" style={BTN_SEC} disabled={guardandoFeriado} onClick={agregarFeriado}>
                {guardandoFeriado ? 'Agregando…' : '+ Agregar feriado'}
              </button>
            </div>
          </div>

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={descartarIdent} disabled={!hayIdentCambios || guardandoIdent}
              style={{ ...BTN_SEC, padding: '10px 16px', opacity: hayIdentCambios ? 1 : 0.5 }}>Descartar</button>
            <button type="button" onClick={guardarIdentidad} disabled={!hayIdentCambios || guardandoIdent}
              style={{ ...BTN_PRI, opacity: hayIdentCambios && !guardandoIdent ? 1 : 0.5 }}>
              {guardandoIdent ? 'Guardando…' : 'Guardar cambios'}
            </button>
          </div>
        </>
      )}

      {/* PLANTILLAS DE WHATSAPP · director y secretaria */}
      {puedePlantillas && (
        <div style={CARD}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Plantillas de WhatsApp</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', margin: '2px 0 12px' }}>
            Los mensajes que se envían desde la app. Las variables entre llaves se completan solas al enviar.
          </div>

          {PLANTILLAS.map((p, i) => {
            const abiertaAhora = abierta === p.key
            const modificada = draft[p.key] !== undefined && (draft[p.key] ?? '') !== (plantillasGuardadas[p.key] || '')
            return (
              <div key={p.key} style={{ borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
                <button type="button" onClick={() => setAbierta(abiertaAhora ? null : p.key)}
                  style={{ width: '100%', display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', padding: '12px 0', background: 'none', border: 'none', cursor: 'pointer', textAlign: 'left' }}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontSize: '14px', fontWeight: 600, color: 'var(--text)' }}>
                      {p.titulo}{modificada && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--v)', fontWeight: 600 }}>· sin guardar</span>}
                      {!modificada && plantillasGuardadas[p.key] && <span style={{ marginLeft: '8px', fontSize: '11px', color: 'var(--text3)', fontWeight: 500 }}>· personalizada</span>}
                    </div>
                    <div style={{ fontSize: '12px', color: 'var(--text3)' }}>{p.descripcion}</div>
                  </div>
                  <span style={{ color: 'var(--text3)', fontSize: '16px', flexShrink: 0 }}>{abiertaAhora ? '−' : '+'}</span>
                </button>

                {abiertaAhora && (
                  <div style={{ paddingBottom: '14px' }}>
                    <textarea
                      value={textoActual(p.key)}
                      onChange={e => setDraft(d => ({ ...d, [p.key]: e.target.value }))}
                      rows={7}
                      maxLength={1500}
                      style={{ ...INPUT, resize: 'vertical', lineHeight: 1.5 }}
                    />
                    <div style={{ fontSize: '12px', color: 'var(--text3)', margin: '8px 0 4px' }}>Variables disponibles:</div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: '6px' }}>
                      {plantillaDef(p.key).vars.map(v => (
                        <code key={v} style={{ fontSize: '12px', padding: '2px 8px', borderRadius: '8px', background: 'var(--vl)', color: 'var(--v)' }}>{'{' + v + '}'}</code>
                      ))}
                    </div>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', marginTop: '10px', flexWrap: 'wrap' }}>
                      <span style={{ fontSize: '12px', color: 'var(--text3)' }}>{'{instituto}'} se completa con el nombre del instituto.</span>
                      <button type="button" style={BTN_SEC} onClick={() => setDraft(d => ({ ...d, [p.key]: '' }))}>
                        Volver al texto original
                      </button>
                    </div>
                  </div>
                )}
              </div>
            )
          })}

          <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '8px' }}>
            <button type="button" onClick={guardarPlantillas} disabled={cambiosPlant.length === 0 || guardandoPlant}
              style={{ ...BTN_PRI, opacity: cambiosPlant.length && !guardandoPlant ? 1 : 0.5 }}>
              {guardandoPlant ? 'Guardando…' : 'Guardar plantillas'}
            </button>
          </div>
        </div>
      )}

      {!esDirector && !puedePlantillas && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
          No tenés permisos para modificar esta sección.
        </div>
      )}
    </div>
  )
}
