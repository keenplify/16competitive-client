import { useEffect, useState, type JSX } from 'react'
import dustBackground from '../../assets/dust.jpg'
import { LobbyNavigation } from '../../components/ui/lobby/Navigation'
import { useAuthStore } from '../auth/auth.store'
import { PartyPanel } from '../party/PartyPanel'
import { PartyInvitationModal } from '../party/PartyInvitationModal'
import { PartyChat } from '../party/PartyChat'
import { PartyPlayerSlot } from '../party/PartyPlayerSlot'
import { usePartyStore } from '../party/party.store'
import type { PartyMember } from '../../../../shared/party'
import { PlayPage } from './PlayPage'
import { useMatchmakingStore } from './matchmaking.store'
import { useNavigationStore, type LobbyPageId } from '../navigation/navigation.store'
import { SettingsPage } from '../settings/SettingsPage'
import { MatchHistoryPage } from '../profile/MatchHistoryPage'
import { MatchResultsPage } from './MatchResultsPage'
import { NewsPage } from '../news/NewsPage'

const pageLabels: Record<Exclude<LobbyPageId, 'lobby' | 'play'>, string> = {
  leaderboard: 'Leaderboard',
  store: 'Store',
  news: 'News',
  settings: 'Settings',
  profile: 'Profile'
}

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
  const [installationReady, setInstallationReady] = useState<boolean | null>(null)

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
    if (queueStatus === 'queued') navigate('play')
  }, [navigate, queueStatus])

  if (!player) return <main className="min-h-screen bg-neutral-950" />

  const currentPlayer: PartyMember = {
    id: player.id,
    username: player.username,
    mmr: player.mmr
  }
  const members = party?.members ?? [currentPlayer]

  const content = completedMatch ? (
    <MatchResultsPage match={completedMatch} onClose={dismissCompletedMatch} />
  ) : page === 'play' ? (
    <PlayPage />
  ) : page === 'settings' ? (
    <SettingsPage />
  ) : page === 'profile' ? (
    <MatchHistoryPage />
  ) : page === 'news' ? (
    <NewsPage />
  ) : page === 'lobby' ? (
    <div className="flex min-h-[calc(100vh-4rem)] flex-col sm:min-h-[calc(100vh-5rem)]">
      <PartyPanel playerId={player.id} />
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
  ) : (
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
      className="min-h-screen bg-neutral-950 bg-cover bg-center bg-fixed pt-16 text-white sm:pt-20"
      style={{ backgroundImage: `url(${dustBackground})` }}
    >
      <LobbyNavigation
        activePage={page}
        onNavigate={navigate}
        className="fixed top-0 left-0 z-10"
      />
      <PartyInvitationModal />
      <PartyChat />
      {content}
    </main>
  )
}
