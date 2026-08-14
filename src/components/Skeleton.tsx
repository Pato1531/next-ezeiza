'use client'

// Skeleton loader compartido — reemplazo directo del patrón repetido
// `<div style={{textAlign:'center',padding:'32px',color:'var(--text3)'}}>Cargando...</div>`
// que aparecía suelto en varios módulos. Mismo lugar en pantalla, misma
// altura aproximada, pero da una referencia visual de qué va a aparecer
// en vez de un texto vacío.

export function Skeleton({ padding = '24px', lines = 3 }: { padding?: string; lines?: number }) {
  return (
    <div style={{ padding, display: 'flex', flexDirection: 'column', gap: '10px' }}>
      {Array.from({ length: lines }).map((_, i) => (
        <div
          key={i}
          className="skeleton-bar"
          style={{ height: '14px', borderRadius: '7px', width: i === lines - 1 ? '55%' : '100%' }}
        />
      ))}
    </div>
  )
}

export default Skeleton
