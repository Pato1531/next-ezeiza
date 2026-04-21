'use client'
import { useState, useEffect } from 'react'
import { createClient } from '@/lib/supabase'
import { useAuth } from '@/lib/auth-context'
import { logActivity } from '@/lib/hooks'

const MESES = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']
const DIAS_SEMANA = ['Lunes','Martes','Miércoles','Jueves','Viernes','Sábados']
const FRANJAS = ['Mañana (8-12h)','Mediodía (12-14h)','Tarde (14-18h)','Noche (18-21h)']
const NIVELES_INTERES = ['Básico','Intermedio','Advanced','Cambridge','No sabe / A evaluar']
const COLORES_AV = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#7d3aab']
const IS = { width:'100%', padding:'10px 12px', border:'1.5px solid var(--border)', borderRadius:'10px', fontSize:'14px', fontFamily:'Inter,sans-serif', outline:'none', color:'var(--text)', background:'var(--white)' } as const

function hoy() { return new Date().toISOString().split('T')[0] }
function fmt(f: string) { if(!f)return'—'; const [y,m,d]=f.split('-'); return `${d}/${m}/${y}` }

export default function AtencionCliente() {
  const { usuario } = useAuth()
  const [tab, setTab] = useState<'consultas'|'espera'>('consultas')

  return (
    <div className="fade-in">
      <div style={{marginBottom:'20px'}}>
        <div style={{fontSize:'20px',fontWeight:700}}>Atención al Cliente</div>
        <div style={{fontSize:'13px',color:'var(--text2)',marginTop:'2px'}}>Registro de consultas y lista de espera</div>
      </div>

      <div style={{display:'flex',gap:'6px',marginBottom:'18px'}}>
        <TabBtn active={tab==='consultas'} onClick={() => setTab('consultas')}>Registro de consultas</TabBtn>
        <TabBtn active={tab==='espera'} onClick={() => setTab('espera')}>Lista de espera</TabBtn>
      </div>

      {tab === 'consultas' && <RegistroConsultas />}
      {tab === 'espera' && <ListaEspera />}
    </div>
  )
}

