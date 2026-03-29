'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase'
import type { Profesora, Alumno, Curso, Clase, HorarioItem, Pago, AsistenciaClase } from '@/lib/supabase'

const supabase = createClient()

// ── PROFESORAS ──
export function useProfesoras() {
  const [data, setData] = useState<Profesora[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('profesoras').select('*').eq('activa', true).order('apellido')
      .then(({ data }) => { setData(data ?? []); setLoading(false) })
  }, [])

  const actualizar = async (id: string, cambios: Partial<Profesora>) => {
    const { error } = await supabase.from('profesoras').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(p => p.id === id ? { ...p, ...cambios } : p))
    return !error
  }

  const agregar = async (nueva: Omit<Profesora, 'id' | 'activa'>) => {
    const { data: row, error } = await supabase.from('profesoras').insert(nueva).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  return { profesoras: data, loading, actualizar, agregar }
}

// ── ALUMNOS ──
export function useAlumnos() {
  const [data, setData] = useState<Alumno[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('alumnos').select('*').eq('activo', true).order('apellido')
      .then(({ data }) => { setData(data ?? []); setLoading(false) })
  }, [])

  const actualizar = async (id: string, cambios: Partial<Alumno>) => {
    const { error } = await supabase.from('alumnos').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(a => a.id === id ? { ...a, ...cambios } : a))
    return !error
  }

  const agregar = async (nuevo: Omit<Alumno, 'id' | 'activo'>) => {
    const { data: row, error } = await supabase.from('alumnos').insert(nuevo).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  return { alumnos: data, loading, actualizar, agregar }
}

// ── PAGOS ──
export function usePagos(alumnoId?: string) {
  const [data, setData] = useState<Pago[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    let query = supabase.from('pagos_alumnos').select('*').order('created_at', { ascending: false })
    if (alumnoId) query = query.eq('alumno_id', alumnoId)
    query.then(({ data }) => { setData(data ?? []); setLoading(false) })
  }, [alumnoId])

  const registrar = async (pago: Omit<Pago, 'id'>) => {
    const { data: row, error } = await supabase.from('pagos_alumnos').insert(pago).select().single()
    if (row && !error) setData(prev => [row, ...prev])
    return row
  }

  return { pagos: data, loading, registrar }
}

// ── CURSOS ──
export function useCursos() {
  const [data, setData] = useState<Curso[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('cursos').select('*').eq('activo', true).order('nombre')
      .then(({ data }) => { setData(data ?? []); setLoading(false) })
  }, [])

  const actualizar = async (id: string, cambios: Partial<Curso>) => {
    const { error } = await supabase.from('cursos').update(cambios).eq('id', id)
    if (!error) setData(prev => prev.map(c => c.id === id ? { ...c, ...cambios } : c))
    return !error
  }

  return { cursos: data, loading, actualizar }
}

// ── ALUMNOS DE UN CURSO ──
export function useCursoAlumnos(cursoId: string) {
  const [data, setData] = useState<Alumno[]>([])

  const cargar = async () => {
    if (!cursoId) return
    const { data } = await supabase
      .from('cursos_alumnos')
      .select('alumno_id, alumnos(*)')
      .eq('curso_id', cursoId)
    const al = data?.map((r: any) => r.alumnos).filter(Boolean) ?? []
    setData(al)
  }

  useEffect(() => { cargar() }, [cursoId])

  const agregar = async (alumnoId: string) => {
    const { error } = await supabase.from('cursos_alumnos').insert({
      curso_id: cursoId,
      alumno_id: alumnoId,
      fecha_ingreso: new Date().toISOString().split('T')[0]
    })
    if (!error) await cargar()
    return !error
  }

  const quitar = async (alumnoId: string) => {
    const { error } = await supabase.from('cursos_alumnos')
      .delete().eq('curso_id', cursoId).eq('alumno_id', alumnoId)
    if (!error) setData(prev => prev.filter(a => a.id !== alumnoId))
    return !error
  }

  return { alumnosCurso: data, agregar, quitar }
}

// ── CLASES ──
export function useClases(cursoId: string) {
  const [data, setData] = useState<Clase[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (!cursoId) return
    supabase.from('clases').select('*').eq('curso_id', cursoId).order('fecha', { ascending: false })
      .then(({ data }) => { setData(data ?? []); setLoading(false) })
  }, [cursoId])

  const agregar = async (clase: Omit<Clase, 'id'>) => {
    const { data: row, error } = await supabase.from('clases').insert(clase).select().single()
    if (row && !error) setData(prev => [row, ...prev])
    return row
  }

  return { clases: data, loading, agregar }
}

// ── ASISTENCIA DE UNA CLASE ──
export function useAsistencia(claseId: string) {
  const [data, setData] = useState<AsistenciaClase[]>([])

  useEffect(() => {
    if (!claseId) return
    supabase.from('asistencia_clases').select('*').eq('clase_id', claseId)
      .then(({ data }) => setData(data ?? []))
  }, [claseId])

  const registrar = async (alumnoId: string, estado: 'P' | 'A' | 'T', obs?: string) => {
    const { data: row, error } = await supabase
      .from('asistencia_clases')
      .upsert({ clase_id: claseId, alumno_id: alumnoId, estado, observacion: obs },
               { onConflict: 'clase_id,alumno_id' })
      .select().single()
    if (row && !error) {
      setData(prev => {
        const existe = prev.findIndex(a => a.alumno_id === alumnoId)
        if (existe >= 0) { const n = [...prev]; n[existe] = row; return n }
        return [...prev, row]
      })
    }
  }

  return { asistencia: data, registrar }
}

// ── HORARIO ──
export function useHorario() {
  const [data, setData] = useState<HorarioItem[]>([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    supabase.from('horario').select('*').eq('activo', true).order('hora_inicio')
      .then(({ data }) => { setData(data ?? []); setLoading(false) })
  }, [])

  const agregar = async (item: Omit<HorarioItem, 'id'>) => {
    const { data: row, error } = await supabase.from('horario').insert(item).select().single()
    if (row && !error) setData(prev => [...prev, row])
    return row
  }

  const eliminar = async (id: string) => {
    const { error } = await supabase.from('horario').delete().eq('id', id)
    if (!error) setData(prev => prev.filter(h => h.id !== id))
    return !error
  }

  return { horario: data, loading, agregar, eliminar }
}
