// src/lib/logo-doc.ts
// Logo del instituto para documentos impresos (recibos, boletines, certificados, informes).
// Se muestra sobre un recuadro blanco para que se vea sobre cualquier color de encabezado.
// Si el instituto no tiene logo, quien llama usa su texto de respaldo.
// Sirve tanto en el navegador (brand.ts) como en las rutas del servidor.
export function logoImgHtml(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || !/^https:\/\//.test(logoUrl)) return null
  const src = logoUrl.replace(/"/g, '&quot;')
  return `<span style="display:inline-block;background:#fff;padding:4px 8px;border-radius:8px;line-height:0"><img src="${src}" alt="" style="height:40px;max-width:180px;object-fit:contain;display:block"></span>`
}