// ── REGISTRO DE CONSULTAS ──
function RegistroConsultas() {
  const hoyStr = hoy()
  const [mes, setMes] = useState(new Date().getMonth())
  const [anio, setAnio] = useState(new Date().getFullYear())
  const [registros, setRegistros] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [guardando, setGuardando] = useState(false)

  useEffect(() => { cargar() }, [mes, anio])

  const cargar = async () => {
    setLoading(true)
    const sb = createClient()
    const mesNombre = MESES[mes]
    const { data } = await sb.from('consultas_diarias')
      .select('*').eq('mes', mesNombre).eq('anio', anio).order('fecha')
    setRegistros(data || [])
    setLoading(false)
  }

  const diasEnMes = new Date(anio, mes + 1, 0).getDate()
  const dias: { fecha: string; reg: any }[] = []
  for (let d = 1; d <= diasEnMes; d++) {
    const fecha = `${anio}-${String(mes+1).padStart(2,'0')}-${String(d).padStart(2,'0')}`
    const dayOfWeek = new Date(fecha+'T12:00:00').getDay()
    if (dayOfWeek === 0) continue
    const reg = registros.find(r => r.fecha === fecha) || { fecha, ws: 0, instagram: 0, inscriptos: 0 }
    dias.push({ fecha, reg })
  }

  const totales = {
    ws: dias.reduce((s, d) => s + (d.reg.ws || 0), 0),
    instagram: dias.reduce((s, d) => s + (d.reg.instagram || 0), 0),
    inscriptos: dias.reduce((s, d) => s + (d.reg.inscriptos || 0), 0),
  }
  const totalConsultas = totales.ws + totales.instagram
  const conversionRate = totalConsultas > 0 ? Math.round((totales.inscriptos / totalConsultas) * 100) : 0

  const guardarDia = async (fecha: string, campo: string, valor: number) => {
    if (isNaN(valor) || valor < 0) return
    setGuardando(true)
    const mesNombre = MESES[mes]
    try {
      const res = await fetch('/api/consultas-diarias', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ fecha, mes: mesNombre, anio, campo, valor })
      })
      const json = await res.json()
      if (json.data) {
        setRegistros(prev => {
          const idx = prev.findIndex(r => r.fecha === fecha)
          if (idx >= 0) {
            const next = [...prev]
            next[idx] = { ...next[idx], [campo]: valor }
            return next
          }
          return [...prev, json.data]
        })
      } else {
        console.error('[guardarDia]', json.error)
      }
    } catch (e) {
      console.error('[guardarDia] fetch error:', e)
    }
    setGuardando(false)
  }

  const exportarCSV = () => {
    const mesNombre = MESES[mes]
    const rows = [
      [`NEXT EZEIZA — CONSULTAS ${mesNombre.toUpperCase()} ${anio}`],
      [''],
      ['RESUMEN'],
      ['WhatsApp', totales.ws],
      ['Instagram', totales.instagram],
      ['Total consultas', totalConsultas],
      ['Inscriptos', totales.inscriptos],
      ['Conversión', `${conversionRate}%`],
      [''],
      ['DETALLE POR DÍA'],
      ['Fecha', 'WhatsApp', 'Instagram', 'Inscriptos'],
      ...dias.filter(d => d.reg.ws || d.reg.instagram || d.reg.inscriptos).map(d => [
        fmt(d.fecha),
        d.reg.ws || 0,
        d.reg.instagram || 0,
        d.reg.inscriptos || 0,
      ])
    ]
    const csv = rows.map((r: any[]) => r.map((c: any) => `"${String(c||'').replace(/"/g,'""')}"`).join(',')).join('\n')
    const blob = new Blob(['\uFEFF'+csv], {type:'text/csv;charset=utf-8;'})
    const url = URL.createObjectURL(blob)
    const a = document.createElement('a')
    a.href = url; a.download = `consultas_${mesNombre}_${anio}.csv`; a.click()
    URL.revokeObjectURL(url)
  }

  const exportarPDF = () => {
    const mesNombre = MESES[mes]
    const filas = dias
      .filter(d => d.reg.ws || d.reg.instagram || d.reg.inscriptos)
      .map(d => `<tr><td>${fmt(d.fecha)}</td><td style="text-align:center;color:#25D366;font-weight:600">${d.reg.ws||0}</td><td style="text-align:center;color:#E1306C;font-weight:600">${d.reg.instagram||0}</td><td style="text-align:center;color:#652f8d;font-weight:600">${d.reg.inscriptos||0}</td></tr>`).join('')
    const html = `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>Consultas ${mesNombre} ${anio}</title>
    <style>body{font-family:Arial,sans-serif;padding:28px;font-size:13px;color:#1a1020}
    .hd{display:flex;justify-content:space-between;align-items:flex-end;border-bottom:3px solid #652f8d;padding-bottom:14px;margin-bottom:20px}
    .logo{font-size:20px;font-weight:700}.logo span{color:#652f8d}
    h1{color:#652f8d;font-size:16px;margin:0 0 4px}
    .kpis{display:flex;gap:12px;margin-bottom:20px}
    .kpi{flex:1;background:#f9f5fd;border-radius:10px;padding:12px;text-align:center}
    .kpi-val{font-size:22px;font-weight:800;color:#652f8d}.kpi-lab{font-size:10px;color:#9b8eaa;font-weight:700;text-transform:uppercase;margin-top:2px}
    table{width:100%;border-collapse:collapse}
    th{border-bottom:2px solid #652f8d;padding:8px;text-align:left;font-size:11px;text-transform:uppercase;color:#652f8d;letter-spacing:.04em}
    td{padding:8px;border-bottom:1px solid #f0edf5}
    .conv{background:#e6f4ec;color:#2d7a4f;padding:3px 10px;border-radius:20px;font-size:11px;font-weight:700;display:inline-block}
    @media print{body{padding:16px}}</style></head><body>
    <div class="hd"><div class="logo"><span>Next</span> Ezeiza</div>
    <div style="font-size:12px;color:#888">${new Date().toLocaleDateString('es-AR',{day:'numeric',month:'long',year:'numeric'})}</div></div>
    <h1>Consultas — ${mesNombre} ${anio}</h1>
    <div class="kpis">
      <div class="kpi"><div class="kpi-val" style="color:#25D366">${totales.ws}</div><div class="kpi-lab">WhatsApp</div></div>
      <div class="kpi"><div class="kpi-val" style="color:#E1306C">${totales.instagram}</div><div class="kpi-lab">Instagram</div></div>
      <div class="kpi"><div class="kpi-val">${totales.inscriptos}</div><div class="kpi-lab">Inscriptos</div></div>
      <div class="kpi"><div class="kpi-val">${conversionRate}%</div><div class="kpi-lab">Conversión</div></div>
    </div>
    <table><tr><th>Fecha</th><th>WhatsApp</th><th>Instagram</th><th>Inscriptos</th></tr>${filas}</table>
    <script>setTimeout(function(){window.print()},400)</script></body></html>`
    const blob = new Blob([html], {type:'text/html;charset=utf-8'})
    const url = URL.createObjectURL(blob)
    window.open(url, '_blank')
    setTimeout(() => URL.revokeObjectURL(url), 15000)
  }

  return (
    <div>
      {/* Selector mes/año + exportar */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px',marginBottom:'14px'}}>
        <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}> 
          <div>
            <SL style={{marginBottom:'4px'}}>Mes</SL>
            <select style={IS} value={mes} onChange={e=>setMes(+e.target.value)}>
              {MESES.map((m,i) => <option key={m} value={i}>{m}</option>)}
            </select>
          </div>
          <div>
            <SL style={{marginBottom:'4px'}}>Año</SL>
            <select style={IS} value={anio} onChange={e=>setAnio(+e.target.value)}>
              {[2025,2026,2027].map(y => <option key={y}>{y}</option>)}
            </select>
          </div>
        </div>
        <div style={{display:'flex',gap:'8px'}}>
          <button onClick={exportarCSV} style={{flex:1,padding:'9px',background:'var(--white)',color:'var(--green)',border:'1.5px solid var(--green)',borderRadius:'10px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>⬇ Excel</button>
          <button onClick={exportarPDF} style={{flex:1,padding:'9px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>⬇ PDF</button>
        </div>
      </div>

      {/* KPIs del mes */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
        {[
          { label:'WhatsApp', val: totales.ws, color:'#25D366' },
          { label:'Instagram', val: totales.instagram, color:'#E1306C' },
          { label:'Inscriptos', val: totales.inscriptos, color:'var(--v)' },
          { label:'Conversión', val: `${conversionRate}%`, color: conversionRate >= 20 ? 'var(--green)' : conversionRate >= 10 ? 'var(--amber)' : 'var(--red)' },
        ].map(k => (
          <div key={k.label} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'12px',textAlign:'center'}}>
            <div style={{fontSize:'22px',fontWeight:800,color:k.color}}>{k.val}</div>
            <div style={{fontSize:'10px',color:'var(--text3)',fontWeight:600,marginTop:'2px'}}>{k.label}</div>
          </div>
        ))}
      </div>

      {/* Tabla por días */}
      <div style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',overflow:'hidden'}}>
        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr',background:'var(--bg)',borderBottom:'1.5px solid var(--border)',padding:'10px 14px'}}>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase'}}>Fecha</div>
          <div style={{fontSize:'10px',fontWeight:700,color:'#25D366',textTransform:'uppercase',textAlign:'center'}}>WS</div>
          <div style={{fontSize:'10px',fontWeight:700,color:'#E1306C',textTransform:'uppercase',textAlign:'center'}}>Instagram</div>
          <div style={{fontSize:'10px',fontWeight:700,color:'var(--v)',textTransform:'uppercase',textAlign:'center'}}>Inscriptos</div>
        </div>

        {loading ? (
          <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>Cargando...</div>
        ) : (
          dias.map(({ fecha, reg }) => {
            const esHoy = fecha === hoyStr
            const dayName = new Date(fecha+'T12:00:00').toLocaleDateString('es-AR',{weekday:'short'})
            const dayNum = fecha.split('-')[2]
            const tieneDatos = reg.ws || reg.instagram || reg.inscriptos
            return (
              <div key={fecha} style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr',padding:'8px 14px',borderBottom:'1px solid var(--border)',background:esHoy?'var(--vl)':tieneDatos?'transparent':'transparent',alignItems:'center'}}>
                <div>
                  <div style={{fontSize:'12px',fontWeight:700,color:esHoy?'var(--v)':'var(--text)'}}>{dayNum} {dayName}</div>
                  {esHoy && <div style={{fontSize:'9px',color:'var(--v)',fontWeight:700}}>HOY</div>}
                </div>
                {(['ws','instagram','inscriptos'] as const).map(campo => (
                  <div key={campo} style={{textAlign:'center'}}>
                    <input
                      type="number" min="0" max="999"
                      value={reg[campo] ?? 0}
                      onChange={e => {
                        const val = parseInt(e.target.value) || 0
                        setRegistros(prev => {
                          const existe = prev.find(r => r.fecha === fecha)
                          if (existe) return prev.map(r => r.fecha === fecha ? {...r,[campo]:val} : r)
                          return [...prev, { fecha, mes: MESES[mes], anio, ws:0, instagram:0, inscriptos:0, [campo]:val }]
                        })
                      }}
                      onBlur={e => guardarDia(fecha, campo, parseInt(e.target.value)||0)}
                      style={{width:'52px',padding:'6px',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'14px',fontWeight:600,textAlign:'center',fontFamily:'Inter,sans-serif',outline:'none',color:'var(--text)',background:'var(--white)'}}
                    />
                  </div>
                ))}
              </div>
            )
          })
        )}

        <div style={{display:'grid',gridTemplateColumns:'80px 1fr 1fr 1fr',padding:'10px 14px',background:'var(--bg)',borderTop:'2px solid var(--border)'}}>
          <div style={{fontSize:'12px',fontWeight:700,color:'var(--text3)'}}>TOTAL</div>
          <div style={{textAlign:'center',fontSize:'16px',fontWeight:800,color:'#25D366'}}>{totales.ws}</div>
          <div style={{textAlign:'center',fontSize:'16px',fontWeight:800,color:'#E1306C'}}>{totales.instagram}</div>
          <div style={{textAlign:'center',fontSize:'16px',fontWeight:800,color:'var(--v)'}}>{totales.inscriptos}</div>
        </div>
      </div>
      <div style={{fontSize:'11px',color:'var(--text3)',textAlign:'center',marginTop:'8px'}}>Los cambios se guardan automáticamente al salir del campo</div>
    </div>
  )
}

