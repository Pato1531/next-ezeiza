import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

export async function POST(req: NextRequest) {
  try {
    const pago = await req.json()
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    )
    // Primero borrar si existe pago del mismo mes/año para ese alumno
    await supabase.from('pagos_alumnos')
      .delete()
      .eq('alumno_id', pago.alumno_id)
      .eq('mes', pago.mes)
      .eq('anio', pago.anio)

    // Insertar el nuevo pago
    const { data, error } = await supabase
      .from('pagos_alumnos')
      .insert(pago)
      .select()
      .single()

    if (error) {
      console.error('Error inserting pago:', error)
      return NextResponse.json({ error: error.message }, { status: 500 })
    }
    return NextResponse.json({ data })
  } catch (e: any) {
    console.error('Error en registrar-pago:', e)
    return NextResponse.json({ error: e.message }, { status: 500 })
  }
}
