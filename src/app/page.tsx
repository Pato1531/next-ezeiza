import dynamic from 'next/dynamic'

// Forzar renderizado dinámico — evita prerenderizado con browser APIs
export const dynamic = 'force-dynamic'

const AppShell = dynamic(() => import('@/components/AppShell'), { ssr: false })

export default function Page() {
  return <AppShell />
}
