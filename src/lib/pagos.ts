// ── src/lib/pagos.ts ─────────────────────────────────────────────────────────
// Fuente única de verdad para determinar si un alumno "pagó" su cuota de un
// mes dado. Usado por: Pagos.tsx (Deudores, registrar pagos), Alumnos.tsx
// (historial individual, filtro Pagó/No pagó) y la API registrar-pago.
//
// Por qué existe este archivo:
// Antes había 3-4 lugares distintos que definían "pagó" de formas diferentes
// (algunos miraban el tipo de pago, otros el monto, otros cualquier registro
// sin importar el tipo). Eso causaba que un alumno con un pago legítimo pero
// con descuento apareciera como "Deudor" en una pantalla y "Al día" en otra.
// ─────────────────────────────────────────────────────────────────────────────

export type PagoAlumno = {
  tipo?: string | null
  monto?: number | null
}

/**
 * Tipos de pago que representan "la cuota mensual del alumno está saldada",
 * sin importar el monto exacto (un tipo 'cuota_descuento' puede tener un
 * monto menor a cuota_mensual de forma intencional).
 * Solo puede existir UNO de estos por alumno/mes (ver TIPOS_QUE_REEMPLAZAN
 * en la API de registrar-pago).
 */
export const TIPOS_CUOTA_COMPLETA = ['cuota', 'recargo', 'cuota_recargo', 'cuota_descuento'] as const

/** Filtro .or() de Supabase equivalente a TIPOS_CUOTA_COMPLETA (incluye tipo NULL, pagos legacy) */
export const FILTRO_SUPABASE_CUOTA_COMPLETA =
  'tipo.is.null,tipo.eq.cuota,tipo.eq.recargo,tipo.eq.cuota_recargo,tipo.eq.cuota_descuento'

/** true si el pago cuenta como "cuota mensual saldada" (independiente del monto) */
export function esPagoCuotaCompleta(p: PagoAlumno): boolean {
  return !p.tipo || (TIPOS_CUOTA_COMPLETA as readonly string[]).includes(p.tipo)
}

export type EstadoPagoMes = 'pagado' | 'parcial' | 'deudor'

/**
 * Determina el estado de pago de un alumno para un mes dado, a partir de
 * TODOS los pagos de ese alumno en ese mes (puede haber varios: proporcionales
 * acumulados, matrícula, examen, etc — este helper filtra lo relevante).
 *
 * - 'pagado'  → tiene un pago de tipo cuota/recargo/cuota_recargo/cuota_descuento
 *               (el monto ya refleja lo que corresponde, incluido un descuento).
 * - 'parcial' → no tiene cuota completa, pero sí algún monto proporcional > 0
 *               cargado ese mes (pago parcial, todavía debe el resto).
 * - 'deudor'  → no hay ningún registro de pago para ese mes.
 *
 * Para alumnos con clases particulares (tarifa_clase) el criterio es más
 * simple: pagado si hay algún monto > 0 cargado, si no, deudor (no aplica
 * el concepto de "parcial").
 */
export function estadoPagoMes(pagosDelMes: PagoAlumno[], opts?: { esClaseParticular?: boolean }): EstadoPagoMes {
  if (opts?.esClaseParticular) {
    const pagoTotal = pagosDelMes.reduce((s, p) => s + (p.monto || 0), 0)
    return pagoTotal > 0 ? 'pagado' : 'deudor'
  }
  if (pagosDelMes.some(esPagoCuotaCompleta)) return 'pagado'
  const sumaProporcional = pagosDelMes
    .filter(p => p.tipo === 'proporcional')
    .reduce((s, p) => s + (p.monto || 0), 0)
  if (sumaProporcional > 0) return 'parcial'
  return 'deudor'
}
