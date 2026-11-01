import { useState, useEffect, useRef } from 'react'
import { useAuth } from '@/lib/auth-context'
import { apiHeaders } from '@/lib/hooks'
import { showToast } from '../Toast'
import { COLORES_PREDEFINIDOS, COLOR_MARCA_DEFAULT, aplicarColorMarca } from '@/lib/brand'
import { PLANTILLAS, plantillaDef } from '@/lib/plantillas'
import { configAlertas, ConfigAlertas, RANGOS, UMBRAL_DEFAULT } from '@/lib/alertas'

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
const BTN_PASO: React.CSSProperties = {
  width: '32px', height: '32px', borderRadius: '10px', border: '1.5px solid var(--border)',
  background: 'var(--white)', fontSize: '16px', cursor: 'pointer',
}
const INPUT: React.CSSProperties = {
  width: '100%', padding: '10px 12px', borderRadius: '10px', border: '1.5px solid var(--border)',
  fontSize: '14px', background: 'var(--white)', color: 'var(--text)', fontFamily: 'inherit', boxSizing: 'border-box',
}

type Feriado = { id: string; titulo: string; fecha: string }

// Parámetro de una alerta: un número con +/− o un sí/no
type Param =
  | { tipo: 'numero'; etiqueta: string; sufijo?: string; min: number; max: number; valor: number; onChange: (n: number) => void }
  | { tipo: 'si_no'; etiqueta: string; valor: boolean; onChange: (v: boolean) => void }

type FilaAlerta = {
  key: string
  titulo: string
  descripcion: string
  activa: boolean
  onToggle: (v: boolean) => void
  params: Param[]
}

