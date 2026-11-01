// src/lib/alertas.ts
// Configuración de las alertas del instituto (Personalizaciones → Alertas).
// Los valores por defecto viven acá. Lo que guardan dirección, coordinación y
// secretaría se guarda en institutos.config_alertas (jsonb) y se normaliza con
// validarConfigAlertas, tanto en la API como al leerlo en la app.

export type ConfigAlertas = {
  ausencias: { activa: boolean }
  alumnos_sin_curso: { activa: boolean }
  cuotas_sin_pago: { activa: boolean; dia_desde: number }
  planificacion_atrasada: { activa: boolean; unidades_criticas: number; dias_examen_critico: number }
  examen_proximo: { activa: boolean; dias: number }
  evaluaciones_pendientes: { activa: boolean }
  clases_sin_registrar: { activa: boolean; solo_iniciadas: boolean }
  cumpleanos: { activa: boolean; dias_anticipacion: number }
}

// Valores por defecto: son los mismos comportamientos que tenía la app antes de esta configuración.
// La única excepción pedida es cuotas_sin_pago.dia_desde = 11.
export const CONFIG_ALERTAS_DEFAULT: ConfigAlertas = {
  ausencias: { activa: true },
  alumnos_sin_curso: { activa: true },
  cuotas_sin_pago: { activa: true, dia_desde: 11 },
  planificacion_atrasada: { activa: true, unidades_criticas: 2, dias_examen_critico: 14 },
  examen_proximo: { activa: true, dias: 30 },
  evaluaciones_pendientes: { activa: true },
  clases_sin_registrar: { activa: true, solo_iniciadas: false },
  cumpleanos: { activa: true, dias_anticipacion: 0 },
}

// Rangos válidos para cada parámetro numérico (se validan en la API y en la pantalla).
export const RANGOS = {
  umbral: { min: 1, max: 10 },              // faltas seguidas (columna institutos.umbral_ausencias)
  dia_desde: { min: 1, max: 28 },           // día del mes desde el que se avisa la cuota
  unidades_criticas: { min: 1, max: 10 },   // unidades atrasadas para marcar crítico
  dias_examen_critico: { min: 1, max: 60 }, // días hacia adelante para considerar un examen "próximo" en planificación
  dias: { min: 1, max: 60 },                // días hacia adelante para "examen próximo"
  dias_anticipacion: { min: 0, max: 30 },   // días de anticipación para cumpleaños (30 es el máximo que carga la app)
} as const

export const UMBRAL_DEFAULT = 2

function copiaDefault(): ConfigAlertas {
  return JSON.parse(JSON.stringify(CONFIG_ALERTAS_DEFAULT)) as ConfigAlertas
}

// Valida lo que llega de la pantalla o de la base.
// Los campos que no vienen usan el valor por defecto.
export function validarConfigAlertas(raw: unknown): { ok: true; value: ConfigAlertas } | { ok: false; error: string } {
  const value = copiaDefault()
  if (raw === undefined || raw === null) return { ok: true, value }
  if (typeof raw !== 'object' || Array.isArray(raw)) {
    return { ok: false, error: 'La configuración de alertas no es válida' }
  }
  const entrada = raw as Record<string, unknown>
  for (const seccion of Object.keys(value) as (keyof ConfigAlertas)[]) {
    const bloque = entrada[seccion]
    if (bloque === undefined) continue
    if (typeof bloque !== 'object' || bloque === null || Array.isArray(bloque)) {
      return { ok: false, error: `La alerta "${seccion}" no es válida` }
    }
    const destino = value[seccion] as Record<string, boolean | number>
    const origen = bloque as Record<string, unknown>
    for (const campo of Object.keys(destino)) {
      const v = origen[campo]
      if (v === undefined) continue
      if (typeof destino[campo] === 'boolean') {
        if (typeof v !== 'boolean') return { ok: false, error: `Valor inválido en ${seccion}.${campo}` }
        destino[campo] = v
      } else {
        const rango = RANGOS[campo as keyof typeof RANGOS]
        if (typeof v !== 'number' || !Number.isInteger(v) || v < rango.min || v > rango.max) {
          return { ok: false, error: `El valor de ${campo} debe estar entre ${rango.min} y ${rango.max}` }
        }
        destino[campo] = v
      }
    }
  }
  return { ok: true, value }
}

// Configuración lista para usar: si el dato guardado no es válido, se usan los valores por defecto.
export function configAlertas(raw: unknown): ConfigAlertas {
  const r = validarConfigAlertas(raw)
  return r.ok ? r.value : copiaDefault()
}