// ── LISTA DE ESPERA ──
// ESTADOS DE SEGUIMIENTO COMERCIAL
const ESTADOS_SEGUIMIENTO = [
  { id: 'nuevo',      label: 'Nuevo',       bg: '#e0f0f7', color: '#1a6b8a' },
  { id: 'contactado', label: 'Contactado',  bg: '#fef3cd', color: '#b45309' },
  { id: 'demo',       label: 'Demo pend.',  bg: '#f4eefb', color: '#652f8d' },
  { id: 'perdido',    label: 'No continúa', bg: '#fdeaea', color: '#c0392b' },
]

function EstadoBadge({ estado, onClick }: { estado?: string; onClick?: () => void }) {
  const est = ESTADOS_SEGUIMIENTO.find(e => e.id === (estado || 'nuevo')) || ESTADOS_SEGUIMIENTO[0]
  return (
    <span onClick={onClick} style={{
      display:'inline-block', padding:'3px 10px', borderRadius:'20px',
      fontSize:'11px', fontWeight:600,
      background: est.bg, color: est.color,
      cursor: onClick ? 'pointer' : 'default',
      border: `1px solid ${est.color}33`,
      userSelect:'none' as const,
    }}>
      {est.label}
    </span>
  )
}

function ListaEspera() {
  const [lista, setLista] = useState<any[]>([])
  const [loading, setLoading] = useState(true)
  const [modal, setModal] = useState(false)
  const [editandoId, setEditandoId] = useState<string|null>(null)
  const [confirmDel, setConfirmDel] = useState<string|null>(null)
  const [modalInscribir, setModalInscribir] = useState<any>(null)
  const [inscribiendo, setInscribiendo] = useState(false)
  const [busqueda, setBusqueda] = useState('')
  const [filtroEstado, setFiltroEstado] = useState<string>('todos')
  const formVacio = { nombre:'', apellido:'', edad:'', celular:'', dia_interes:'', franja_horaria:'', nivel_curso:'', observaciones:'' }
  const [form, setForm] = useState(formVacio)
  const [guardando, setGuardando] = useState(false)

  // Form de inscripción rápida
  const [formInscripcion, setFormInscripcion] = useState({
    fecha_alta: hoy(), matricula: '', cuota_mensual: '', nivel: 'Básico', es_menor: false,
    padre_nombre: '', padre_telefono: '', padre_email: '',
  })

  useEffect(() => { cargar() }, [])

  const cargar = async () => {
    setLoading(true)
    const sb = createClient()
    let q = sb.from('lista_espera').select('*').order('created_at', { ascending: false })
    // Filtrar por instituto — evita mezclar leads de distintas sedes
    if (usuario?.instituto_id) q = (q as any).eq('instituto_id', usuario.instituto_id)
    const { data, error } = await q
    if (error) console.error('[lista_espera cargar]', error.message)
    setLista(data || [])
    setLoading(false)
  }

  const abrirEditar = (a: any) => {
    setForm({
      nombre: a.nombre, apellido: a.apellido, edad: a.edad?.toString()||'',
      celular: a.celular||'', dia_interes: a.dia_interes||'',
      franja_horaria: a.franja_horaria||'', nivel_curso: a.nivel_curso||'',
      observaciones: a.observaciones||''
    })
    setEditandoId(a.id)
    setModal(true)
  }

  const guardar = async () => {
    if (!form.nombre || !form.apellido || !form.celular) return alert('Nombre, apellido y celular son obligatorios')
    setGuardando(true)
    const sb = createClient()
    const payload = {
      nombre: form.nombre, apellido: form.apellido,
      edad: form.edad ? parseInt(form.edad) : null,
      celular: form.celular, dia_interes: form.dia_interes,
      franja_horaria: form.franja_horaria, nivel_curso: form.nivel_curso,
      observaciones: form.observaciones,
      ...(usuario?.instituto_id ? { instituto_id: usuario.instituto_id } : {}),
    }
    if (editandoId) {
      const { error } = await sb.from('lista_espera').update(payload).eq('id', editandoId)
      if (!error) {
        setLista(prev => prev.map(a => a.id === editandoId ? { ...a, ...payload } : a))
        logActivity('Editó lista de espera', 'Atención', `${form.nombre} ${form.apellido}`)
        cerrarModal()
      }
    } else {
      const { data, error } = await sb.from('lista_espera').insert(payload).select().single()
      if (!error && data) {
        setLista(prev => [data, ...prev])
        logActivity('Agregó a lista de espera', 'Atención', `${form.nombre} ${form.apellido}`)
        cerrarModal()
      }
    }
    setGuardando(false)
  }

  const cerrarModal = () => {
    setModal(false)
    setEditandoId(null)
    setForm(formVacio)
  }

  const eliminar = async (id: string) => {
    const a = lista.find(x => x.id === id)
    const sb = createClient()
    await sb.from('lista_espera').delete().eq('id', id)
    setLista(prev => prev.filter(x => x.id !== id))
    if (a) logActivity('Eliminó de lista de espera', 'Atención', `${a.nombre} ${a.apellido}`)
    setConfirmDel(null)
  }

  const abrirInscribir = (a: any) => {
    setFormInscripcion({
      fecha_alta: hoy(),
      matricula: '',
      cuota_mensual: '',
      nivel: a.nivel_curso && a.nivel_curso !== 'No sabe / A evaluar' ? a.nivel_curso : 'Básico',
      es_menor: (a.edad && a.edad < 18) || false,
      padre_nombre: '', padre_telefono: '', padre_email: '',
    })
    setModalInscribir(a)
  }

  const inscribirAlumno = async () => {
    if (!modalInscribir) return
    setInscribiendo(true)
    const a = modalInscribir
    try {
      const COLORES = ['#652f8d','#2d7a4f','#1a6b8a','#c0392b','#b45309','#7d3aab']
      const color = COLORES[Math.floor(Math.random() * COLORES.length)]
      const payload: any = {
        nombre: a.nombre, apellido: a.apellido, telefono: a.celular,
        nivel: formInscripcion.nivel,
        cuota_mensual: parseFloat(formInscripcion.cuota_mensual) || 0,
        matricula: parseFloat(formInscripcion.matricula) || 0,
        fecha_alta: formInscripcion.fecha_alta,
        es_menor: formInscripcion.es_menor,
        activo: true, color,
        edad: a.edad || 0,
      }
      if (formInscripcion.es_menor) {
        payload.padre_nombre = formInscripcion.padre_nombre
        payload.padre_telefono = formInscripcion.padre_telefono
        payload.padre_email = formInscripcion.padre_email
      }

      // Crear alumno via API Route (service role)
      const res = await fetch('/api/crear-alumno', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload)
      })
      const json = await res.json()

      if (json.data) {
        // Registrar matrícula si tiene valor
        if (payload.matricula > 0) {
          const sb = createClient()
          const hoyDate = new Date()
          await sb.from('pagos_alumnos').insert({
            alumno_id: json.data.id,
            mes: MESES[hoyDate.getMonth()],
            anio: hoyDate.getFullYear(),
            monto: payload.matricula,
            metodo: 'Efectivo',
            fecha_pago: hoy(),
            observaciones: 'Matrícula de inscripción'
          }).catch(() => {})
        }
        // Eliminar de lista de espera
        const sb = createClient()
        await sb.from('lista_espera').delete().eq('id', a.id)
        setLista(prev => prev.filter(x => x.id !== a.id))
        logActivity('Inscribió alumno desde lista de espera', 'Alumnos', `${a.nombre} ${a.apellido}`)
        setModalInscribir(null)
        alert(`✅ ${a.nombre} ${a.apellido} fue inscripto como alumno correctamente.`)
      } else {
        alert('Error al crear el alumno. Intentá de nuevo.')
      }
    } catch (e) {
      console.error(e)
      alert('Error inesperado. Intentá de nuevo.')
    }
    setInscribiendo(false)
  }

  const cambiarEstado = async (id: string, nuevoEstado: string) => {
    const sb = createClient()
    await sb.from('lista_espera').update({ estado_seguimiento: nuevoEstado }).eq('id', id)
    setLista(prev => prev.map(a => a.id === id ? { ...a, estado_seguimiento: nuevoEstado } : a))
  }

  const wsLink = (cel: string, nombre: string) => {
    const num = cel.replace(/\D/g, '')
    const texto = `Hola ${nombre}, te contactamos desde Next Ezeiza. Tenemos disponibilidad para el curso que consultaste. ¿Podemos coordinar?`
    return `https://wa.me/54${num}?text=${encodeURIComponent(texto)}`
  }

  const listaFiltrada = lista
    .filter(a => filtroEstado === 'todos' || (a.estado_seguimiento || 'nuevo') === filtroEstado)
    .filter(a => !busqueda || `${a.nombre} ${a.apellido} ${a.celular}`.toLowerCase().includes(busqueda.toLowerCase()))

  // KPIs de conversión por etapa
  const kpiEstados = ESTADOS_SEGUIMIENTO.map(e => ({
    ...e,
    count: lista.filter(a => (a.estado_seguimiento || 'nuevo') === e.id).length
  }))

  return (
    <div>
      {/* KPIs de etapas del pipeline */}
      <div style={{display:'grid',gridTemplateColumns:'repeat(4,1fr)',gap:'8px',marginBottom:'14px'}}>
        {kpiEstados.map(e => (
          <button key={e.id} onClick={() => setFiltroEstado(filtroEstado === e.id ? 'todos' : e.id)}
            style={{background: filtroEstado === e.id ? e.bg : 'var(--white)',border:`1.5px solid ${filtroEstado === e.id ? e.color : 'var(--border)'}`,borderRadius:'12px',padding:'10px 8px',textAlign:'center',cursor:'pointer',transition:'all .15s'}}>
            <div style={{fontSize:'20px',fontWeight:800,color:e.color}}>{e.count}</div>
            <div style={{fontSize:'10px',color:e.color,fontWeight:600,marginTop:'2px'}}>{e.label}</div>
          </button>
        ))}
      </div>

      <div style={{display:'flex',alignItems:'center',justifyContent:'space-between',marginBottom:'10px',gap:'8px',flexWrap:'wrap'}}>
        <div style={{fontSize:'13px',color:'var(--text2)',fontWeight:600}}>
          {filtroEstado === 'todos' ? `${lista.length} persona${lista.length!==1?'s':''} en espera` : `${listaFiltrada.length} en "${ESTADOS_SEGUIMIENTO.find(e=>e.id===filtroEstado)?.label}"`}
        </div>
        <div style={{display:'flex',gap:'6px'}}>
          {filtroEstado !== 'todos' && (
            <button onClick={() => setFiltroEstado('todos')} style={{padding:'7px 12px',background:'var(--bg)',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'8px',fontSize:'12px',cursor:'pointer'}}>✕ Limpiar filtro</button>
          )}
          <BtnP sm onClick={() => { setForm(formVacio); setEditandoId(null); setModal(true) }}>+ Agregar</BtnP>
        </div>
      </div>

      {/* Buscador */}
      {lista.length > 3 && (
        <div style={{position:'relative',marginBottom:'12px'}}>
          <input type="text" value={busqueda} onChange={e=>setBusqueda(e.target.value)} placeholder="Buscar por nombre o celular..."
            style={{...IS,paddingLeft:'38px'}} />
          <svg style={{position:'absolute',left:'12px',top:'50%',transform:'translateY(-50%)',width:'15px',height:'15px'}} viewBox="0 0 20 20" fill="none" stroke="var(--text3)" strokeWidth="2"><circle cx="9" cy="9" r="6"/><path d="M15 15l3 3"/></svg>
        </div>
      )}

      {loading ? (
        <div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>Cargando...</div>
      ) : listaFiltrada.length === 0 ? (
        <div style={{textAlign:'center',padding:'48px',color:'var(--text3)',background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px'}}>
          <div style={{fontSize:'32px',marginBottom:'8px'}}>⏳</div>
          <div style={{fontWeight:600,marginBottom:'4px'}}>Sin resultados</div>
          <div style={{fontSize:'13px'}}>{busqueda || filtroEstado !== 'todos' ? 'Sin resultados para el filtro aplicado.' : 'Agregá personas interesadas con el botón + Agregar'}</div>
        </div>
      ) : (
        <div>
          {listaFiltrada.map((a: any, idx: number) => {
            const color = COLORES_AV[idx % COLORES_AV.length]
            const estadoActual = a.estado_seguimiento || 'nuevo'
            const sigEstado = (est: string) => {
              const idx2 = ESTADOS_SEGUIMIENTO.findIndex(e => e.id === est)
              return ESTADOS_SEGUIMIENTO[Math.min(idx2 + 1, ESTADOS_SEGUIMIENTO.length - 1)].id
            }
            return (
              <div key={a.id} style={{background:'var(--white)',border:'1.5px solid var(--border)',borderRadius:'14px',padding:'14px 16px',marginBottom:'10px'}}>
                <div style={{display:'flex',alignItems:'flex-start',gap:'12px'}}>
                  {/* Avatar */}
                  <div style={{width:40,height:40,borderRadius:'12px',background:color,display:'flex',alignItems:'center',justifyContent:'center',fontSize:'14px',fontWeight:700,color:'#fff',flexShrink:0}}>
                    {a.nombre[0]}{a.apellido[0]}
                  </div>
                  <div style={{flex:1,minWidth:0}}>
                    <div style={{display:'flex',alignItems:'center',gap:'8px',flexWrap:'wrap'}}>
                      <div style={{fontSize:'15px',fontWeight:700}}>{a.nombre} {a.apellido}</div>
                      <EstadoBadge estado={estadoActual} onClick={() => {
                        const estados = ESTADOS_SEGUIMIENTO.map(e => e.id)
                        const idx3 = estados.indexOf(estadoActual)
                        const prox = estados[(idx3 + 1) % estados.length]
                        cambiarEstado(a.id, prox)
                      }} />
                    </div>
                    <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'1px'}}>
                      📱 {a.celular||'—'} · Agregado {a.created_at ? new Date(a.created_at).toLocaleDateString('es-AR',{day:'numeric',month:'short'}) : '—'}
                    </div>
                    <div style={{display:'flex',flexWrap:'wrap',gap:'5px',marginTop:'7px'}}>
                      {a.edad && <Chip>{a.edad} años</Chip>}
                      {a.dia_interes && <Chip color="var(--v)">{a.dia_interes}</Chip>}
                      {a.franja_horaria && <Chip color="#1a73e8">{a.franja_horaria}</Chip>}
                      {a.nivel_curso && <Chip color="#2d7a4f">{a.nivel_curso}</Chip>}
                    </div>
                    {a.observaciones && (
                      <div style={{fontSize:'12px',color:'var(--text3)',marginTop:'8px',padding:'7px 10px',background:'var(--bg)',borderRadius:'8px'}}>{a.observaciones}</div>
                    )}
                  </div>
                </div>

                {/* Acciones */}
                <div style={{display:'flex',gap:'6px',marginTop:'12px',flexWrap:'wrap'}}>
                  {/* Inscribir como alumno — acción principal */}
                  <button onClick={() => abrirInscribir(a)}
                    style={{flex:'1 1 auto',padding:'9px 12px',background:'var(--v)',color:'#fff',border:'none',borderRadius:'9px',fontSize:'12px',fontWeight:700,cursor:'pointer',display:'flex',alignItems:'center',justifyContent:'center',gap:'5px'}}>
                    <svg width="13" height="13" viewBox="0 0 20 20" fill="none" stroke="currentColor" strokeWidth="2.5"><path d="M16 17v-1a4 4 0 00-4-4H8a4 4 0 00-4 4v1"/><circle cx="10" cy="7" r="4"/></svg>
                    Inscribir como alumno
                  </button>
                  {a.celular && (
                    <a href={wsLink(a.celular, a.nombre)} target="_blank" rel="noopener noreferrer"
                      style={{padding:'9px 12px',background:'#25D366',color:'#fff',borderRadius:'9px',fontSize:'12px',fontWeight:600,textDecoration:'none',display:'flex',alignItems:'center',gap:'4px'}}>
                      <svg width="13" height="13" viewBox="0 0 24 24" fill="currentColor"><path d="M17.472 14.382c-.297-.149-1.758-.867-2.03-.967-.273-.099-.471-.148-.67.15-.197.297-.767.966-.94 1.164-.173.199-.347.223-.644.075-.297-.15-1.255-.463-2.39-1.475-.883-.788-1.48-1.761-1.653-2.059-.173-.297-.018-.458.13-.606.134-.133.298-.347.446-.52.149-.174.198-.298.298-.497.099-.198.05-.371-.025-.52-.075-.149-.669-1.612-.916-2.207-.242-.579-.487-.5-.669-.51-.173-.008-.371-.01-.57-.01-.198 0-.52.074-.792.372-.272.297-1.04 1.016-1.04 2.479 0 1.462 1.065 2.875 1.213 3.074.149.198 2.096 3.2 5.077 4.487.709.306 1.262.489 1.694.625.712.227 1.36.195 1.871.118.571-.085 1.758-.719 2.006-1.413.248-.694.248-1.289.173-1.413-.074-.124-.272-.198-.57-.347m-5.421 7.403h-.004a9.87 9.87 0 01-5.031-1.378l-.361-.214-3.741.982.998-3.648-.235-.374a9.86 9.86 0 01-1.51-5.26c.001-5.45 4.436-9.884 9.888-9.884 2.64 0 5.122 1.03 6.988 2.898a9.825 9.825 0 012.893 6.994c-.003 5.45-4.437 9.884-9.885 9.884m8.413-18.297A11.815 11.815 0 0012.05 0C5.495 0 .16 5.335.157 11.892c0 2.096.547 4.142 1.588 5.945L.057 24l6.305-1.654a11.882 11.882 0 005.683 1.448h.005c6.554 0 11.89-5.335 11.893-11.893a11.821 11.821 0 00-3.48-8.413z"/></svg>
                      WS
                    </a>
                  )}
                  <button onClick={() => abrirEditar(a)}
                    style={{padding:'9px 10px',background:'var(--bg)',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'9px',fontSize:'12px',fontWeight:600,cursor:'pointer'}}>
                    Editar
                  </button>
                  <button onClick={() => setConfirmDel(a.id)}
                    style={{padding:'9px 10px',background:'var(--redl)',color:'var(--red)',border:'1px solid #f5c5c5',borderRadius:'9px',fontSize:'12px',cursor:'pointer'}}>
                    ✕
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      )}

      {/* MODAL AGREGAR / EDITAR */}
      {modal && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)cerrarModal()}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'90vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'20px'}}>{editandoId ? 'Editar interesado' : 'Agregar a lista de espera'}</div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Nombre *"><input style={IS} value={form.nombre} onChange={e=>setForm({...form,nombre:e.target.value})} /></Field>
              <Field label="Apellido *"><input style={IS} value={form.apellido} onChange={e=>setForm({...form,apellido:e.target.value})} /></Field>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Edad"><input style={IS} type="number" min="4" max="99" value={form.edad} onChange={e=>setForm({...form,edad:e.target.value})} /></Field>
              <Field label="Celular *"><input style={IS} value={form.celular} onChange={e=>setForm({...form,celular:e.target.value})} placeholder="Ej: 1155554444" /></Field>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Día de interés">
                <select style={IS} value={form.dia_interes} onChange={e=>setForm({...form,dia_interes:e.target.value})}>
                  <option value="">— Sin preferencia —</option>
                  {DIAS_SEMANA.map(d => <option key={d}>{d}</option>)}
                </select>
              </Field>
              <Field label="Franja horaria">
                <select style={IS} value={form.franja_horaria} onChange={e=>setForm({...form,franja_horaria:e.target.value})}>
                  <option value="">— Sin preferencia —</option>
                  {FRANJAS.map(f => <option key={f}>{f}</option>)}
                </select>
              </Field>
            </div>
            <Field label="Nivel / Curso de interés" style={{marginBottom:'10px'}}>
              <select style={IS} value={form.nivel_curso} onChange={e=>setForm({...form,nivel_curso:e.target.value})}>
                <option value="">— No especificado —</option>
                {NIVELES_INTERES.map(n => <option key={n}>{n}</option>)}
              </select>
            </Field>
            <Field label="Observaciones" style={{marginBottom:'16px'}}>
              <textarea style={{...IS,resize:'none',lineHeight:1.5}} rows={2}
                value={form.observaciones} onChange={(e:any)=>setForm({...form,observaciones:e.target.value})}
                placeholder="Notas adicionales..." />
            </Field>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={cerrarModal} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <BtnP style={{flex:2}} onClick={guardar} disabled={guardando}>{guardando ? 'Guardando...' : editandoId ? 'Guardar cambios' : 'Agregar'}</BtnP>
            </div>
          </div>
        </div>
      )}

      {/* MODAL INSCRIBIR COMO ALUMNO */}
      {modalInscribir && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setModalInscribir(null)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px',maxHeight:'92vh',overflowY:'auto'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'4px'}}>Inscribir como alumno</div>
            <div style={{fontSize:'13px',color:'var(--text2)',marginBottom:'20px'}}>{modalInscribir.nombre} {modalInscribir.apellido} será creado como alumno activo y removido de la lista de espera.</div>

            {/* Datos heredados (solo lectura) */}
            <div style={{background:'var(--vl)',borderRadius:'12px',padding:'12px',marginBottom:'16px',fontSize:'13px',color:'var(--text2)'}}>
              <div style={{fontWeight:600,color:'var(--v)',marginBottom:'4px'}}>Datos heredados de la lista</div>
              <div>📱 {modalInscribir.celular||'—'} · {modalInscribir.nivel_curso||'Nivel a definir'}</div>
              {modalInscribir.observaciones && <div style={{marginTop:'3px',fontSize:'12px'}}>📝 {modalInscribir.observaciones}</div>}
            </div>

            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Nivel">
                <select style={IS} value={formInscripcion.nivel} onChange={e=>setFormInscripcion({...formInscripcion,nivel:e.target.value})}>
                  {['Básico','Intermedio','Advanced','Cambridge'].map(n=><option key={n}>{n}</option>)}
                </select>
              </Field>
              <Field label="Cuota mensual ($)">
                <input style={IS} type="number" value={formInscripcion.cuota_mensual} onChange={e=>setFormInscripcion({...formInscripcion,cuota_mensual:e.target.value})} placeholder="0" />
              </Field>
            </div>
            <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
              <Field label="Matrícula ($)">
                <input style={IS} type="number" value={formInscripcion.matricula} onChange={e=>setFormInscripcion({...formInscripcion,matricula:e.target.value})} placeholder="0" />
              </Field>
              <Field label="Fecha de alta">
                <input style={IS} type="date" value={formInscripcion.fecha_alta} onChange={e=>setFormInscripcion({...formInscripcion,fecha_alta:e.target.value})} />
              </Field>
            </div>
            <Field label="¿Es menor de edad?" style={{marginBottom:'10px'}}>
              <select style={IS} value={formInscripcion.es_menor?'si':'no'} onChange={e=>setFormInscripcion({...formInscripcion,es_menor:e.target.value==='si'})}>
                <option value="no">No</option>
                <option value="si">Sí</option>
              </select>
            </Field>
            {formInscripcion.es_menor && (
              <>
                <Field label="Nombre padre/madre" style={{marginBottom:'10px'}}>
                  <input style={IS} value={formInscripcion.padre_nombre} onChange={e=>setFormInscripcion({...formInscripcion,padre_nombre:e.target.value})} />
                </Field>
                <div style={{display:'grid',gridTemplateColumns:'1fr 1fr',gap:'10px',marginBottom:'10px'}}>
                  <Field label="Tel. padre/madre"><input style={IS} value={formInscripcion.padre_telefono} onChange={e=>setFormInscripcion({...formInscripcion,padre_telefono:e.target.value})} /></Field>
                  <Field label="Email padre/madre"><input style={IS} value={formInscripcion.padre_email} onChange={e=>setFormInscripcion({...formInscripcion,padre_email:e.target.value})} /></Field>
                </div>
              </>
            )}

            <div style={{padding:'10px 12px',borderRadius:'10px',fontSize:'12.5px',color:'var(--amber)',background:'var(--amberl)',border:'1px solid #e8d080',marginBottom:'14px',lineHeight:1.5}}>
              ⚠ Esta acción crea el alumno y lo elimina de la lista de espera. No se puede deshacer.
            </div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={() => setModalInscribir(null)} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <BtnP style={{flex:2}} onClick={inscribirAlumno} disabled={inscribiendo}>{inscribiendo ? 'Inscribiendo...' : '✓ Confirmar inscripción'}</BtnP>
            </div>
          </div>
        </div>
      )}

      {/* CONFIRMAR ELIMINAR */}
      {confirmDel && (
        <div style={{position:'fixed',inset:0,background:'rgba(20,0,40,.45)',display:'flex',alignItems:'flex-end',justifyContent:'center',zIndex:200}} onClick={e=>{if(e.target===e.currentTarget)setConfirmDel(null)}}>
          <div style={{background:'var(--white)',borderRadius:'24px 24px 0 0',padding:'28px 20px 32px',width:'100%',maxWidth:'480px'}}>
            <div style={{width:'40px',height:'4px',background:'var(--border)',borderRadius:'2px',margin:'0 auto 20px'}} />
            <div style={{fontSize:'18px',fontWeight:700,marginBottom:'8px'}}>¿Eliminar de la lista?</div>
            <div style={{fontSize:'14px',color:'var(--text2)',marginBottom:'20px'}}>Esta acción no se puede deshacer.</div>
            <div style={{display:'flex',gap:'10px'}}>
              <button onClick={() => setConfirmDel(null)} style={{flex:1,padding:'12px',background:'transparent',color:'var(--text2)',border:'1.5px solid var(--border)',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Cancelar</button>
              <button onClick={() => eliminar(confirmDel)} style={{flex:2,padding:'12px',background:'var(--red)',color:'#fff',border:'none',borderRadius:'10px',fontSize:'14px',fontWeight:600,cursor:'pointer'}}>Sí, eliminar</button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

// ── HELPERS ──
const SL = ({children,style}:any) => <div style={{fontSize:'11px',fontWeight:700,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.07em',...style}}>{children}</div>
const TabBtn = ({children,active,onClick}:any) => <button onClick={onClick} style={{padding:'9px 14px',borderRadius:'20px',fontSize:'13px',fontWeight:600,cursor:'pointer',border:'1.5px solid',borderColor:active?'var(--v)':'var(--border)',background:active?'var(--v)':'var(--white)',color:active?'#fff':'var(--text2)',whiteSpace:'nowrap'}}>{children}</button>
const BtnP = ({children,sm,onClick,style,disabled}:any) => <button onClick={onClick} disabled={disabled} style={{padding:sm?'9px 14px':'12px 20px',background:disabled?'#aaa':'var(--v)',color:'#fff',border:'none',borderRadius:'10px',fontSize:sm?'13px':'14px',fontWeight:600,cursor:disabled?'not-allowed':'pointer',...style}}>{children}</button>
const Chip = ({children,color='var(--text3)'}:any) => <span style={{padding:'2px 9px',borderRadius:'20px',fontSize:'11.5px',fontWeight:600,background:'var(--bg)',color,border:`1px solid ${color}22`}}>{children}</span>
const Field = ({label,children,style}:any) => <div style={{marginBottom:'2px',...style}}><div style={{fontSize:'10.5px',fontWeight:600,color:'var(--text3)',textTransform:'uppercase',letterSpacing:'.04em',marginBottom:'3px'}}>{label}</div>{children}</div>
