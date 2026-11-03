// src/lib/modulos-efectivos.ts
// Cálculo de los módulos activos de un cliente: los del plan, con los ajustes de soporte encima.
// Funciones puras: las usan las rutas del admin y se prueban sin base de datos.
import { MODULOS_IDS } from './modulos-plan'

export type AjusteModulos = Record<string, boolean>

// Estos módulos no se pueden desactivar nunca (perfil propio y datos de la cuenta).
export const MODULOS_SIEMPRE: string[] = ['perfil']

// Un ajuste válido es un objeto cuyos valores son true o false.
export function ajusteValido(raw: unknown): raw is AjusteModulos {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return false
  return Object.values(raw as Record<string, unknown>).every(v => typeof v === 'boolean')
}

// Módulos activos finales, en el orden del catálogo.
export function modulosEfectivos(modulosPlan: string[], ajuste: AjusteModulos | null | undefined): string[] {
  const activos = new Set(modulosPlan.filter(m => MODULOS_IDS.includes(m)))
  for (const [modulo, activo] of Object.entries(ajuste || {})) {
    if (!MODULOS_IDS.includes(modulo)) continue
    if (activo) activos.add(modulo)
    else activos.delete(modulo)
  }
  for (const m of MODULOS_SIEMPRE) activos.add(m)
  return MODULOS_IDS.filter(m => activos.has(m))
}

// Ajusta un módulo puntual.
// activo = null: vuelve al plan (se quita el ajuste).
// Si el valor coincide con lo que ya trae el plan, tampoco hace falta guardar el ajuste.
export function ajustarModulo(
  ajuste: AjusteModulos,
  modulo: string,
  activo: boolean | null,
  enPlan: boolean
): AjusteModulos {
  const nuevo: AjusteModulos = { ...ajuste }
  if (activo === null || activo === enPlan) delete nuevo[modulo]
  else nuevo[modulo] = activo
  return nuevo
}
