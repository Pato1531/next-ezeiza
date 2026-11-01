// Color de marca del instituto.
// A partir de un color base se derivan los tonos de la paleta (variables CSS --v, --v2, --v3, --vl, --vll).

export const COLOR_MARCA_DEFAULT = '#652f8d'

export const COLORES_PREDEFINIDOS = [
  { hex: '#652f8d', nombre: 'Violeta' },
  { hex: '#1a6b8a', nombre: 'Azul' },
  { hex: '#2d7a4f', nombre: 'Verde' },
  { hex: '#8b2635', nombre: 'Bordó' },
  { hex: '#b45309', nombre: 'Ámbar' },
  { hex: '#0f6e56', nombre: 'Verde azulado' },
  { hex: '#a3336e', nombre: 'Rosa' },
  { hex: '#3d3d4a', nombre: 'Grafito' },
]

export function esHexValido(valor: unknown): valor is string {
  return typeof valor === 'string' && /^#[0-9a-fA-F]{6}$/.test(valor)
}

const clamp = (x: number, min: number, max: number) => Math.min(max, Math.max(min, x))

function hexAHsl(hex: string) {
  const r = parseInt(hex.slice(1, 3), 16) / 255
  const g = parseInt(hex.slice(3, 5), 16) / 255
  const b = parseInt(hex.slice(5, 7), 16) / 255
  const max = Math.max(r, g, b)
  const min = Math.min(r, g, b)
  const l = (max + min) / 2
  let h = 0
  let s = 0
  if (max !== min) {
    const d = max - min
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min)
    if (max === r) h = (g - b) / d + (g < b ? 6 : 0)
    else if (max === g) h = (b - r) / d + 2
    else h = (r - g) / d + 4
    h *= 60
  }
  return { h, s: s * 100, l: l * 100 }
}

function hslAHex(h: number, s: number, l: number) {
  const S = s / 100
  const L = l / 100
  const a = S * Math.min(L, 1 - L)
  const canal = (n: number) => {
    const k = (n + h / 30) % 12
    return L - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
  }
  const toHex = (x: number) => Math.round(clamp(x, 0, 1) * 255).toString(16).padStart(2, '0')
  return `#${toHex(canal(0))}${toHex(canal(8))}${toHex(canal(4))}`
}

// Aplica el color de marca a toda la app cambiando las variables CSS de la raíz.
export function aplicarColorMarca(hex?: string | null) {
  if (typeof document === 'undefined') return
  const base = esHexValido(hex) ? hex.toLowerCase() : COLOR_MARCA_DEFAULT
  const { h, s, l } = hexAHsl(base)
  const estilo = document.documentElement.style
  estilo.setProperty('--v', base)
  estilo.setProperty('--v2', hslAHex(h, s, clamp(l + 7, 0, 100)))
  estilo.setProperty('--v3', hslAHex(h, s, clamp(l + 14, 0, 100)))
  estilo.setProperty('--vl', hslAHex(h, clamp(s, 0, 80), 95))
  estilo.setProperty('--vll', hslAHex(h, clamp(s, 0, 80), 98))
}
