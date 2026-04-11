// src/lib/rate-limit.ts
// Rate limiter en memoria — funciona en Vercel sin dependencias externas.
// Usa ventana deslizante por IP. Se resetea con cada cold start (suficiente para protección básica).

interface Window {
  timestamps: number[]
}

const store = new Map<string, Window>()

// Limpiar entradas viejas cada 5 minutos para no acumular memoria
if (typeof setInterval !== 'undefined') {
  setInterval(() => {
    const ahora = Date.now()
    store.forEach((val, key) => {
      if (val.timestamps.every(t => ahora - t > 60_000)) {
        store.delete(key)
      }
    })
  }, 5 * 60 * 1000)
}

interface RateLimitOptions {
  limit: number      // máximo de requests
  windowMs: number   // ventana en milisegundos
}

interface RateLimitResult {
  ok: boolean
  remaining: number
  resetMs: number
}

export function rateLimit(key: string, options: RateLimitOptions): RateLimitResult {
  const { limit, windowMs } = options
  const ahora = Date.now()
  const ventanaInicio = ahora - windowMs

  const entry = store.get(key) ?? { timestamps: [] }
  // Filtrar timestamps fuera de la ventana
  entry.timestamps = entry.timestamps.filter(t => t > ventanaInicio)

  if (entry.timestamps.length >= limit) {
    const resetMs = entry.timestamps[0] + windowMs - ahora
    store.set(key, entry)
    return { ok: false, remaining: 0, resetMs }
  }

  entry.timestamps.push(ahora)
  store.set(key, entry)
  return { ok: true, remaining: limit - entry.timestamps.length, resetMs: 0 }
}

// Helper para extraer IP del request
export function getClientIp(req: Request): string {
  const forwarded = req.headers.get('x-forwarded-for')
  if (forwarded) return forwarded.split(',')[0].trim()
  return req.headers.get('x-real-ip') ?? 'unknown'
}

// Respuesta estándar de rate limit excedido
export function rateLimitResponse(resetMs: number) {
  const resetSeg = Math.ceil(resetMs / 1000)
  return new Response(
    JSON.stringify({ error: `Demasiadas solicitudes. Intentá de nuevo en ${resetSeg} segundos.` }),
    {
      status: 429,
      headers: {
        'Content-Type': 'application/json',
        'Retry-After': String(resetSeg),
      },
    }
  )
}
