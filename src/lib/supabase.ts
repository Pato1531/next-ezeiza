import { createBrowserClient } from '@supabase/ssr'

let _client: ReturnType<typeof createBrowserClient> | null = null

export function createClient() {
  if (_client) return _client

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    console.error('Supabase env vars missing:', { url: !!url, key: !!key })
  }

  _client = createBrowserClient(url!, key!, {
    auth: {
      persistSession: true,
      detectSessionInUrl: true,
      autoRefreshToken: true,
    },
  })

  return _client
}

// Usar SOLO en logout para limpiar el singleton
export function destroyClient() {
  _client = null
}

// Tipos TypeScript
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
  director:     ['dashboard','profesoras','alumnos','cursos','horarios','reportes','permisos','perfil','comunicados','agenda','actividad'],
  coordinadora: ['dashboard','profesoras','alumnos','cursos','horarios','reportes','perfil','comunicados','agenda'],
  secretaria:   ['dashboard','alumnos','cursos','horarios','reportes','perfil','comunicados','agenda'],
  profesora:    ['alumnos','cursos','horarios','perfil','comunicados','agenda'],
}

export const puedeVer = (rol: Rol, modulo: string) =>
  PERMISOS[rol]?.includes(modulo) ?? false
