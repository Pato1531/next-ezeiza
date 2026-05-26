// src/app/api/admin-verificar-clave/route.ts
//
// Verifica la clave del panel admin contra ADMIN_KEY (server-side).
// La clave NUNCA sale al cliente — reemplaza la comparación que
// antes ocurría en admin/page.tsx con NEXT_PUBLIC_ADMIN_KEY expuesta.
//
import { NextRequest, NextResponse } from 'next/server'
import { rateLimit, getClientIp, rateLimitResponse } from '@/lib/rate-limit'

export async function POST(req: NextRequest) {
  // Rate limit agresivo: 5 intentos por minuto por IP
  const ip = getClientIp(req)
  const rl = rateLimit(ip + ':admin-login', { limit: 5, windowMs: 60_000 })
  if (!rl.ok) return rateLimitResponse(rl.resetMs)

  try {
    const { clave } = await req.json()
    const expectedKey = process.env.ADMIN_KEY || ''

    // Sin clave configurada = panel deshabilitado
    if (!expectedKey) {
      return NextResponse.json({ error: 'Panel no configurado' }, { status: 503 })
    }

    if (!clave || clave !== expectedKey) {
      // Espera artificial de 500ms para dificultar fuerza bruta
      await new Promise(r => setTimeout(r, 500))
      return NextResponse.json({ error: 'Clave incorrecta' }, { status: 401 })
    }

    return NextResponse.json({ ok: true })
  } catch (e: any) {
    return NextResponse.json({ error: 'Error interno' }, { status: 500 })
  }
}
