'use client'
import { useState, useRef } from 'react'
import * as XLSX from 'xlsx'
import { apiHeaders, logActivity } from '@/lib/hooks'
import { showToast } from '@/components/Toast'

// ── Columnas que acepta el Excel (nombre en header → campo interno) ───────────
// El usuario puede usar cualquiera de los aliases, case-insensitive
const COL_MAP: Record<string, string> = {
  'nombre':           'nombre',
  'apellido':         'apellido',
  'dni':              'dni',
  'telefono':         'telefono',
  'teléfono':         'telefono',
  'email':            'email',
  'nivel':            'nivel',
  'cuota':            'cuota_mensual',
  'cuota_mensual':    'cuota_mensual',
  'matricula':        'matricula',
  'matrícula':        'matricula',
  'fecha_nacimiento': 'fecha_nacimiento',
  'nacimiento':       'fecha_nacimiento',
  'fecha nacimiento': 'fecha_nacimiento',
  'es_menor':         'es_menor',
  'menor':            'es_menor',
  'padre_nombre':     'padre_nombre',
  'nombre padre':     'padre_nombre',
  'padre_telefono':   'padre_telefono',
  'tel padre':        'padre_telefono',
  'padre_dni':        'padre_dni',
  'dni padre':        'padre_dni',
}

const NIVELES_VALIDOS = ['Básico', 'Básico 1', 'Básico 2', 'Intermedio', 'Intermedio 1', 'Intermedio 2', 'Advanced', 'Advanced 1', 'Advanced 2', 'Cambridge', 'FCE', 'CAE']
const COLORES = ['#652f8d','#1a6b8a','#2d7a4f','#c0392b','#e67e22','#8e44ad','#16a085','#d35400']

interface FilaPreview {
  idx: number
  raw: Record<string, any>
  datos: Record<string, any>
  errores: string[]
  advertencias: string[]
}

interface Props {
  onClose: () => void
  onImportado: (cantidad: number) => void
}

