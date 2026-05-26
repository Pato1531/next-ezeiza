// src/app/api/comunicados/route.ts
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { verificarAuth } from '@/lib/server-utils'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!,
    { auth: { autoRefreshToken: false, persistSession: false } }
  )
}

function getInstitutoId(req: NextRequest): string | null {
  return req.headers.get('x-instituto-id') || null
}

// GET — Listar comunicados activos filtrados por instituto
export async function GET(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido', data: [] }, { status: 400 })
    }

    // ?archivados=true devuelve los inactivos (historial para el director)
    const archivados = new URL(req.url).searchParams.get('archivados') === 'true'

    const { data, error } = await sb()
      .from('comunicados')
      .select('*')
      .eq('activo', archivados ? false : true)
      .eq('instituto_id', institutoId)
      .order('created_at', { ascending: false })

    if (error) return NextResponse.json({ error: error.message, data: [] }, { status: 500 })
    return NextResponse.json({ data: data || [] })
  } catch (e: any) {
    return NextResponse.json({ error: e.message, data: [] }, { status: 500 })
  }
}

// POST — Crear nuevo comunicado
export async function POST(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const body = await req.json()
    const { titulo, contenido, rol_destino, destinatarios_ids, creado_por, autor_id } = body

    if (!titulo || !contenido) {
      return NextResponse.json({ error: 'Título y contenido son obligatorios' }, { status: 400 })
    }

    const insert: Record<string, any> = {
      titulo:       titulo.trim(),
      contenido:    contenido.trim(),
      rol_destino:  rol_destino || 'todos',
      autor_nombre: creado_por || 'Sistema',
      activo:       true,
      instituto_id: institutoId,
      leido_por:    [],
    }

    if (autor_id) insert.autor_id = autor_id

    if (rol_destino === 'individual' && Array.isArray(destinatarios_ids) && destinatarios_ids.length > 0) {
      insert.destinatarios_ids = destinatarios_ids
    }

    const { data, error } = await sb().from('comunicados').insert(insert).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH — Dos operaciones según payload:
//   1. Archivar:        { id, activo: false }
//   2. Marcar leído:    { id, accion: 'marcar_leido', usuario_id, usuario_nombre }
export async function PATCH(req: NextRequest) {
  try {
    const authError = await verificarAuth(req)
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const body = await req.json()
    const { id, accion } = body

    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // ── Operación: marcar como leído ─────────────────────────────────────────
    if (accion === 'marcar_leido') {
      const { usuario_id, usuario_nombre } = body
      if (!usuario_id) return NextResponse.json({ error: 'usuario_id requerido' }, { status: 400 })

      // Leer leido_por actual para no duplicar
      const { data: actual, error: errLeer } = await sb()
        .from('comunicados')
        .select('leido_por, destinatarios_ids, instituto_id')
        .eq('id', id)
        .eq('instituto_id', institutoId)
        .single()

      if (errLeer || !actual) {
        return NextResponse.json({ error: 'Comunicado no encontrado' }, { status: 404 })
      }

      // Verificar que el usuario es destinatario
      const esDestinatario = Array.isArray(actual.destinatarios_ids) &&
        actual.destinatarios_ids.includes(usuario_id)
      if (!esDestinatario) {
        return NextResponse.json({ error: 'No autorizado' }, { status: 403 })
      }

      // Evitar duplicar — si ya está en leido_por, responder ok sin escribir
      const yaLeyo = (actual.leido_por || []).some((e: any) => e.id === usuario_id)
      if (yaLeyo) return NextResponse.json({ ok: true, yaLeido: true })

      // Agregar entrada al array con jsonb_insert / concatenación
      const nuevaEntrada = { id: usuario_id, nombre: usuario_nombre || 'Usuario', ts: new Date().toISOString() }
      const nuevoArray = [...(actual.leido_por || []), nuevaEntrada]

      const { data, error } = await sb()
        .from('comunicados')
        .update({ leido_por: nuevoArray })
        .eq('id', id)
        .eq('instituto_id', institutoId)
        .select('leido_por')
        .single()

      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ ok: true, leido_por: data.leido_por })
    }

    // ── Operación: archivar (activo: false) ──────────────────────────────────
    const { activo } = body
    const { data, error } = await sb()
      .from('comunicados')
      .update({ activo: activo ?? false })
      .eq('id', id)
      .eq('instituto_id', institutoId)
      .select()
      .single()

    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })

  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
