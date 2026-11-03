// src/lib/prueba.ts
// Prueba gratuita de 7 días por sede. Funciones puras: las usan el middleware, el cliente y el admin.
// Regla: si prueba_hasta tiene fecha y ya pasó, la sede queda en solo lectura (bloqueo total de escrituras).
// Sin fecha (null) = sede normal con plan pagado, nunca se bloquea.
export const DIAS_PRUEBA = 7
const MS_DIA = 86400000

export type EstadoPrueba = {
  estado: 'sin_prueba' | 'en_prueba' | 'vencida'
  diasRestantes: number
}

export function estadoPrueba(prueba_hasta: string | null | undefined, ahora: number = Date.now()): EstadoPrueba {
  if (!prueba_hasta) return { estado: 'sin_prueba', diasRestantes: 0 }
  const hasta = Date.parse(prueba_hasta)
  if (!Number.isFinite(hasta)) return { estado: 'sin_prueba', diasRestantes: 0 }
  if (ahora >= hasta) return { estado: 'vencida', diasRestantes: 0 }
  return { estado: 'en_prueba', diasRestantes: Math.ceil((hasta - ahora) / MS_DIA) }
}

const METODOS_ESCRITURA = ['POST', 'PUT', 'PATCH', 'DELETE']

// ¿Hay que rechazar esta petición? Solo escrituras de la API del instituto, nunca las del panel admin.
export function bloqueaEscritura(metodo: string, ruta: string, prueba_hasta: string | null | undefined, ahora?: number): boolean {
  if (!METODOS_ESCRITURA.includes(metodo.toUpperCase())) return false
  if (ruta.startsWith('/api/admin-')) return false
  return estadoPrueba(prueba_hasta, ahora).estado === 'vencida'
}

export function fechaFinPrueba(desde: number = Date.now()): string {
  return new Date(desde + DIAS_PRUEBA * MS_DIA).toISOString()
}
