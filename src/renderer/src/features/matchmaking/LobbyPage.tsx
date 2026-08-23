import { lazy, Suspense, type JSX } from 'react'
import { LobbyNavigation } from '../../components/ui/lobby/Navigation'

const WebHLMV = lazy(() => import('../../libs/web-hlmv/ui/App').then((m) => ({ default: m.App })))

export function LobbyPage(): JSX.Element {
  return (
    <main className="min-h-screen bg-neutral-950 text-white">
      <LobbyNavigation className="fixed top-0 left-0" />
      <Suspense>
        <WebHLMV />
      </Suspense>
    </main>
  )
}
