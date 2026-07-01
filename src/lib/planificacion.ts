// src/lib/planificacion.ts
// Única fuente de verdad para el estado de una unidad de planificación.
// La usan Cursos.tsx (tabs Planificación y Progreso) y Dashboard.tsx (alerta de atraso).
// Lo único manual es "dictada" (el checkbox). Todo lo demás — pendiente, en_curso,
// atrasada — se calcula SIEMPRE comparando fechas contra hoy, nunca queda un valor
// viejo guardado en la base sin actualizarse.

export type EstadoUnidadCalc = 'pendiente' | 'en_curso' | 'atrasada' | 'dictada'

export function hoyISO(): string {
  return new Date().toISOString().split('T')[0]
}

export function calcularEstadoUnidad(u: {
  estado?: string
  fecha_inicio?: string | null
  fecha_cierre?: string | null
}): EstadoUnidadCalc {
  if (u.estado === 'dictada') return 'dictada'
  const hoyStr = hoyISO()
  const fc = u.fecha_cierre || null
  const fi = u.fecha_inicio || null
  if (fc && fc < hoyStr) return 'atrasada'
  if (fi && fi <= hoyStr && (!fc || fc >= hoyStr)) return 'en_curso'
  return 'pendiente'
}
