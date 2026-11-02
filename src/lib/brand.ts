import { logoImgHtml } from './logo-doc'

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

// ── Marca del instituto (color, nombre y logo) ────────────────────────────────
// Se carga desde auth-context al iniciar sesión (setMarca). Los documentos y mensajes
// leen marca() en el momento de generarse, así que siempre usan lo último guardado.

type Marca = {
  color: string
  nombre: string
  logoUrl: string | null
  plantillas: Record<string, string> | null
}

let _marca: Marca = {
  color: COLOR_MARCA_DEFAULT,
  nombre: 'Mi instituto',
  logoUrl: null,
  plantillas: null,
}

const escaparHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

// "Next Ezeiza" → <span>Next</span> Ezeiza (mismo estilo que la barra superior)
function logoHtmlDe(nombre: string) {
  const partes = nombre.split(' ')
  const primera = escaparHtml(partes[0])
  const resto = partes.slice(1).map(escaparHtml).join(' ')
  return `<span>${primera}</span>${resto ? ' ' + resto : ''}`
}

export function setMarca(inst: any) {
  _marca = {
    color: esHexValido(inst?.color_primario) ? inst.color_primario.toLowerCase() : COLOR_MARCA_DEFAULT,
    nombre: (inst?.nombre || '').trim() || 'Mi instituto',
    logoUrl: inst?.logo_url || null,
    plantillas: inst?.plantillas_whatsapp && typeof inst.plantillas_whatsapp === 'object'
      ? inst.plantillas_whatsapp
      : null,
  }
  aplicarColorMarca(_marca.color)
  if (typeof document !== 'undefined') {
    document.title = `${_marca.nombre} — Panel de gestión`
    document.querySelector('meta[name="theme-color"]')?.setAttribute('content', _marca.color)
  }
}

export function marca() {
  return { ..._marca, logoHtml: logoImgHtml(_marca.logoUrl) ?? logoHtmlDe(_marca.nombre) }
}
