import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

/**
 * Obtiene el instituto_id desde el header de la request.
 * Prioridad: header x-instituto-id → variable de entorno NEXT_PUBLIC_INSTITUTO_ID
 * Devuelve null si no se encuentra ninguno — la route decide cómo manejarlo.
 */
export function getInstitutoId(req: NextRequest): string | null {
  const header = req.headers.get('x-instituto-id')
  if (header && header.trim().length > 5) return header.trim()

  const envId = process.env.NEXT_PUBLIC_INSTITUTO_ID
  if (envId && envId.trim().length > 5) return envId.trim()

  return null
}

/**
 * Verifica que el usuario autenticado (JWT) pertenece al instituto_id del header.
 * Devuelve null si la verificación pasa.
 * Devuelve un NextResponse de error si falla — la route debe retornarlo inmediatamente.
 *
 * Uso en cualquier API route:
 *   const authError = await verificarAuth(req)
 *   if (authError) return authError
 */
export async function verificarAuth(req: NextRequest): Promise<NextResponse | null> {
  try {
    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    // Leer el JWT del Authorization header (Bearer token)
    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '').trim()

    // Verificar el token con Supabase y obtener el usuario
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
    }

    // Verificar que el usuario pertenece al instituto del header
    const { data: usuario, error: dbError } = await supabase
      .from('usuarios')
      .select('instituto_id, rol')
      .eq('id', user.id)
      .single()

    if (dbError || !usuario) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })
    }

    if (usuario.instituto_id !== institutoId) {
      console.error(`[verificarAuth] Mismatch: usuario.instituto_id=${usuario.instituto_id} header=${institutoId} uid=${user.id}`)
      return NextResponse.json({ error: 'Acceso no autorizado a este instituto' }, { status: 403 })
    }

    return null // todo OK
  } catch (e: any) {
    console.error('[verificarAuth] catch:', e.message)
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 500 })
  }
}

/**
 * Igual que verificarAuth pero además exige un rol específico.
 * Roles válidos: 'director' | 'coordinadora' | 'secretaria' | 'profesora'
 *
 * Uso:
 *   const authError = await verificarAuthRol(req, ['director'])
 *   if (authError) return authError
 */
export async function verificarAuthRol(req: NextRequest, rolesPermitidos: string[]): Promise<NextResponse | null> {
  try {
    const institutoId = getInstitutoId(req)
    if (!institutoId) {
      return NextResponse.json({ error: 'instituto_id requerido' }, { status: 400 })
    }

    const authHeader = req.headers.get('authorization')
    if (!authHeader?.startsWith('Bearer ')) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }
    const token = authHeader.replace('Bearer ', '').trim()

    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!,
      { auth: { autoRefreshToken: false, persistSession: false } }
    )
    const { data: { user }, error: authError } = await supabase.auth.getUser(token)
    if (authError || !user) {
      return NextResponse.json({ error: 'Token inválido o expirado' }, { status: 401 })
    }

    const { data: usuario, error: dbError } = await supabase
      .from('usuarios')
      .select('instituto_id, rol')
      .eq('id', user.id)
      .single()

    if (dbError || !usuario) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 401 })
    }

    if (usuario.instituto_id !== institutoId) {
      console.error(`[verificarAuthRol] Mismatch: uid=${user.id} instituto=${usuario.instituto_id} header=${institutoId}`)
      return NextResponse.json({ error: 'Acceso no autorizado a este instituto' }, { status: 403 })
    }

    if (!rolesPermitidos.includes(usuario.rol)) {
      return NextResponse.json({ error: `Rol insuficiente. Requerido: ${rolesPermitidos.join(' o ')}` }, { status: 403 })
    }

    return null // todo OK
  } catch (e: any) {
    console.error('[verificarAuthRol] catch:', e.message)
    return NextResponse.json({ error: 'Error de autenticación' }, { status: 500 })
  }
}
