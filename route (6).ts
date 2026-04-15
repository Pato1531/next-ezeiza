import type { Metadata, Viewport } from 'next'
import { Inter } from 'next/font/google'
import { AuthProvider } from '@/lib/auth-context'
import { ErrorBoundary, DebugPanel } from '@/lib/debug'
import './globals.css'

const inter = Inter({ subsets: ['latin'] })

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
      </head>
      <body className={inter.className}>
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
