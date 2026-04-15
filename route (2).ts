import type { Metadata, Viewport } from 'next'
import { AuthProvider } from '@/lib/auth-context'
import { ErrorBoundary, DebugPanel } from '@/lib/debug'
import './globals.css'

// Inter se carga via CSS en globals.css con @import de Google Fonts
// Esto evita el error "Failed to fetch font" durante el build de Vercel
// que ocurre cuando next/font/google intenta descargar la fuente en tiempo de build

export const metadata: Metadata = {
  title: 'Next Ezeiza — Panel de gestión',
  description: 'Sistema de gestión del Instituto de Inglés Next Ezeiza',
  appleWebApp: { capable: true, statusBarStyle: 'default', title: 'Next Ezeiza' },
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
      </head>
      <body style={{ fontFamily: "-apple-system, BlinkMacSystemFont, 'Segoe UI', 'Inter', sans-serif" }}>
        <ErrorBoundary>
          <AuthProvider>
            {children}
          </AuthProvider>
        </ErrorBoundary>
        <DebugPanel />
      </body>
    </html>
  )
}
