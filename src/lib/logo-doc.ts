// src/lib/logo-doc.ts
// Logo del instituto para documentos impresos (recibos, boletines, certificados, informes).
// Se muestra sobre una placa blanca redondeada, más grande y con aire alrededor,
// para que se lea sobre cualquier color de encabezado.
// Si el instituto no tiene logo, quien llama usa su texto de respaldo.
// Sirve tanto en el navegador (brand.ts) como en las rutas del servidor.
export function logoImgHtml(logoUrl: string | null | undefined): string | null {
  if (!logoUrl || !/^https:\/\//.test(logoUrl)) return null
  const src = logoUrl.replace(/"/g, '&quot;')
  return `<span style="display:inline-flex;align-items:center;justify-content:center;background:#fff;padding:12px 20px;border-radius:14px;line-height:0;box-shadow:0 6px 18px rgba(0,0,0,.22)"><img src="${src}" alt="" style="height:64px;max-width:240px;width:auto;object-fit:contain;display:block"></span>`
}
