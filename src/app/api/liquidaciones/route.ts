import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'
import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { getInstitutoId , verificarAuthRol} from '@/lib/server-utils'

function sb() {
  return createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, process.env.SUPABASE_SERVICE_ROLE_KEY!)
}
// getInstitutoId imported from @/lib/server-utils

export async function POST(req: NextRequest) {
  try {
    const ip = getClientIp(req)
    const rl = rateLimit(ip + ':liquidaciones', { limit: 30, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const authError = await verificarAuthRol(req, ['director', 'coordinadora'])
    if (authError) return authError

    const institutoId = getInstitutoId(req)
    const liq = await req.json()

    // No permitir sobreescribir una liquidación cerrada
    if (institutoId) {
      const { data: existente } = await sb()
        .from('liquidaciones')
        .select('estado')
        .eq('profesora_id', liq.profesora_id)
        .eq('mes', liq.mes)
        .eq('anio', liq.anio)
        .eq('instituto_id', institutoId)
        .single()
      if (existente?.estado === 'cerrada') {
        return NextResponse.json({ error: 'Esta liquidación está cerrada y no puede modificarse.' }, { status: 403 })
      }
    }

    const { data, error } = await sb()
      .from('liquidaciones')
      .upsert({ ...liq, ...(institutoId ? { instituto_id: institutoId } : {}) }, { onConflict: 'profesora_id,mes,anio' })
      .select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function PATCH(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director', 'coordinadora'])
    if (authError) return authError

    const { id, accion, ...campos } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // Verificar estado actual antes de cualquier modificación
    const { data: actual } = await sb().from('liquidaciones').select('estado').eq('id', id).single()
    if (actual?.estado === 'cerrada' && accion !== 'reabrir') {
      return NextResponse.json({ error: 'Esta liquidación está cerrada y no puede modificarse.' }, { status: 403 })
    }

    // Acción especial: cerrar período (solo director)
    if (accion === 'cerrar') {
      const { data, error } = await sb()
        .from('liquidaciones').update({ estado: 'cerrada', cerrada_at: new Date().toISOString() }).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data })
    }

    // Acción especial: reabrir (solo director — para correcciones excepcionales)
    if (accion === 'reabrir') {
      const authErrorDir = await verificarAuthRol(req, ['director'])
      if (authErrorDir) return NextResponse.json({ error: 'Solo el director puede reabrir una liquidación cerrada.' }, { status: 403 })
      const { data, error } = await sb()
        .from('liquidaciones').update({ estado: 'confirmada', cerrada_at: null }).eq('id', id).select().single()
      if (error) return NextResponse.json({ error: error.message }, { status: 500 })
      return NextResponse.json({ data })
    }

    // Edición normal
    const total = (campos.subtotal || 0) + (campos.ajuste || 0) - (campos.descuento_licencias || 0)
    const { data, error } = await sb()
      .from('liquidaciones').update({ ...campos, total }).eq('id', id).select().single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest) {
  try {
    const authError = await verificarAuthRol(req, ['director'])
    if (authError) return authError

    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })

    // No eliminar liquidaciones cerradas
    const { data: actual } = await sb().from('liquidaciones').select('estado').eq('id', id).single()
    if (actual?.estado === 'cerrada') {
      return NextResponse.json({ error: 'No se puede eliminar una liquidación cerrada. Reabrila primero si necesitás corregirla.' }, { status: 403 })
    }

    const { error } = await sb().from('liquidaciones').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
