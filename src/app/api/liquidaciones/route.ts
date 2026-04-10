import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

function getSupabase() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// POST → crear/upsert liquidación
export async function POST(req: NextRequest) {
  try {
    const liq = await req.json()
    const sb = getSupabase()
    const { data, error } = await sb
      .from('liquidaciones')
      .upsert(liq, { onConflict: 'profesora_id,mes,anio' })
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// PATCH → editar liquidación existente por id
export async function PATCH(req: NextRequest) {
  try {
    const { id, ...campos } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const sb = getSupabase()
    // Recalcular total
    const total = (campos.subtotal || 0) + (campos.ajuste || 0) - (campos.descuento_licencias || 0)
    const { data, error } = await sb
      .from('liquidaciones')
      .update({ ...campos, total })
      .eq('id', id)
      .select()
      .single()
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ data })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}

// DELETE → eliminar liquidación por id
export async function DELETE(req: NextRequest) {
  try {
    const { id } = await req.json()
    if (!id) return NextResponse.json({ error: 'id requerido' }, { status: 400 })
    const sb = getSupabase()
    const { error } = await sb.from('liquidaciones').delete().eq('id', id)
    if (error) return NextResponse.json({ error: error.message }, { status: 500 })
    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
