import { memo, useEffect, useState, type JSX } from 'react'
import dustBackground from '../../assets/dust.jpg'
import { LobbyNavigation } from '../../components/ui/lobby/Navigation'
import { useAuthStore } from '../auth/auth.store'
import { PartyPanel } from '../party/PartyPanel'
import { PartyInvitationModal } from '../party/PartyInvitationModal'
import { PartyChat } from '../party/PartyChat'
import { PartyPlayerSlot } from '../party/PartyPlayerSlot'
import { LobbySocialSidebar } from '../party/LobbySocialSidebar'
import { usePartyStore } from '../party/party.store'
import type { AuthPlayer } from '../../../../shared/auth'
import type { Party, PartyMember } from '../../../../shared/party'
import { PlayPage } from './PlayPage'
import { useMatchmakingStore } from './matchmaking.store'
import { useNavigationStore, type LobbyPageId } from '../navigation/navigation.store'
import { SettingsPage } from '../settings/SettingsPage'
import { MatchHistoryPage } from '../profile/MatchHistoryPage'
import { MatchResultsPage } from './MatchResultsPage'
import { NewsPage } from '../news/NewsPage'
import { LobbyNewsPanel } from '../news/LobbyNewsPanel'

const pageLabels: Record<Exclude<LobbyPageId, 'lobby' | 'play'>, string> = {
  leaderboard: 'Leaderboard',
  store: 'Store',
  news: 'News',
  settings: 'Settings',
  profile: 'Profile'
}

interface LobbySceneProps {
  player: AuthPlayer
  party: Party | null
}

// Keep the player slots and their WebGL viewers mounted while another page is
// open. The foreground pages render as translucent layers over this scene.
const LobbyScene = memo(function LobbyScene({ player, party }: LobbySceneProps): JSX.Element {
  const currentPlayer: PartyMember = {
    id: player.id,
    username: player.username,
    mmr: player.mmr
  }
  const members = party?.members ?? [currentPlayer]

  return (
    <div className="fixed inset-0 z-0 flex min-h-screen flex-col overflow-y-auto pt-16 sm:pt-20">
      <PartyPanel playerId={player.id} />
      <div className="relative flex min-h-0 flex-1 md:pr-72">
        {members.length < 4 && <LobbyNewsPanel />}
        <section className="flex flex-1 flex-wrap justify-center">
          {members.map((member, index) => (
            <PartyPlayerSlot
              key={member.id}
              slot={index}
              member={member}
              isLeader={party?.leaderId === member.id}
              isCurrentPlayer={member.id === player.id}
            />
          ))}
        </section>
      </div>
    </div>
  )
})

export function LobbyPage(): JSX.Element {
  const player = useAuthStore((state) => state.session?.player)
  const party = usePartyStore((state) => state.party)
  const startParty = usePartyStore((state) => state.start)
  const stopParty = usePartyStore((state) => state.stop)
  const page = useNavigationStore((state) => state.page)
  const navigate = useNavigationStore((state) => state.navigate)
  const connectMatchmaking = useMatchmakingStore((state) => state.connect)
  const queueStatus = useMatchmakingStore((state) => state.queueStatus)
  const completedMatch = useMatchmakingStore((state) => state.completedMatch)
  const dismissCompletedMatch = useMatchmakingStore((state) => state.dismissCompletedMatch)
  const showSocialSidebar = ![
    'ready_check',
    'countdown',
    'starting_server',
    'server_ready'
  ].includes(queueStatus)
  const [installationReady, setInstallationReady] = useState<boolean | null>(null)
  const handleNavigate = (nextPage: LobbyPageId): void => {
    if (completedMatch) dismissCompletedMatch()
    navigate(nextPage)
  }

  useEffect(() => {
    startParty()
    return stopParty
  }, [startParty, stopParty])

  useEffect(() => {
    void connectMatchmaking()
  }, [connectMatchmaking])

  useEffect(() => {
    let active = true
    const check = () => {
      void window.api.gameSettings
        .get()
        .then((settings) => {
          if (active) setInstallationReady(Boolean(settings.cs16ExecutablePath))
        })
        .catch(() => {
          if (active) setInstallationReady(false)
        })
    }
    check()
    const timer = window.setInterval(check, 1500)
    return () => {
      active = false
      window.clearInterval(timer)
    }
  }, [])

  useEffect(() => {
    if (installationReady === false && page !== 'settings') navigate('settings')
  }, [installationReady, navigate, page])

  useEffect(() => {
    if (queueStatus !== 'idle' && queueStatus !== 'joining' && queueStatus !== 'leaving') {
      navigate('play')
    }
    if (queueStatus === 'queued') navigate('lobby')
  }, [navigate, queueStatus])

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  const content = completedMatch ? (
    <MatchResultsPage match={completedMatch} />
  ) : page === 'play' ? (
    <PlayPage />
  ) : page === 'settings' ? (
    <SettingsPage />
  ) : page === 'profile' ? (
    <MatchHistoryPage />
  ) : page === 'news' ? (
    <NewsPage />
  ) : page === 'lobby' ? null : (
    <main className="flex min-h-[calc(100vh-5rem)] items-center justify-center bg-neutral-950/90 p-6">
      <div className="text-center">
        <p className="text-xs font-bold tracking-[0.18em] text-sky-400 uppercase">
          {pageLabels[page]}
        </p>
        <h1 className="mt-3 text-3xl font-semibold">Coming soon</h1>
      </div>
    </main>
  )

  return (
    <main
      className="relative min-h-screen bg-neutral-950 bg-cover bg-center bg-fixed text-white"
      style={{ backgroundImage: `url(${dustBackground})` }}
    >
      <LobbyScene player={player} party={party} />
      <LobbyNavigation
        activePage={page}
        onNavigate={handleNavigate}
        showBackToLobby={!completedMatch}
        className="fixed top-0 left-0 z-30"
      />
      <PartyInvitationModal />
      <PartyChat />
      <LobbySocialSidebar playerId={player.id} />
      {content && (
        <div
          className={`relative z-10 min-h-screen pt-16 backdrop-blur-md sm:pt-20 ${showSocialSidebar ? 'md:pr-72' : ''}`}
        >
          {content}
        </div>
      )}
    </main>
  )
}
