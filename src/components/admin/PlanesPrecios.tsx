'use client'

// Editor de planes del panel admin: precio mensual, promo de los primeros meses y módulos incluidos.
import { useEffect, useState } from 'react'

type Plan = {
  codigo: string
  nombre: string
  precio_mensual: number
  moneda: string
  promo_porcentaje: number
  promo_meses: number
  modulos: string[]
}
type Modulo = { id: string; label: string }

const fmt = (n: number) => '$' + Math.round(n).toLocaleString('es-AR')

export default function PlanesPrecios({ clave, onVolver }: { clave: string; onVolver: () => void }) {
  const [planes, setPlanes] = useState<Plan[]>([])
  const [catalogo, setCatalogo] = useState<Modulo[]>([])
  const [borrador, setBorrador] = useState<Record<string, Plan>>({})
  const [guardando, setGuardando] = useState('')
  const [msg, setMsg] = useState<Record<string, { tipo: 'ok' | 'error'; texto: string }>>({})
  const [cargando, setCargando] = useState(true)
  const [error, setError] = useState('')

  useEffect(() => {
    fetch('/api/admin-planes', { headers: { 'x-admin-key': clave } })
      .then(async res => {
        const json = await res.json()
        if (!res.ok) throw new Error(json.error || 'Error al cargar')
        setPlanes(json.planes || [])
        setCatalogo(json.catalogo || [])
        const b: Record<string, Plan> = {}
        ;(json.planes || []).forEach((p: Plan) => { b[p.codigo] = { ...p, modulos: [...p.modulos] } })
        setBorrador(b)
      })
      .catch(e => setError(e.message))
      .finally(() => setCargando(false))
  }, [clave])

  const editar = (codigo: string, cambio: Partial<Plan>) =>
    setBorrador(prev => ({ ...prev, [codigo]: { ...prev[codigo], ...cambio } }))

  const toggleModulo = (codigo: string, id: string) => {
    const actual = borrador[codigo]?.modulos || []
    editar(codigo, { modulos: actual.includes(id) ? actual.filter(m => m !== id) : [...actual, id] })
  }

  const guardar = async (codigo: string) => {
    const p = borrador[codigo]
    setGuardando(codigo)
    setMsg(prev => ({ ...prev, [codigo]: undefined as any }))
    try {
      const res = await fetch('/api/admin-planes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'x-admin-key': clave },
        body: JSON.stringify({
          codigo,
          precio_mensual: p.precio_mensual,
          promo_porcentaje: p.promo_porcentaje,
          promo_meses: p.promo_meses,
          modulos: p.modulos,
        }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error || 'No se pudo guardar')
      setPlanes(prev => prev.map(x => (x.codigo === codigo ? { ...json.plan, modulos: [...json.plan.modulos] } : x)))
      setMsg(prev => ({ ...prev, [codigo]: { tipo: 'ok', texto: '✓ Plan guardado' } }))
    } catch (e: any) {
      setMsg(prev => ({ ...prev, [codigo]: { tipo: 'error', texto: e.message } }))
    } finally {
      setGuardando('')
    }
  }

  const card = { background: '#fff', borderRadius: '16px', padding: '20px', border: '1px solid #e8e0f4' } as const
  const label = { display: 'block', fontSize: '11px', fontWeight: 700, color: '#9b8eaa', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: '6px' }
  const input = { width: '100%', padding: '9px 12px', border: '1.5px solid #e0d8f0', borderRadius: '10px', fontSize: '14px', color: '#1a1020', background: '#fff', boxSizing: 'border-box' as const }

  return (
    <div style={{ minHeight: '100vh', background: '#f4f0fa', padding: '24px 16px' }}>
      <div style={{ maxWidth: '900px', margin: '0 auto' }}>

        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '20px', flexWrap: 'wrap', gap: '10px' }}>
          <div>
            <div style={{ fontSize: '22px', fontWeight: 800, letterSpacing: '-.5px' }}>
              <span style={{ color: '#652f8d' }}>Next</span> Admin
            </div>
            <div style={{ fontSize: '13px', color: '#9b8eaa' }}>Planes, precios y módulos</div>
          </div>
          <button onClick={onVolver} style={{ padding: '8px 14px', background: '#fff', border: '1.5px solid #e0d8f0', borderRadius: '10px', fontSize: '13px', fontWeight: 600, color: '#652f8d', cursor: 'pointer' }}>
            ← Alta de sede
          </button>
        </div>

        {cargando ? (
          <div style={{ ...card, textAlign: 'center', color: '#9b8eaa' }}>Cargando...</div>
        ) : error ? (
          <div style={{ ...card, textAlign: 'center', color: '#c0392b' }}>{error}</div>
        ) : (
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: '14px' }}>
            {planes.map(p => {
              const b = borrador[p.codigo] || p
              const precioPromo = b.precio_mensual * (1 - (b.promo_porcentaje || 0) / 100)
              return (
                <div key={p.codigo} style={card}>
                  <div style={{ fontSize: '20px', fontWeight: 800, marginBottom: '14px' }}>{p.nombre}</div>

                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px', marginBottom: '12px' }}>
                    <div>
                      <span style={label}>Precio mensual ($)</span>
                      <input type="number" min={0} style={input} value={b.precio_mensual}
                        onChange={e => editar(p.codigo, { precio_mensual: Number(e.target.value) })} />
                    </div>
                    <div>
                      <span style={label}>Descuento promo (%)</span>
                      <input type="number" min={0} max={100} style={input} value={b.promo_porcentaje}
                        onChange={e => editar(p.codigo, { promo_porcentaje: Number(e.target.value) })} />
                    </div>
                    <div>
                      <span style={label}>Meses con promo</span>
                      <input type="number" min={0} max={12} style={input} value={b.promo_meses}
                        onChange={e => editar(p.codigo, { promo_meses: Number(e.target.value) })} />
                    </div>
                    <div>
                      <span style={label}>Se muestra así</span>
                      <div style={{ fontSize: '13px', color: '#1a1020', padding: '9px 0', lineHeight: 1.5 }}>
                        {b.promo_meses > 0 && b.promo_porcentaje > 0
                          ? <><b>{fmt(precioPromo)}</b> los primeros {b.promo_meses} meses, después {fmt(b.precio_mensual)}</>
                          : <><b>{fmt(b.precio_mensual)}</b> por mes</>}
                      </div>
                    </div>
                  </div>

                  <span style={label}>Módulos incluidos ({b.modulos.length})</span>
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '6px 12px', marginBottom: '14px' }}>
                    {catalogo.map(m => (
                      <label key={m.id} style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '13px', color: '#1a1020', cursor: 'pointer' }}>
                        <input type="checkbox" checked={b.modulos.includes(m.id)} onChange={() => toggleModulo(p.codigo, m.id)} />
                        {m.label}
                      </label>
                    ))}
                  </div>

                  {msg[p.codigo] && (
                    <div style={{ fontSize: '12px', marginBottom: '8px', color: msg[p.codigo]?.tipo === 'ok' ? '#2d7a4f' : '#c0392b' }}>
                      {msg[p.codigo]?.texto}
                    </div>
                  )}
                  <button onClick={() => guardar(p.codigo)} disabled={guardando === p.codigo}
                    style={{ width: '100%', padding: '11px', background: '#652f8d', color: '#fff', border: 'none', borderRadius: '10px', fontSize: '14px', fontWeight: 700, cursor: 'pointer' }}>
                    {guardando === p.codigo ? 'Guardando...' : 'Guardar plan ' + p.nombre}
                  </button>
                </div>
              )
            })}
          </div>
        )}
      </div>
    </div>
  )
}
