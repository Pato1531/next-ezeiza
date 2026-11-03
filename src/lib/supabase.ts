import { createClient as createSupabaseClient } from '@supabase/supabase-js'

// ── Cliente singleton con lazy initialization ─────────────────────────────────
// NO se instancia a nivel de módulo — eso causa "supabaseUrl is required"
// durante el prerender de Next.js porque las env vars no están disponibles
// en build time. Se crea la primera vez que se llama createClient().
let _client: ReturnType<typeof createSupabaseClient> | null = null

// Bloqueo de escrituras directas a la base (prueba vencida): lo activa auth-context.
let _soloLectura = false
export function setSoloLectura(v: boolean) { _soloLectura = v }

const fetchConBloqueo: typeof fetch = (input, init) => {
  const metodo = (init?.method || (input instanceof Request ? input.method : 'GET')).toUpperCase()
  const url = typeof input === 'string' ? input : input instanceof URL ? input.href : input.url
  const esEscrituraDeDatos = metodo !== 'GET' && metodo !== 'HEAD' && /\/(rest|storage|functions)\/v1\//.test(url)
  if (_soloLectura && esEscrituraDeDatos) {
    return Promise.resolve(new Response(
      JSON.stringify({ message: 'Tu prueba terminó: el instituto está en modo solo lectura', code: 'PRUEBA_VENCIDA' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    ))
  }
  return fetch(input, init)
}

export function createClient() {
  if (!_client) {
    const url = process.env.NEXT_PUBLIC_SUPABASE_URL
    const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
    if (!url || !key) {
      // En build time (SSR/prerender) las variables no existen — devolver stub seguro
      // Los componentes 'use client' nunca llegan a ejecutar esto en el servidor
      throw new Error('[Supabase] Variables de entorno no disponibles. Verificar NEXT_PUBLIC_SUPABASE_URL y NEXT_PUBLIC_SUPABASE_ANON_KEY en Vercel.')
    }
    _client = createSupabaseClient(url, key, {
      global: { fetch: fetchConBloqueo },
      auth: {
        persistSession: true,
        autoRefreshToken: true,
        // true: el cliente lee los tokens del link de invitación / recuperación
        detectSessionInUrl: true,
      },
    })
  }
  return _client
}

// Alias para compatibilidad con código que importa supabaseClient directamente
export { createClient as default }

// No-op — mantener por compatibilidad
export function destroyClient() {}

// ── Tipos ─────────────────────────────────────────────────────────────────────
export type Rol = 'director' | 'coordinadora' | 'secretaria' | 'profesora'

export interface Usuario {
  id: string
  nombre: string
  rol: Rol
  color: string
  initials: string
  activo: boolean
}
export interface Profesora {
  id: string
  nombre: string
  apellido: string
  email: string
  edad: number
  telefono: string
  nivel: string
  tarifa_hora: number
  horas_semana: number
  color: string
  initials: string
  activa: boolean
}
export interface Alumno {
  id: string
  nombre: string
  apellido: string
  edad: number
  telefono: string
  email: string
  nivel: string
  cuota_mensual: number
  es_menor: boolean
  padre_nombre?: string
  padre_telefono?: string
  padre_email?: string
  dni?: string
  padre_dni?: string
  color: string
  activo: boolean
}
export interface Pago {
  id: string
  alumno_id: string
  mes: string
  anio: number
  monto: number
  metodo: string
  fecha_pago: string
  observaciones?: string
}
export interface Curso {
  id: string
  nombre: string
  nivel: string
  profesora_id: string
  dias: string
  hora_inicio: string
  hora_fin: string
  activo: boolean
}
export interface Clase {
  id: string
  curso_id: string
  fecha: string
  tema: string
  observacion_coordinadora?: string
}
export interface AsistenciaClase {
  id: string
  clase_id: string
  alumno_id: string
  estado: 'P' | 'A' | 'T'
  observacion?: string
}
export interface HorarioItem {
  id: string
  curso_id: string
  curso_nombre: string
  profesora_id: string
  dia_semana: number
  hora_inicio: string
  hora_fin: string
}

export const PERMISOS: Record<Rol, string[]> = {
  director: [
    'dashboard', 'profesoras', 'alumnos', 'cursos', 'horarios',
    'reportes', 'permisos', 'perfil', 'agenda',
    'actividad', 'atencion', 'ejecutivo', 'cuotas', 'pagos', 'personalizaciones',
  ],
  coordinadora: [
    'dashboard', 'profesoras', 'alumnos', 'cursos', 'horarios',
    'reportes', 'perfil', 'agenda', 'atencion', 'personalizaciones',
  ],
  secretaria: [
    'dashboard', 'alumnos', 'cursos', 'horarios', 'reportes',
    'perfil', 'agenda', 'atencion', 'cuotas', 'pagos',
    'personalizaciones',
  ],
  profesora: [
    'dashboard', 'alumnos', 'cursos', 'horarios',
    'perfil', 'agenda',
  ],
}

export const puedeVer = (rol: Rol, modulo: string) =>
  PERMISOS[rol]?.includes(modulo) ?? false
// v2
