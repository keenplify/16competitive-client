// Isolated design fixture. Uses production components and simulated balances;
// no authentication, real wagers or backend requests are made.
import { createRoot } from 'react-dom/client'
import { ToastContainer } from 'react-toastify'
import { MatchFoundReadyCheck } from '../src/renderer/src/features/matchmaking/MatchFoundReadyCheck'
import { PCashBetResultView } from '../src/renderer/src/features/matchmaking/PCashBetResult'
import { usePCashBetsStore } from '../src/renderer/src/features/matchmaking/pcash-bets.store'
import { useAuthStore } from '../src/renderer/src/features/auth/auth.store'
import { useReadyPlayerRanksStore } from '../src/renderer/src/features/matchmaking/ready-player-ranks.store'
import { useLanguageStore } from '../src/renderer/src/features/i18n/i18n'
import type { PCashBetSnapshot } from '../src/shared/pcash-bets'
import '../src/renderer/src/assets/main.css'
import '../src/renderer/src/features/matchmaking/match-ready.css'

const matchId = '00000000-0000-4000-8000-000000000001'
const playerId = '00000000-0000-4000-8000-000000000002'
const sample: PCashBetSnapshot = {
  matchId,
  enabled: true,
  open: true,
  balance: 1200,
  partnerBps: 1000,
  platformBps: 1000,
  bet: null
}
const names = ['papamo', 'madara_CS', 'LeoFour', 'LQS', 'rynii', 'Sfaithu']
const players = names.map((username, index) => ({
  id: index === 0 ? playerId : `preview-${index}`,
  username,
  mmr: 1200
}))
window.api = {
  pCashBets: {
    get: async () => usePCashBetsStore.getState().snapshot ?? sample,
    place: async (_id, input) => {
      await new Promise((resolve) => window.setTimeout(resolve, 900))
      if (new URLSearchParams(location.search).has('error'))
        throw new Error('BET_INSUFFICIENT_PCASH')
      return {
        ...sample,
        balance: sample.balance - input.stake,
        bet: {
          stake: input.stake,
          status: 'PENDING',
          payout: null,
          expectedPayout: input.stake * 2 - Math.floor(input.stake * 0.2) * 2
        }
      }
    }
  }
} as typeof window.api
useAuthStore.setState({ session: { player: { id: playerId } } as never })
usePCashBetsStore.setState({ ownerId: playerId, matchId, snapshot: sample })
useReadyPlayerRanksStore.setState({
  matchId,
  ranks: Object.fromEntries(
    players.map((player, index) => [player.id, { level: 8 + index, levelTitle: player.username }])
  ),
  load: async () => {}
})
const language = new URLSearchParams(location.search).get('language')
if (language) useLanguageStore.getState().setLanguage(language as never)
const latest = new URLSearchParams(location.search).get('theme') === 'latest'
document.documentElement.dataset.launcherTheme = latest ? 'latest' : 'vgui2'
const style = document.createElement('style')
style.textContent =
  ":root:root[data-launcher-theme='vgui2']{--vgui-face:#203f5f;--vgui-inset:#07131f;--vgui-light:#b7c8db;--vgui-dark:#04101b;--vgui-text:#eef4fa;--vgui-accent:#ff941f;--color-white:#eef4fa;--color-neutral-300:#c6d3e2;--color-neutral-950:#07131f}body{margin:0;background:#07131f}"
document.head.append(style)
createRoot(document.getElementById('root')!).render(
  <main className="mx-auto grid min-h-screen max-w-[1600px] items-start gap-8 p-5 text-white lg:grid-cols-2 lg:p-10">
    <div>
      <p className="mb-4 text-sm text-neutral-200">Design preview · Stake confirmation</p>
      <MatchFoundReadyCheck
        match={{
          matchId,
          mode: '3v3',
          mapId: 'de_dust2',
          teams: { teamA: players.slice(0, 3), teamB: players.slice(3) }
        }}
        acceptedPlayerIds={players.slice(1).map((p) => p.id)}
        playersRequired={6}
        readyResponse="pending"
        secondsRemaining={45}
        canDeclineAfterAccept={false}
        onAccept={() => {}}
        onDecline={() => {}}
      />
    </div>
    <div>
      <p className="mb-4 text-sm text-neutral-200">Design preview · Post-game win</p>
      <section className="border border-white/40 p-5 sm:p-8" style={{ background: latest ? '#0b171f' : '#203f5f' }}>
        <h1 className="text-center text-3xl font-bold uppercase text-emerald-200">Victory</h1>
        <p className="mt-2 text-center text-sm text-neutral-100">Ranked 3v3 · Dust II · MR8</p>
        <p className="my-6 text-center text-5xl font-bold tabular-nums">9 : 6</p>
        <PCashBetResultView
          snapshot={{
            ...sample,
            open: false,
            balance: 1260,
            bet: { stake: 100, status: 'WON', payout: 160, expectedPayout: 160 }
          }}
        />
      </section>
    </div>
    <ToastContainer position="bottom-right" />
  </main>
)
