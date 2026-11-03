import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

function sb() {
  return createClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.SUPABASE_SERVICE_ROLE_KEY!
  )
}

// GET /api/admin-resumen · solo panel admin (clave en x-admin-key)
// Clientes (institutos) con su cantidad de alumnos activos. Solo lectura.
export async function GET(req: NextRequest) {
  try {
    const rl = rateLimit(getClientIp(req) + ':admin-resumen', { limit: 60, windowMs: 60000 })
    if (!rl.ok) return rateLimitResponse(rl.resetMs)

    const expected = process.env.ADMIN_KEY || ''
    if (!expected || req.headers.get('x-admin-key') !== expected) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const supabase = sb()
    const { data: institutos, error: errInst } = await supabase
      .from('institutos')
      .select('id, nombre, ciudad, plan, activo, created_at')
      .order('nombre')
    if (errInst) return NextResponse.json({ error: errInst.message }, { status: 500 })

    // Alumnos activos por instituto: solo la tabla alumnos (no usuarios ni profesoras)
    const conteos = await Promise.all(
      (institutos || []).map(async (i: any) => {
        const { count } = await supabase
          .from('alumnos')
          .select('id', { count: 'exact', head: true })
          .eq('instituto_id', i.id)
          .eq('activo', true)
        return [i.id, count ?? 0] as const
      })
    )
    const porInstituto = new Map(conteos)

    return NextResponse.json({
      institutos: (institutos || []).map((i: any) => ({
        id: i.id,
        nombre: i.nombre,
        ciudad: i.ciudad,
        plan: i.plan,
        activo: i.activo,
        created_at: i.created_at,
        alumnos_activos: porInstituto.get(i.id) ?? 0,
      })),
    })
  } catch (error: any) {
    console.error('[admin-resumen]', error)
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
