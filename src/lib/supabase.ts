import { createClient as createSupabaseClient } from '@supabase/supabase-js'

const url = process.env.NEXT_PUBLIC_SUPABASE_URL!
const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

// Cliente único creado UNA SOLA VEZ al cargar el módulo.
// NO se destruye nunca — destroyClient es no-op.
// Esto evita el bug donde un cliente recién creado no tiene
// la sesión cargada del localStorage todavía.
export const supabaseClient = createSupabaseClient(url, key, {
  auth: {
    persistSession: true,
    autoRefreshToken: true,
    detectSessionInUrl: false,
  },
})

export function createClient() {
  return supabaseClient
}

// No-op — mantener por compatibilidad con auth-context
export function destroyClient() {
  // Intencionalmente vacío — el cliente nunca se destruye
  // La sesión se limpia via supabase.auth.signOut()
}

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
  director:     ['dashboard','profesoras','alumnos','cursos','horarios','reportes','permisos','perfil','comunicados','agenda','actividad','atencion'],
  coordinadora: ['dashboard','profesoras','alumnos','cursos','horarios','reportes','perfil','comunicados','agenda','atencion'],
  secretaria:   ['dashboard','alumnos','cursos','horarios','reportes','perfil','comunicados','agenda','atencion'],
  profesora:    ['alumnos','cursos','horarios','perfil','comunicados','agenda'],
}

export const puedeVer = (rol: Rol, modulo: string) =>
  PERMISOS[rol]?.includes(modulo) ?? false
