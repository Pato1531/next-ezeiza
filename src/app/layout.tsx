import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/lib/auth-context'
import { ErrorBoundary } from '@/lib/debug'
import './globals.css'

// Inter se carga via CSS en globals.css con @import de Google Fonts
// Esto evita el error "Failed to fetch font" durante el build de Vercel
// que ocurre cuando next/font/google intenta descargar la fuente en tiempo de build

// ── El nombre del instituto se lee desde la DB en runtime (auth-context → AppShell).
// ── El metadata es genérico "EduGest" para que el sistema sea verdaderamente multisede
// ── sin depender de variables de entorno por sede.
export const metadata: Metadata = {
  title: 'EduGest — Panel de gestión',
  description: 'Sistema de gestión para institutos de inglés',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'EduGest' },
}

export const viewport: Viewport = {
  themeColor: '#652f8d',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es">
      <head>
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="mobile-web-app-capable" content="yes" />
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;900&display=swap" rel="stylesheet" />
      </head>
      <body style={{ fontFamily: "'Inter', -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif" }}>
        <ErrorBoundary>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ErrorBoundary>
      </body>
    </html>
  )
}
