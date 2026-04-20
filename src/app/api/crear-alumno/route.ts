import { NextRequest, NextResponse } from 'next/server'
import { getInstitutoId } from '@/lib/server-utils'
import { createClient } from '@supabase/supabase-js'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

export async function POST(req: NextRequest) {
  try {
    const datos = await req.json()

    // instituto_id: prioridad 1 → header (fuente más confiable, viene del servidor)
    //               prioridad 2 → body (enviado desde hooks.ts como fallback)
    //               Si ninguno → rechazar con 400 para no insertar fila huérfana
    const institutoIdHeader = getInstitutoId(req)
    const institutoIdBody   = datos.instituto_id || null
    const institutoId       = institutoIdHeader || institutoIdBody

    if (!institutoId) {
      console.error('[crear-alumno] instituto_id ausente — header y body vacíos')
      return NextResponse.json(
        { error: 'instituto_id requerido' },
        { status: 400 }
      )
    }

    // Campos permitidos — nunca dejar que el cliente inyecte activo:false o id propio
    const {
      nombre, apellido, dni, edad, fecha_nacimiento, fecha_alta,
      telefono, email, nivel, cuota_mensual, matricula,
      es_menor, padre_nombre, padre_apellido, padre_dni,
      padre_telefono, padre_email, color,
    } = datos

    const { data, error } = await sb()
      .from('alumnos')
      .insert({
        nombre,
        apellido,
        dni:              dni              || null,
        edad:             edad             || null,
        fecha_nacimiento: fecha_nacimiento || null,
        fecha_alta:       fecha_alta       || null,
        telefono:         telefono         || null,
        email:            email            || null,
        nivel:            nivel            || 'Básico',
        cuota_mensual:    cuota_mensual    || 0,
        matricula:        matricula        || 0,
        es_menor:         es_menor         ?? false,
        padre_nombre:     padre_nombre     || null,
        padre_apellido:   padre_apellido   || null,
        padre_dni:        padre_dni        || null,
        padre_telefono:   padre_telefono   || null,
        padre_email:      padre_email      || null,
        color:            color            || '#652f8d',
        instituto_id:     institutoId,
        activo:           true,
      })
      .select()
      .single()

    if (error) {
      console.error('[crear-alumno] Supabase error:', error.message, '| instituto_id:', institutoId)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }

    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('[crear-alumno] catch:', e.message)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
