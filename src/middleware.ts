import { NextRequest, NextResponse } from 'next/server'
import { bloqueaEscritura } from '@/lib/prueba'

// Bloqueo total de escrituras de la API cuando la prueba del instituto venció.
// Identifica al instituto a partir del usuario autenticado (token), no de un header que pueda cambiarse.
// Si no se puede verificar (falta configuración o la base no responde), deja pasar:
// un fallo técnico no debe cortar el servicio a un cliente.
export const config = { matcher: '/api/:path*' }

export async function middleware(req: NextRequest) {
  const metodo = req.method
  const ruta = req.nextUrl.pathname
  if (!['POST', 'PUT', 'PATCH', 'DELETE'].includes(metodo) || ruta.startsWith('/api/admin-')) {
    return NextResponse.next()
  }

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const anon = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  const service = process.env.SUPABASE_SERVICE_ROLE_KEY
  const token = (req.headers.get('authorization') || '').replace(/^Bearer\s+/i, '')
  if (!url || !anon || !service || !token) return NextResponse.next()

  try {
    const resUser = await fetch(`${url}/auth/v1/user`, {
      headers: { apikey: anon, Authorization: `Bearer ${token}` },
    })
    if (!resUser.ok) return NextResponse.next()
    const { id } = await resUser.json()

    const cabeceras = { apikey: service, Authorization: `Bearer ${service}` }
    const resUsuario = await fetch(`${url}/rest/v1/usuarios?id=eq.${encodeURIComponent(id)}&select=instituto_id`, { headers: cabeceras })
    const [usuario] = await resUsuario.json()
    if (!usuario?.instituto_id) return NextResponse.next()

    const resInst = await fetch(`${url}/rest/v1/institutos?id=eq.${encodeURIComponent(usuario.instituto_id)}&select=prueba_hasta`, { headers: cabeceras })
    const [inst] = await resInst.json()

    if (bloqueaEscritura(metodo, ruta, inst?.prueba_hasta ?? null)) {
      return NextResponse.json(
        { error: 'Tu prueba terminó. El instituto está en modo solo lectura.', code: 'PRUEBA_VENCIDA' },
        { status: 403 }
      )
    }
  } catch (e) {
    console.error('[middleware prueba]', e)
  }
  return NextResponse.next()
}
