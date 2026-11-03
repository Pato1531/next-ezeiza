// src/lib/modulos-plan.ts
// Catálogo de módulos que se pueden incluir en un plan y valores por defecto de los planes.
// Los ids coinciden con los de PERMISOS / TODOS_MODULOS de la app.
export const MODULOS_PLAN = [
  { id: 'dashboard',         label: 'Dashboard (inicio)' },
  { id: 'alumnos',           label: 'Alumnos (fichas y pagos)' },
  { id: 'cursos',            label: 'Cursos' },
  { id: 'horarios',          label: 'Horarios' },
  { id: 'profesoras',        label: 'Docentes' },
  { id: 'reportes',          label: 'Reportes' },
  { id: 'agenda',            label: 'Agenda' },
  { id: 'atencion',          label: 'Atención al cliente' },
  { id: 'cuotas',            label: 'Cuotas por curso' },
  { id: 'ejecutivo',         label: 'Dashboard Ejecutivo' },
  { id: 'actividad',         label: 'Actividad (auditoría)' },
  { id: 'personalizaciones', label: 'Personalizaciones' },
  { id: 'permisos',          label: 'Permisos' },
  { id: 'perfil',            label: 'Perfil' },
] as const

export const MODULOS_IDS: string[] = MODULOS_PLAN.map(m => m.id)

// Standard = todo menos Atención al cliente, Dashboard Ejecutivo y Actividad
export const MODULOS_STANDARD: string[] = MODULOS_IDS.filter(m => !['atencion', 'ejecutivo', 'actividad'].includes(m))