export default function Personalizaciones() {
  const { usuario, instituto, recargarUsuario } = useAuth()
  const esDirector = usuario?.rol === 'director'
  const puedeAlertas = ['director', 'coordinadora', 'secretaria'].includes(usuario?.rol || '')
  const puedePlantillas = esDirector || usuario?.rol === 'secretaria'

  const nombreGuardado = instituto?.nombre || ''
  const colorGuardado = instituto?.color_primario || COLOR_MARCA_DEFAULT
  const umbralGuardado = instituto?.umbral_ausencias ?? UMBRAL_DEFAULT
  const logoGuardado = instituto?.logo_url || null
  const plantillasGuardadas: Record<string, string> = ((instituto as any)?.plantillas_whatsapp as Record<string, string>) || {}
  const plantillasKey = JSON.stringify(plantillasGuardadas)
  const alertasKey = JSON.stringify(configAlertas(instituto?.config_alertas))

  // Identidad
  const [nombre, setNombre] = useState(nombreGuardado)
  const [color, setColor] = useState(colorGuardado)
  const [guardandoIdent, setGuardandoIdent] = useState(false)
  const [subiendoLogo, setSubiendoLogo] = useState(false)
  const fileRef = useRef<HTMLInputElement>(null)

  // Alertas
  const [alertas, setAlertas] = useState<ConfigAlertas>(() => configAlertas(instituto?.config_alertas))
  const [umbral, setUmbral] = useState(umbralGuardado)
  const [guardandoAlertas, setGuardandoAlertas] = useState(false)

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
  }, [nombreGuardado, colorGuardado])

  useEffect(() => {
    setAlertas(configAlertas(instituto?.config_alertas))
    setUmbral(umbralGuardado)
  }, [alertasKey, umbralGuardado]) // eslint-disable-line react-hooks/exhaustive-deps

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

  // ── Identidad ───────────────────────────────────────────────────────────
  const hayIdentCambios =
    nombre.trim() !== nombreGuardado ||
    color.toLowerCase() !== colorGuardado.toLowerCase()

  const descartarIdent = () => {
    setNombre(nombreGuardado)
    setColor(colorGuardado)
  }

  const guardarIdentidad = async () => {
    if (!nombre.trim()) { showToast('El nombre del instituto no puede estar vacío', 'warning'); return }
    setGuardandoIdent(true)
    try {
      const res = await fetch('/api/personalizaciones', {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ nombre: nombre.trim(), color_primario: color }),
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

  // ── Alertas ─────────────────────────────────────────────────────────────
  const alertasSinGuardar = JSON.stringify(alertas) !== alertasKey || umbral !== umbralGuardado

  const cambiarAlerta = (seccion: keyof ConfigAlertas, campo: string, valor: boolean | number) =>
    setAlertas(prev => ({ ...prev, [seccion]: { ...(prev[seccion] as object), [campo]: valor } }) as ConfigAlertas)

  const descartarAlertas = () => {
    setAlertas(configAlertas(instituto?.config_alertas))
    setUmbral(umbralGuardado)
  }

  const restaurarAlertas = () => {
    setAlertas(configAlertas(null))
    setUmbral(UMBRAL_DEFAULT)
  }

  const guardarAlertas = async () => {
    setGuardandoAlertas(true)
    try {
      const res = await fetch('/api/alertas-config', {
        method: 'POST',
        headers: { ...apiHeaders(), 'Content-Type': 'application/json' },
        body: JSON.stringify({ config: alertas, umbral_ausencias: umbral }),
      })
      const json = await res.json()
      if (!res.ok || json.error) throw new Error(json.error || 'No se pudieron guardar las alertas')
      await recargarUsuario()
      showToast('Alertas guardadas')
    } catch (e: any) {
      showToast(e?.message || 'No se pudieron guardar las alertas', 'error')
    }
    setGuardandoAlertas(false)
  }

  const filas: FilaAlerta[] = [
    {
      key: 'ausencias',
      titulo: 'Ausencias consecutivas',
      descripcion: 'Avisa cuando un alumno falta varias clases seguidas.',
      activa: alertas.ausencias.activa,
      onToggle: v => cambiarAlerta('ausencias', 'activa', v),
      params: [{ tipo: 'numero', etiqueta: 'Avisar a partir de', sufijo: 'faltas seguidas', min: RANGOS.umbral.min, max: RANGOS.umbral.max, valor: umbral, onChange: setUmbral }],
    },
    {
      key: 'alumnos_sin_curso',
      titulo: 'Alumnos sin curso',
      descripcion: 'Avisa los alumnos activos que todavía no tienen curso asignado.',
      activa: alertas.alumnos_sin_curso.activa,
      onToggle: v => cambiarAlerta('alumnos_sin_curso', 'activa', v),
      params: [],
    },
    {
      key: 'cuotas_sin_pago',
      titulo: 'Cuotas sin pago',
      descripcion: 'Alumnos con curso que todavía no tienen pago registrado en el mes.',
      activa: alertas.cuotas_sin_pago.activa,
      onToggle: v => cambiarAlerta('cuotas_sin_pago', 'activa', v),
      params: [{ tipo: 'numero', etiqueta: 'Avisar desde el día', sufijo: 'del mes', min: RANGOS.dia_desde.min, max: RANGOS.dia_desde.max, valor: alertas.cuotas_sin_pago.dia_desde, onChange: n => cambiarAlerta('cuotas_sin_pago', 'dia_desde', n) }],
    },
    {
      key: 'planificacion_atrasada',
      titulo: 'Planificación atrasada',
      descripcion: 'Profesoras con unidades vencidas sin dictar.',
      activa: alertas.planificacion_atrasada.activa,
      onToggle: v => cambiarAlerta('planificacion_atrasada', 'activa', v),
      params: [
        { tipo: 'numero', etiqueta: 'Marcar crítica si tiene', sufijo: 'unidades atrasadas o más', min: RANGOS.unidades_criticas.min, max: RANGOS.unidades_criticas.max, valor: alertas.planificacion_atrasada.unidades_criticas, onChange: n => cambiarAlerta('planificacion_atrasada', 'unidades_criticas', n) },
        { tipo: 'numero', etiqueta: 'Marcar crítica si hay un examen en', sufijo: 'días o menos', min: RANGOS.dias_examen_critico.min, max: RANGOS.dias_examen_critico.max, valor: alertas.planificacion_atrasada.dias_examen_critico, onChange: n => cambiarAlerta('planificacion_atrasada', 'dias_examen_critico', n) },
      ],
    },
    {
      key: 'examen_proximo',
      titulo: 'Exámenes próximos',
      descripcion: 'Muestra a cada profesora los exámenes de sus cursos en los próximos días.',
      activa: alertas.examen_proximo.activa,
      onToggle: v => cambiarAlerta('examen_proximo', 'activa', v),
      params: [{ tipo: 'numero', etiqueta: 'Mostrar exámenes de los próximos', sufijo: 'días', min: RANGOS.dias.min, max: RANGOS.dias.max, valor: alertas.examen_proximo.dias, onChange: n => cambiarAlerta('examen_proximo', 'dias', n) }],
    },
    {
      key: 'evaluaciones_pendientes',
      titulo: 'Evaluaciones pendientes',
      descripcion: 'Avisa las evaluaciones de unidades que todavía no se tomaron.',
      activa: alertas.evaluaciones_pendientes.activa,
      onToggle: v => cambiarAlerta('evaluaciones_pendientes', 'activa', v),
      params: [],
    },
    {
      key: 'clases_sin_registrar',
      titulo: 'Clases sin registrar',
      descripcion: 'Avisa a la profesora las clases del día que todavía no tienen asistencia cargada.',
      activa: alertas.clases_sin_registrar.activa,
      onToggle: v => cambiarAlerta('clases_sin_registrar', 'activa', v),
      params: [{ tipo: 'si_no', etiqueta: 'Contar solo las clases que ya empezaron', valor: alertas.clases_sin_registrar.solo_iniciadas, onChange: v => cambiarAlerta('clases_sin_registrar', 'solo_iniciadas', v) }],
    },
    {
      key: 'cumpleanos',
      titulo: 'Cumpleaños',
      descripcion: 'Avisa los cumpleaños de los alumnos para saludarlos por WhatsApp.',
      activa: alertas.cumpleanos.activa,
      onToggle: v => cambiarAlerta('cumpleanos', 'activa', v),
      params: [{ tipo: 'numero', etiqueta: 'Avisar con', sufijo: 'días de anticipación (0 = el mismo día)', min: RANGOS.dias_anticipacion.min, max: RANGOS.dias_anticipacion.max, valor: alertas.cumpleanos.dias_anticipacion, onChange: n => cambiarAlerta('cumpleanos', 'dias_anticipacion', n) }],
    },
  ]

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

  const subtitulo = esDirector
    ? 'Identidad, alertas, feriados y mensajes del instituto. Los cambios los ven todos los usuarios de la sede.'
    : [puedeAlertas && 'Alertas', puedePlantillas && 'mensajes de WhatsApp'].filter(Boolean).join(' y ') + ' del instituto.'

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', gap: '14px' }}>
      <div>
        <div style={{ fontSize: '20px', fontWeight: 700 }}>Personalizaciones</div>
        <div style={{ fontSize: '13px', color: 'var(--text2)', marginTop: '2px' }}>{subtitulo}</div>
      </div>

      {esDirector && (
        <>
          {/* IDENTIDAD · solo director */}
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

          <div style={{ display: 'flex', gap: '8px', justifyContent: 'flex-end' }}>
            <button type="button" onClick={descartarIdent} disabled={!hayIdentCambios || guardandoIdent}
              style={{ ...BTN_SEC, padding: '10px 16px', opacity: hayIdentCambios ? 1 : 0.5 }}>Descartar</button>
            <button type="button" onClick={guardarIdentidad} disabled={!hayIdentCambios || guardandoIdent}
              style={{ ...BTN_PRI, opacity: hayIdentCambios && !guardandoIdent ? 1 : 0.5 }}>
              {guardandoIdent ? 'Guardando…' : 'Guardar identidad'}
            </button>
          </div>
        </>
      )}

      {/* ALERTAS · director, coordinadora y secretaria */}
      {puedeAlertas && (
        <div style={CARD}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Alertas</div>
          <div style={{ fontSize: '13px', color: 'var(--text2)', margin: '2px 0 4px' }}>
            Activá o desactivá cada aviso de la app y ajustá sus reglas.
          </div>
          <div style={{ fontSize: '12px', color: 'var(--text3)', marginBottom: '6px' }}>
            Las pueden modificar dirección, coordinación y secretaría.
          </div>

          {filas.map((f, i) => (
            <div key={f.key} style={{ padding: '12px 0', borderTop: i === 0 ? 'none' : '1px solid var(--border)' }}>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: '14px', fontWeight: 600 }}>{f.titulo}</div>
                  <div style={{ fontSize: '12px', color: 'var(--text3)', marginTop: '2px' }}>{f.descripcion}</div>
                </div>
                <Interruptor activa={f.activa} etiqueta={f.titulo} onChange={f.onToggle} />
              </div>

              {f.activa && f.params.length > 0 && (
                <div style={{ marginTop: '10px', paddingLeft: '12px', borderLeft: '3px solid var(--vl)', display: 'flex', flexDirection: 'column', gap: '8px' }}>
                  {f.params.map((p, j) => p.tipo === 'numero' ? (
                    <div key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
                      <span style={{ fontSize: '13px', color: 'var(--text2)', minWidth: 0 }}>
                        {p.etiqueta}{p.sufijo ? ' ' + p.sufijo : ''}
                      </span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexShrink: 0 }}>
                        <button type="button" aria-label={`Bajar ${p.etiqueta}`} onClick={() => p.onChange(Math.max(p.min, p.valor - 1))}
                          disabled={p.valor <= p.min} style={{ ...BTN_PASO, opacity: p.valor <= p.min ? 0.4 : 1 }}>−</button>
                        <span style={{ minWidth: '28px', textAlign: 'center', fontSize: '15px', fontWeight: 700 }}>{p.valor}</span>
                        <button type="button" aria-label={`Subir ${p.etiqueta}`} onClick={() => p.onChange(Math.min(p.max, p.valor + 1))}
                          disabled={p.valor >= p.max} style={{ ...BTN_PASO, opacity: p.valor >= p.max ? 0.4 : 1 }}>+</button>
                      </div>
                    </div>
                  ) : (
                    <label key={j} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '10px', fontSize: '13px', color: 'var(--text2)', cursor: 'pointer' }}>
                      {p.etiqueta}
                      <input type="checkbox" checked={p.valor} onChange={e => p.onChange(e.target.checked)}
                        style={{ width: '18px', height: '18px', accentColor: 'var(--v)', flexShrink: 0 }} />
                    </label>
                  ))}
                </div>
              )}
            </div>
          ))}

          {SEPARADOR}

          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
            <button type="button" style={BTN_SEC} onClick={restaurarAlertas} disabled={guardandoAlertas}>
              Restaurar valores por defecto
            </button>
            <div style={{ display: 'flex', gap: '8px' }}>
              <button type="button" onClick={descartarAlertas} disabled={!alertasSinGuardar || guardandoAlertas}
                style={{ ...BTN_SEC, opacity: alertasSinGuardar ? 1 : 0.5 }}>Descartar</button>
              <button type="button" onClick={guardarAlertas} disabled={!alertasSinGuardar || guardandoAlertas}
                style={{ ...BTN_PRI, opacity: alertasSinGuardar && !guardandoAlertas ? 1 : 0.5 }}>
                {guardandoAlertas ? 'Guardando…' : 'Guardar alertas'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* FERIADOS PROVINCIALES · solo director */}
      {esDirector && (
        <div style={CARD}>
          <div style={{ fontSize: '15px', fontWeight: 700 }}>Feriados provinciales {anio}</div>
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

      {!puedeAlertas && !puedePlantillas && (
        <div style={{ padding: '40px 16px', textAlign: 'center', color: 'var(--text3)', fontSize: '13px' }}>
          No tenés permisos para modificar esta sección.
        </div>
      )}
    </div>
  )
}

// Interruptor on/off accesible (role="switch")
function Interruptor({ activa, etiqueta, onChange }: { activa: boolean; etiqueta: string; onChange: (v: boolean) => void }) {
  return (
    <button type="button" role="switch" aria-checked={activa} aria-label={`Alerta: ${etiqueta}`} onClick={() => onChange(!activa)}
      style={{ position: 'relative', width: '44px', height: '26px', borderRadius: '13px', border: 'none', cursor: 'pointer', flexShrink: 0, background: activa ? 'var(--v)' : 'var(--border)', transition: 'background .2s' }}>
      <span style={{ position: 'absolute', top: '3px', left: activa ? '21px' : '3px', width: '20px', height: '20px', borderRadius: '50%', background: '#fff', boxShadow: '0 1px 2px rgba(0,0,0,.25)', transition: 'left .2s' }} />
    </button>
  )
}
