import { useEffect, type JSX } from 'react'
import { LobbyNavigation } from '../../components/ui/lobby/Navigation'
import { useNavigationStore } from '../navigation/navigation.store'
import { SettingsPage } from '../settings/SettingsPage'
import { usePartyStore } from '../party/party.store'
import { useCustomGamesStore } from './custom-games.store'
import { PlayPage } from './PlayPage'

/** Keep match controls available without mounting the lobby's 3D scene during play. */
export function MatchLauncherPage(): JSX.Element {
  const page = useNavigationStore((state) => state.page)
  const navigate = useNavigationStore((state) => state.navigate)
  const activePage = page === 'settings' ? 'settings' : 'play'
  const currentRoom = useCustomGamesStore((state) => state.currentRoom)
  const hasRoom = Boolean(currentRoom)
  const startParty = usePartyStore((state) => state.start)
  const stopParty = usePartyStore((state) => state.stop)

  useEffect(() => {
    if (!hasRoom) return
    startParty()
    return stopParty
  }, [hasRoom, startParty, stopParty])

  return (
    <main className="relative min-h-screen bg-neutral-950 text-white">
      <LobbyNavigation
        activePage={activePage}
        onNavigate={(nextPage) => {
          if (nextPage === 'settings' || nextPage === 'play') navigate(nextPage)
        }}
        locked
        missionsOpen={false}
        onToggleMissions={() => undefined}
        missionSnapshot={null}
        missionLoading={false}
        missionError={null}
      />
      <div className="relative z-10 pt-16 sm:pt-20">
        {activePage === 'settings' ? <SettingsPage /> : <PlayPage />}
      </div>
    </main>
  )
}
