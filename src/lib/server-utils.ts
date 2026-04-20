import { NextRequest } from 'next/server'

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
