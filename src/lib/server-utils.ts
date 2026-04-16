import { NextRequest } from 'next/server'

// Instituto ID de Next Ezeiza — fallback cuando el header x-instituto-id no llega
// Esto ocurre en el primer render antes de que auth-context termine de cargar
const FALLBACK_INSTITUTO_ID = '9191277d-0d35-46b7-bc70-8900f63fac8a'

/**
 * Obtiene el instituto_id desde el header de la request.
 * Si el header no está presente o está vacío, usa el ID hardcodeado
 * de Next Ezeiza como fallback (o la variable de entorno si está configurada).
 * Esto garantiza que las operaciones de BD siempre tengan un instituto_id válido.
 */
export function getInstitutoId(req: NextRequest): string {
  const val = req.headers.get('x-instituto-id')
  if (val && val.trim().length > 5) return val.trim()
  return process.env.NEXT_PUBLIC_INSTITUTO_ID || FALLBACK_INSTITUTO_ID
}