export default function ImportarAlumnos({ onClose, onImportado }: Props) {
  const [etapa, setEtapa] = useState<'upload' | 'preview' | 'progreso' | 'resultado'>('upload')
  const [filas, setFilas] = useState<FilaPreview[]>([])
  const [progreso, setProgreso] = useState({ ok: 0, error: 0, total: 0 })
  const [erroresDetalle, setErroresDetalle] = useState<{ fila: number; nombre: string; error: string }[]>([])
  const [arrastrando, setArrastrando] = useState(false)
  const inputRef = useRef<HTMLInputElement>(null)

  // ── Normalizar fecha desde Excel (número serial o string) ─────────────────
  const normalizarFecha = (val: any): string | null => {
    if (!val) return null
    if (typeof val === 'number') {
      // Excel serial date
      const fecha = XLSX.SSF.parse_date_code(val)
      if (!fecha) return null
      const mm = String(fecha.m).padStart(2, '0')
      const dd = String(fecha.d).padStart(2, '0')
      return `${fecha.y}-${mm}-${dd}`
    }
    const str = String(val).trim()
    // dd/mm/yyyy
    const dmy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/)
    if (dmy) return `${dmy[3]}-${dmy[2].padStart(2,'0')}-${dmy[1].padStart(2,'0')}`
    // yyyy-mm-dd
    if (/^\d{4}-\d{2}-\d{2}$/.test(str)) return str
    return null
  }

  const normalizarNivel = (val: any): string => {
    if (!val) return 'Básico'
    const s = String(val).trim()
    const match = NIVELES_VALIDOS.find(n => n.toLowerCase() === s.toLowerCase())
    return match || s
  }

  // ── Parsear archivo ───────────────────────────────────────────────────────
  const parsearArchivo = (file: File) => {
    const reader = new FileReader()
    reader.onload = (e) => {
      try {
        const data = new Uint8Array(e.target?.result as ArrayBuffer)
        const wb = XLSX.read(data, { type: 'array', cellDates: false })
        const ws = wb.Sheets[wb.SheetNames[0]]
        const raw: any[][] = XLSX.utils.sheet_to_json(ws, { header: 1, defval: '' })

        if (raw.length < 2) {
          showToast('El archivo no tiene filas de datos', 'error'); return
        }

        // Primera fila = encabezados
        const headers = (raw[0] as any[]).map(h => String(h).trim().toLowerCase())
        const colIdx: Record<string, number> = {}
        headers.forEach((h, i) => {
          const campo = COL_MAP[h]
          if (campo) colIdx[campo] = i
        })

        if (colIdx['nombre'] === undefined || colIdx['apellido'] === undefined) {
          showToast('El archivo debe tener columnas "nombre" y "apellido"', 'error'); return
        }

        const filasParseadas: FilaPreview[] = raw.slice(1).map((row, idx) => {
          const get = (campo: string) => {
            const i = colIdx[campo]
            return i !== undefined ? row[i] : undefined
          }

          const nombre   = String(get('nombre') || '').trim()
          const apellido = String(get('apellido') || '').trim()
          const dni      = String(get('dni') || '').trim()
          const telefono = String(get('telefono') || '').trim()
          const email    = String(get('email') || '').trim()
          const nivelRaw = get('nivel')
          const cuotaRaw = get('cuota_mensual')
          const matricRaw= get('matricula')
          const fnacRaw  = get('fecha_nacimiento')
          const esMenorRaw = get('es_menor')
          const padreNombre= String(get('padre_nombre') || '').trim()
          const padreTel   = String(get('padre_telefono') || '').trim()
          const padreDni   = String(get('padre_dni') || '').trim()

          const errores: string[] = []
          const advertencias: string[] = []

          if (!nombre)   errores.push('Falta nombre')
          if (!apellido) errores.push('Falta apellido')

          const cuota = cuotaRaw !== undefined && cuotaRaw !== '' ? Number(cuotaRaw) : 0
          if (cuotaRaw !== undefined && cuotaRaw !== '' && isNaN(cuota)) advertencias.push('Cuota no es número — se usará 0')

          const nivel = normalizarNivel(nivelRaw)
          if (nivelRaw && !NIVELES_VALIDOS.find(n => n.toLowerCase() === String(nivelRaw).toLowerCase())) {
            advertencias.push(`Nivel "${nivelRaw}" no reconocido — se guardará igual`)
          }

          const fechaNac = normalizarFecha(fnacRaw)
          if (fnacRaw && !fechaNac) advertencias.push('Fecha de nacimiento no reconocida — se omitirá')

          const esMenor = esMenorRaw !== undefined
            ? ['1','true','si','sí','yes'].includes(String(esMenorRaw).toLowerCase().trim())
            : false

          const datos: Record<string, any> = {
            nombre, apellido,
            dni: dni || null,
            telefono: telefono || null,
            email: email || null,
            nivel,
            cuota_mensual: isNaN(cuota) ? 0 : cuota,
            matricula: matricRaw !== undefined && matricRaw !== '' ? Number(matricRaw) || 0 : 0,
            fecha_nacimiento: fechaNac,
            es_menor: esMenor,
            padre_nombre: padreNombre || null,
            padre_telefono: padreTel || null,
            padre_dni: padreDni || null,
            color: COLORES[(idx) % COLORES.length],
          }

          return { idx: idx + 2, raw: row as any, datos, errores, advertencias }
        }).filter(f => {
          // Omitir filas completamente vacías
          return Object.values(f.raw).some(v => v !== '' && v !== null && v !== undefined)
        })

        if (filasParseadas.length === 0) {
          showToast('No se encontraron filas con datos', 'error'); return
        }

        setFilas(filasParseadas)
        setEtapa('preview')
      } catch (e: any) {
        showToast('Error al leer el archivo: ' + e.message, 'error')
      }
    }
    reader.readAsArrayBuffer(file)
  }

  const onFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0]
    if (file) parsearArchivo(file)
  }

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setArrastrando(false)
    const file = e.dataTransfer.files?.[0]
    if (file) parsearArchivo(file)
  }

  // ── Ejecutar importación ──────────────────────────────────────────────────
  const importar = async () => {
    const filasValidas = filas.filter(f => f.errores.length === 0)
    if (filasValidas.length === 0) { showToast('No hay filas válidas para importar', 'error'); return }

    setEtapa('progreso')
    setProgreso({ ok: 0, error: 0, total: filasValidas.length })
    const errDet: { fila: number; nombre: string; error: string }[] = []
    let okCount = 0

    // Importar de a 5 en paralelo para no saturar la API
    const BATCH = 5
    for (let i = 0; i < filasValidas.length; i += BATCH) {
      const lote = filasValidas.slice(i, i + BATCH)
      await Promise.all(lote.map(async (f) => {
        try {
          const res = await fetch('/api/crear-alumno', {
            method: 'POST',
            headers: apiHeaders(),
            body: JSON.stringify(f.datos),
          })
          const json = await res.json()
          if (res.ok && json.data) {
            okCount++
          } else {
            errDet.push({ fila: f.idx, nombre: `${f.datos.nombre} ${f.datos.apellido}`, error: json.error || `HTTP ${res.status}` })
          }
        } catch (e: any) {
          errDet.push({ fila: f.idx, nombre: `${f.datos.nombre} ${f.datos.apellido}`, error: e.message })
        }
        setProgreso(prev => ({ ...prev, ok: okCount, error: errDet.length }))
      }))
    }

    setErroresDetalle(errDet)
    setProgreso({ ok: okCount, error: errDet.length, total: filasValidas.length })

    if (okCount > 0) {
      logActivity('Importación masiva de alumnos', 'Alumnos', `${okCount} alumnos importados desde Excel`)
      showToast(`✓ ${okCount} alumno${okCount !== 1 ? 's' : ''} importado${okCount !== 1 ? 's' : ''}`)
      onImportado(okCount)
    }

    setEtapa('resultado')
  }

  // ── Descargar plantilla ───────────────────────────────────────────────────
  const descargarPlantilla = () => {
    const ws = XLSX.utils.aoa_to_sheet([
      ['nombre','apellido','dni','telefono','email','nivel','cuota_mensual','matricula','fecha_nacimiento','es_menor','padre_nombre','padre_telefono','padre_dni'],
      ['Juan','García','12345678','1155551234','juan@email.com','Básico','15000','5000','15/03/2010','no','','',''],
      ['María','López','','1166662345','','Intermedio','18000','','','','','',''],
    ])
    const wb = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(wb, ws, 'Alumnos')
    XLSX.writeFile(wb, 'plantilla_alumnos_edugest.xlsx')
  }

  const filasConError   = filas.filter(f => f.errores.length > 0)
  const filasValidas    = filas.filter(f => f.errores.length === 0)
  const filasConAdvert  = filas.filter(f => f.errores.length === 0 && f.advertencias.length > 0)

  return (
    <div
      style={{ position:'fixed', inset:0, zIndex:500, background:'rgba(20,0,40,.55)', display:'flex', alignItems:'flex-end', justifyContent:'center' }}
      onClick={(e) => { if (e.target === e.currentTarget) onClose() }}
    >
      <div style={{ background:'var(--white)', borderRadius:'24px 24px 0 0', width:'100%', maxWidth:'560px', maxHeight:'92vh', display:'flex', flexDirection:'column', overflow:'hidden' }}>

        {/* Header fijo */}
        <div style={{ padding:'20px 20px 0', flexShrink:0 }}>
          <div style={{ width:'40px', height:'4px', background:'var(--border)', borderRadius:'2px', margin:'0 auto 16px' }} />
          <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:'4px' }}>
            <div style={{ fontSize:'18px', fontWeight:700 }}>Importar alumnos</div>
            <button onClick={onClose} style={{ background:'none', border:'none', fontSize:'20px', cursor:'pointer', color:'var(--text3)', lineHeight:1 }}>×</button>
          </div>
          <div style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'16px' }}>
            Cargá un Excel con tus alumnos — revisá antes de confirmar.
          </div>
        </div>

        {/* Contenido scrolleable */}
        <div style={{ overflowY:'auto', flex:1, padding:'0 20px 28px' }}>

          {/* ── ETAPA UPLOAD ── */}
          {etapa === 'upload' && (
            <>
              <div
                onDragOver={e => { e.preventDefault(); setArrastrando(true) }}
                onDragLeave={() => setArrastrando(false)}
                onDrop={onDrop}
                onClick={() => inputRef.current?.click()}
                style={{
                  border: `2px dashed ${arrastrando ? 'var(--v)' : 'var(--border)'}`,
                  borderRadius:'16px',
                  padding:'40px 24px',
                  textAlign:'center',
                  cursor:'pointer',
                  background: arrastrando ? 'var(--vl)' : 'var(--bg)',
                  transition:'all .15s',
                  marginBottom:'16px',
                }}
              >
                <div style={{ fontSize:'36px', marginBottom:'10px' }}>📂</div>
                <div style={{ fontSize:'15px', fontWeight:600, color:'var(--text)', marginBottom:'4px' }}>
                  {arrastrando ? 'Soltá el archivo acá' : 'Arrastrá tu Excel o hacé clic'}
                </div>
                <div style={{ fontSize:'12px', color:'var(--text3)' }}>Formatos: .xlsx · .xls · .csv</div>
                <input ref={inputRef} type="file" accept=".xlsx,.xls,.csv" onChange={onFileChange} style={{ display:'none' }} />
              </div>

              <div style={{ background:'var(--bg)', border:'1.5px solid var(--border)', borderRadius:'14px', padding:'14px 16px', marginBottom:'16px' }}>
                <div style={{ fontSize:'12px', fontWeight:700, color:'var(--text2)', marginBottom:'8px', textTransform:'uppercase', letterSpacing:'.04em' }}>Columnas reconocidas</div>
                <div style={{ display:'flex', flexWrap:'wrap', gap:'6px' }}>
                  {['nombre *','apellido *','dni','telefono','email','nivel','cuota_mensual','matricula','fecha_nacimiento','es_menor','padre_nombre','padre_telefono','padre_dni'].map(c => (
                    <span key={c} style={{ padding:'3px 9px', borderRadius:'20px', fontSize:'11px', fontWeight:600, background: c.includes('*') ? 'var(--vl)' : 'var(--bg)', color: c.includes('*') ? 'var(--v)' : 'var(--text2)', border:'1px solid var(--border)' }}>{c}</span>
                  ))}
                </div>
                <div style={{ fontSize:'11px', color:'var(--text3)', marginTop:'8px' }}>* obligatorias · El orden de columnas no importa</div>
              </div>

              <button onClick={descargarPlantilla} style={{ width:'100%', padding:'11px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'13px', fontWeight:600, cursor:'pointer', color:'var(--text2)' }}>
                ⬇ Descargar plantilla Excel
              </button>
            </>
          )}

          {/* ── ETAPA PREVIEW ── */}
          {etapa === 'preview' && (
            <>
              {/* Resumen */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:'8px', marginBottom:'16px' }}>
                <div style={{ background:'var(--greenl)', border:'1.5px solid #a3e0bc', borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:'22px', fontWeight:700, color:'var(--green)' }}>{filasValidas.length}</div>
                  <div style={{ fontSize:'11px', color:'var(--text2)', marginTop:'2px' }}>Listos</div>
                </div>
                <div style={{ background: filasConAdvert.length > 0 ? 'var(--amberl)' : 'var(--bg)', border:`1.5px solid ${filasConAdvert.length > 0 ? '#e8d080' : 'var(--border)'}`, borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:'22px', fontWeight:700, color: filasConAdvert.length > 0 ? 'var(--amber)' : 'var(--text3)' }}>{filasConAdvert.length}</div>
                  <div style={{ fontSize:'11px', color:'var(--text2)', marginTop:'2px' }}>Con advertencias</div>
                </div>
                <div style={{ background: filasConError.length > 0 ? 'var(--redl)' : 'var(--bg)', border:`1.5px solid ${filasConError.length > 0 ? '#f5c5c5' : 'var(--border)'}`, borderRadius:'12px', padding:'12px', textAlign:'center' }}>
                  <div style={{ fontSize:'22px', fontWeight:700, color: filasConError.length > 0 ? 'var(--red)' : 'var(--text3)' }}>{filasConError.length}</div>
                  <div style={{ fontSize:'11px', color:'var(--text2)', marginTop:'2px' }}>Con errores</div>
                </div>
              </div>

              {filasConError.length > 0 && (
                <div style={{ background:'var(--redl)', border:'1.5px solid #f5c5c5', borderRadius:'12px', padding:'12px 14px', marginBottom:'12px', fontSize:'12px', color:'var(--red)' }}>
                  <strong>Las filas con errores no se importarán.</strong> Corregí el Excel y volvé a cargar si querés incluirlas.
                </div>
              )}

              {/* Lista de filas */}
              <div style={{ display:'flex', flexDirection:'column', gap:'6px', marginBottom:'16px' }}>
                {filas.map(f => (
                  <div key={f.idx} style={{
                    padding:'10px 12px',
                    borderRadius:'12px',
                    border: `1.5px solid ${f.errores.length > 0 ? '#f5c5c5' : f.advertencias.length > 0 ? '#e8d080' : 'var(--border)'}`,
                    background: f.errores.length > 0 ? 'var(--redl)' : f.advertencias.length > 0 ? 'var(--amberl)' : 'var(--white)',
                  }}>
                    <div style={{ display:'flex', alignItems:'center', gap:'8px' }}>
                      <span style={{ fontSize:'13px', fontWeight:600, flex:1, color: f.errores.length > 0 ? 'var(--red)' : 'var(--text)' }}>
                        {f.datos.nombre || '—'} {f.datos.apellido || '—'}
                      </span>
                      {f.datos.nivel && (
                        <span style={{ padding:'2px 7px', borderRadius:'10px', fontSize:'11px', fontWeight:600, background:'var(--vl)', color:'var(--v)' }}>{f.datos.nivel}</span>
                      )}
                      <span style={{ fontSize:'11px', color:'var(--text3)' }}>fila {f.idx}</span>
                    </div>
                    {f.datos.cuota_mensual > 0 && (
                      <div style={{ fontSize:'11.5px', color:'var(--text2)', marginTop:'3px' }}>
                        Cuota: ${f.datos.cuota_mensual.toLocaleString('es-AR')}
                        {f.datos.telefono && ` · ${f.datos.telefono}`}
                      </div>
                    )}
                    {f.errores.map((err, i) => (
                      <div key={i} style={{ fontSize:'11px', color:'var(--red)', marginTop:'3px', fontWeight:600 }}>✕ {err}</div>
                    ))}
                    {f.advertencias.map((adv, i) => (
                      <div key={i} style={{ fontSize:'11px', color:'var(--amber)', marginTop:'3px' }}>⚠ {adv}</div>
                    ))}
                  </div>
                ))}
              </div>

              <div style={{ display:'flex', gap:'10px' }}>
                <button onClick={() => setEtapa('upload')} style={{ flex:1, padding:'12px', background:'transparent', border:'1.5px solid var(--border)', borderRadius:'12px', fontSize:'14px', fontWeight:600, cursor:'pointer', color:'var(--text2)' }}>
                  ← Cambiar archivo
                </button>
                <button
                  onClick={importar}
                  disabled={filasValidas.length === 0}
                  style={{ flex:2, padding:'12px', background: filasValidas.length === 0 ? '#aaa' : 'var(--v)', color:'#fff', border:'none', borderRadius:'12px', fontSize:'14px', fontWeight:700, cursor: filasValidas.length === 0 ? 'not-allowed' : 'pointer' }}
                >
                  Importar {filasValidas.length} alumno{filasValidas.length !== 1 ? 's' : ''}
                </button>
              </div>
            </>
          )}

          {/* ── ETAPA PROGRESO ── */}
          {etapa === 'progreso' && (
            <div style={{ textAlign:'center', padding:'40px 20px' }}>
              <div style={{ fontSize:'36px', marginBottom:'16px' }}>⏳</div>
              <div style={{ fontSize:'16px', fontWeight:700, marginBottom:'8px' }}>
                Importando alumnos...
              </div>
              <div style={{ fontSize:'13px', color:'var(--text2)', marginBottom:'20px' }}>
                {progreso.ok + progreso.error} de {progreso.total}
              </div>
              <div style={{ background:'var(--border)', borderRadius:'99px', height:'8px', overflow:'hidden' }}>
                <div style={{
                  height:'8px', borderRadius:'99px', background:'var(--v)',
                  width: `${progreso.total > 0 ? Math.round((progreso.ok + progreso.error) / progreso.total * 100) : 0}%`,
                  transition:'width .3s',
                }} />
              </div>
            </div>
          )}

          {/* ── ETAPA RESULTADO ── */}
          {etapa === 'resultado' && (
            <>
              <div style={{ textAlign:'center', padding:'24px 0 20px' }}>
                <div style={{ fontSize:'40px', marginBottom:'12px' }}>{progreso.error === 0 ? '🎉' : progreso.ok > 0 ? '⚠️' : '❌'}</div>
                <div style={{ fontSize:'18px', fontWeight:700, marginBottom:'4px' }}>
                  {progreso.ok > 0 ? `${progreso.ok} alumno${progreso.ok !== 1 ? 's' : ''} importado${progreso.ok !== 1 ? 's' : ''}` : 'No se importó ningún alumno'}
                </div>
                {progreso.error > 0 && (
                  <div style={{ fontSize:'13px', color:'var(--red)', marginTop:'4px' }}>
                    {progreso.error} no se pudieron importar
                  </div>
                )}
              </div>

              {erroresDetalle.length > 0 && (
                <div style={{ marginBottom:'16px' }}>
                  <div style={{ fontSize:'12px', fontWeight:700, color:'var(--text2)', textTransform:'uppercase', letterSpacing:'.04em', marginBottom:'8px' }}>
                    Filas con error
                  </div>
                  {erroresDetalle.map((e, i) => (
                    <div key={i} style={{ padding:'9px 12px', borderRadius:'10px', border:'1.5px solid #f5c5c5', background:'var(--redl)', marginBottom:'6px', fontSize:'12px', color:'var(--red)' }}>
                      <strong>Fila {e.fila} · {e.nombre}</strong><br />
                      {e.error}
                    </div>
                  ))}
                </div>
              )}

              <button onClick={onClose} style={{ width:'100%', padding:'13px', background:'var(--v)', color:'#fff', border:'none', borderRadius:'12px', fontSize:'14px', fontWeight:700, cursor:'pointer' }}>
                {progreso.ok > 0 ? 'Ver alumnos importados' : 'Cerrar'}
              </button>
            </>
          )}

        </div>
      </div>
    </div>
  )
}
