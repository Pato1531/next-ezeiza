import { NextRequest } from 'next/server'

/**
 * Obtiene el instituto_id desde el header de la request.
 * Lee NEXT_PUBLIC_INSTITUTO_ID de las variables de entorno del proyecto.
 * Sin fallback hardcodeado — cada proyecto Vercel tiene su propio valor.
 */
export function getInstitutoId(req: NextRequest): string {
  const val = req.headers.get('x-instituto-id')
  if (val && val.trim().length > 5) return val.trim()
  const envId = process.env.NEXT_PUBLIC_INSTITUTO_ID
  if (!envId) throw new Error('NEXT_PUBLIC_INSTITUTO_ID no configurado en variables de entorno')
  return envId
}
