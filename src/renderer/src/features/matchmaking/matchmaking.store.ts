import { configuredGames } from '../settings/game-availability'
import { requestBotMatch } from '../../../../shared/bot-match-request'
import { gameForMode } from '../../../../shared/game-version'
import { usePCashBetsStore } from './pcash-bets.store'
import { matchmakingRegionSelection } from '../../../../shared/matchmaking-region-selection'
import type { MatchmakingActivity } from '../../../../shared/matchmaking-activity'
import { useQueueWarmupStore } from './queue-warmup.store'
import type { ServerCustomGameMode } from '../../../../shared/custom-games'
import { friendlyFireMessage } from './friendly-fire-message'
import { ANTI_CHEAT_CANCELLED_MESSAGE } from '../../../../shared/anti-cheat'
import {
  allowsManualMatchConnection,
  MatchmakingEvent,
  MatchmakingMap,
  MatchmakingMode,
  MatchmakingNode,
  MatchmakingSearchStage,
  QueuedPlayer
} from '../../../../shared/matchmaking'
import { create } from 'zustand'
import type { GameLaunchProgress } from '../../../../shared/game-launch-progress'
import { toast } from 'react-toastify'
import { readyCheckRemainingMs } from '../../../../shared/matchmaking-ready-time'
import { readyResponseFromServer } from '../../../../shared/matchmaking-ready-response'
import { rendererMatchmakingDiagnostics } from '../../diagnostic-logs'
import { serverClockNow, syncServerClock } from '../../../../shared/server-clock'
import type { ProfileXpAward } from '../../../../shared/profile-level'
import { useAuthStore } from '../auth/auth.store'
import { usePartyStore } from '../party/party.store'
import { translate, useLanguageStore } from '../i18n/i18n'
import type { AssetPreparation } from './MatchAssetPreparation'
import { isWebRuntime } from '../../web-runtime'
import { readMatchmakingPreferences, saveMatchmakingPreferences } from './matchmaking-preferences'

// A local acknowledgement is UX state only; matchmaking penalties remain server-owned.
interface ReadyWarningRecord {
  matchId: string
  acknowledged: boolean
}
const readyWarnings = new Map<string, ReadyWarningRecord>()
const readReadyWarning = (playerId: string): ReadyWarningRecord | undefined => {
  if (readyWarnings.has(playerId)) return readyWarnings.get(playerId)
  try {
    const saved = JSON.parse(window.localStorage.getItem(`ready-warning:v1:${playerId}`) ?? 'null')
    if (saved && typeof saved.matchId === 'string' && typeof saved.acknowledged === 'boolean') {
      readyWarnings.set(playerId, saved)
      return saved
    }
  } catch {
    /* Storage can be unavailable; retain the in-memory warning. */
  }
  return undefined
}
const saveReadyWarning = (playerId: string, record: ReadyWarningRecord): void => {
  readyWarnings.set(playerId, record)
  try {
    window.localStorage.setItem(`ready-warning:v1:${playerId}`, JSON.stringify(record))
  } catch {
    /* The current session can still acknowledge the warning. */
  }
}

function selectedMapsForMode(
  playerId: string | undefined,
  mode: MatchmakingMode,
  availableMaps: MatchmakingMap[]
): string[] {
  const preferences = readMatchmakingPreferences(playerId)
  const savedMapIds = preferences.mapIdsByMode?.[mode]
  const mapIds = availableMaps.map((map) => map.id)
  // Older preferences tracked review maps only. Establish a full baseline
  // without reselecting regular maps the player had already turned off.
  const seenMapIds = preferences.seenMapIdsByMode?.[mode]
  const previouslySeen = new Set(seenMapIds ?? mapIds)
  const seenReviewMapIds = preferences.seenReviewMapIdsByMode?.[mode] ?? []
  const selected = new Set(savedMapIds ?? mapIds)
  for (const map of availableMaps) {
    if (
      !previouslySeen.has(map.id) ||
      (!seenMapIds && map.feedbackEnabled && !seenReviewMapIds.includes(map.id))
    ) {
      selected.add(map.id)
    }
  }
  const result = mapIds.filter((id) => selected.has(id))
  if (!seenMapIds || mapIds.some((id) => !previouslySeen.has(id))) {
    saveMatchmakingPreferences(playerId, {
      mode,
      mapIds: result,
      seenMapIds: [...new Set([...previouslySeen, ...mapIds])],
      seenReviewMapIds: [
        ...new Set([
          ...seenReviewMapIds,
          ...availableMaps.filter((map) => map.feedbackEnabled).map((map) => map.id)
        ])
      ]
    })
  }
  return result
}

type ConnectionStatus =
  'disconnected' | 'connecting' | 'reconnecting' | 'handoff' | 'authenticating' | 'ready'
type QueueStatus =
  | 'idle'
  | 'joining'
  | 'queued'
  | 'leaving'
  | 'match_found'
  | 'ready_check'
  | 'countdown'
  | 'starting_server'
  | 'server_ready'

interface FoundMatch {
  warmupPhase?: 'WARMUP' | 'STARTING' | 'LIVE'
  ratingMultiplier?: 0.5 | 1
  matchId: string
  mode: MatchmakingMode
  mapId: string
  region: string
  hostApiUrl: string
  teams: { teamA: QueuedPlayer[]; teamB: QueuedPlayer[] }
}

export interface MatchAbandonNotice {
  penalized: boolean
  message: string
}
export interface CompletedMatch extends Omit<FoundMatch, 'region' | 'hostApiUrl'> {
  isCustomRoom?: boolean
  winner: 1 | 2
  winnerPlayerId?: string
  teamAScore: number
  teamBScore: number
  profileXp?: ProfileXpAward
  players: {
    id: string
    username: string
    isBot?: boolean
    kills: number
    deaths: number
    assists: number
    headshots: number
    damage: number
    headshotPercent: number
    adr: number
    mmrBefore: number
    mmrAfter: number
    mmrChange: number
  }[]
}

interface MatchmakingState {
  connectionStatus: ConnectionStatus
  queueStatus: QueueStatus
  selectedMode: MatchmakingMode
  customModes: ServerCustomGameMode[]
  modeOrder: MatchmakingMode[]
  maps: MatchmakingMap[]
  mapsStatus: 'idle' | 'loading' | 'ready' | 'error'
  selectedMapIds: string[]
  nodes: MatchmakingNode[]
  selectedNodeId: string | null
  activeRegion: string | null
  activeApiUrl: string | null
  websocketUrl: string | null
  allowRegionExpansion: boolean
  botFillOptIn: boolean
  botMatchPending: boolean
  playWithBots: () => Promise<void>
  queuedPlayers: number
  activity: MatchmakingActivity | null
  onlinePlayers: number | null
  playersRequired: number
  position: number
  queuedAt: string | null
  autoFillAt: string | null
  searchStage: MatchmakingSearchStage | null
  queueStartedAt: number | null
  match: FoundMatch | null
  completedMatch: CompletedMatch | null
  queueAgainStatus: 'idle' | 'joining' | 'error'
  readyDeadline: string | null
  readyDeclineAvailableAt: string | null
  acceptedPlayerIds: string[]
  readyPlayersRequired: number
  readyResponse: 'pending' | 'sending' | 'accepted' | 'declined'
  dismissedReadyMatchId: string | null
  dismissPreparingReadyCheck: () => void
  countdown: number | null
  assetPreparation: AssetPreparation
  launchPreparation: GameLaunchProgress | null
  connectionDetails: { matchId: string; host: string; port: number; password: string } | null
  gameExited: boolean
  reconnectingGame: boolean
  gameExitCount: number
  matchReadyAt: number | null
  copyConnectionStatus: 'idle' | 'copying' | 'copied'
  serverRestarting: { message: string; retryAfterMs: number } | null
  antiCheatTermination: { matchId: string; dismissed: boolean } | null
  dismissAntiCheatTermination: () => void
  readyWarningOpen: boolean
  showReadyWarning: () => boolean
  acknowledgeReadyWarning: () => void
  matchAbandonNotice: MatchAbandonNotice | null
  error: string | null
  connect: () => Promise<void>
  loadMaps: () => Promise<void>
  loadRegions: () => Promise<void>
  selectNode: (nodeId: string | null) => Promise<void>
  setAllowRegionExpansion: (value: boolean) => Promise<void>
  selectMode: (mode: MatchmakingMode) => void
  selectMap: (mapId: string) => void
  joinQueue: (options?: { keepCompletedMatch?: boolean }) => Promise<void>
  queueAgain: () => Promise<boolean>
  leaveQueue: () => Promise<void>
  leaveFfa: () => Promise<void>
  leavingFfa: boolean
  respondReady: (accepted: boolean) => Promise<void>
  reconnectGame: () => Promise<void>
  copyConnection: () => Promise<void>
  exitCustomMatch: (matchId: string) => void
  reset: () => void
  dismissCompletedMatch: () => void
  dismissMatchAbandonNotice: () => void
}

let removeEventListener: (() => void) | null = null
let queueStatusPollTimer: number | null = null

const readableError = (error: unknown): string => {
  if (!(error instanceof Error)) return 'Matchmaking request failed.'
  if (error.message === 'WEB_STEAM_CREDENTIALS_UNSUPPORTED')
    return translate(useLanguageStore.getState().language, 'webHelper.steamCredentialFallback')
  const key = error.message.replace(/^.*Error: /, '')
  if (
    key === 'match.proton.runtimeUnavailable' ||
    key === 'match.proton.gameUnavailable' ||
    key === 'match.launch.closeFailed' ||
    key === 'match.launch.alreadyRunning' ||
    key === 'match.launch.adminRequired' ||
    key === 'match.launch.adminCancelled' ||
    key === 'match.launch.adminFailed' ||
    key === 'match.launch.adminRestarting'
  )
    return translate(useLanguageStore.getState().language, key)
  const remoteError = error.message.match(/Error: (.+)$/)
  return remoteError?.[1] ?? error.message
}

const timestampMs = (value: string): number | null => {
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : null
}

const isMatchLifecycleStatus = (status: QueueStatus): boolean =>
  ['match_found', 'ready_check', 'countdown', 'starting_server', 'server_ready'].includes(status)

async function loadActivity(
  state: Pick<MatchmakingState, 'nodes' | 'selectedNodeId' | 'allowRegionExpansion'>
): Promise<MatchmakingActivity | null> {
  const { eligibleRegions } = matchmakingRegionSelection(
    state.nodes,
    state.selectedNodeId,
    !state.selectedNodeId
  )
  if (!eligibleRegions.length || typeof window.api.matchmaking.getActivity !== 'function')
    return null
  return window.api.matchmaking.getActivity(eligibleRegions)
}

export const useMatchmakingStore = create<MatchmakingState>((set, get) => {
  const terminalMatchIds = new Set<string>()
  let recoveringReadyMatchId: string | null = null

  const handleEvent = (event: MatchmakingEvent): void => {
    rendererMatchmakingDiagnostics.setOwner(useAuthStore.getState().session?.player.id ?? null)
    rendererMatchmakingDiagnostics.record('renderer_received', event)
    useQueueWarmupStore.getState().handleEvent(event)
    if (event.whileQueued) {
      if (
        event.type === 'error' &&
        (event.message === 'match.launch.closeFailed' ||
          event.message === 'match.launch.alreadyRunning' ||
          event.message === 'match.launch.adminRequired' ||
          event.message === 'match.launch.adminCancelled' ||
          event.message === 'match.launch.adminFailed' ||
          event.message === 'match.launch.adminRestarting')
      ) {
        toast.error(translate(useLanguageStore.getState().language, event.message), {
          toastId: event.message
        })
      }
      if (event.type === 'match_finished' && !terminalMatchIds.has(event.matchId)) {
        terminalMatchIds.add(event.matchId)
        const currentPlayerId = useAuthStore.getState().session?.player.id
        const currentPlayer = event.players.find((player) => player.id === currentPlayerId)
        if (currentPlayer) useAuthStore.getState().setMmr(currentPlayer.mmrAfter)
        window.setTimeout(() => void useAuthStore.getState().refreshSession(), 1_000)
      }
      return
    }
    switch (event.type) {
      case 'game_launch_progress':
        set({
          launchPreparation: { phase: event.phase, completed: event.completed, total: event.total }
        })
        break
      case 'clock_sync':
        syncServerClock(event.serverNow)
        break
      case 'connection_state':
        set({ connectionStatus: event.state })
        break
      case 'connection_endpoint':
        set({ activeApiUrl: event.apiUrl, websocketUrl: event.websocketUrl })
        break
      case 'connected':
        set({ connectionStatus: 'authenticating', error: null })
        break
      case 'authenticated':
        if (event.serverNow) syncServerClock(event.serverNow)
        set({ connectionStatus: 'ready', serverRestarting: null, error: null })
        break
      case 'server_restarting':
        set({
          serverRestarting: { message: event.message, retryAfterMs: event.retryAfterMs },
          error: null
        })
        break
      case 'queue_joined':
        if (event.requeuedFromMatchId) terminalMatchIds.add(event.requeuedFromMatchId)
        set((state) =>
          (isMatchLifecycleStatus(state.queueStatus) && !event.requeuedFromMatchId) ||
          (event.requeuedFromMatchId &&
            state.match &&
            state.match.matchId !== event.requeuedFromMatchId)
            ? {}
            : {
                queueStatus: 'queued',
                completedMatch: null,
                selectedMode: event.mode,
                selectedMapIds: event.mapIds,
                activeRegion: event.region,
                allowRegionExpansion: event.allowRegionExpansion,
                botFillOptIn: event.botFillOptIn ?? false,
                queuedAt: event.queuedAt ?? state.queuedAt,
                autoFillAt: event.autoFillAt ?? state.autoFillAt,
                searchStage: event.searchStage ?? state.searchStage,
                queueStartedAt: event.queuedAt ? timestampMs(event.queuedAt) : state.queueStartedAt,
                ...(event.requeuedFromMatchId
                  ? {
                      match: null,
                      readyDeadline: null,
                      readyDeclineAvailableAt: null,
                      acceptedPlayerIds: [],
                      readyPlayersRequired: 0,
                      readyResponse: 'pending' as const,
                      countdown: null,
                      assetPreparation: {
                        status: 'idle' as const,
                        completedFiles: 0,
                        totalFiles: 0
                      },
                      connectionDetails: null,
                      matchReadyAt: null,
                      gameExited: false
                    }
                  : {}),
                error: null
              }
        )
        break
      case 'queue_status':
        void (
          typeof window.api.matchmaking.getActivity === 'function'
            ? loadActivity(get())
            : Promise.resolve(null)
        )
          .then((activity) => {
            if (get().activeRegion === event.region) set({ activity })
          })
          .catch(() => set({ activity: null }))
        set((state) =>
          isMatchLifecycleStatus(state.queueStatus)
            ? {}
            : {
                queueStatus: 'queued',
                completedMatch: null,
                selectedMode: event.mode,
                selectedMapIds: event.mapIds,
                queuedPlayers: event.queuedPlayers,
                onlinePlayers: event.onlinePlayers ?? state.onlinePlayers,
                playersRequired: event.playersRequired,
                position: event.position,
                activeRegion: event.region,
                allowRegionExpansion: event.allowRegionExpansion,
                botFillOptIn: event.botFillOptIn ?? false,
                queuedAt: event.queuedAt ?? state.queuedAt,
                autoFillAt: event.autoFillAt ?? state.autoFillAt,
                searchStage: event.searchStage ?? state.searchStage,
                queueStartedAt: event.queuedAt ? timestampMs(event.queuedAt) : state.queueStartedAt,
                error: null
              }
        )
        break
      case 'queue_left':
        set({
          queueStatus: 'idle',
          selectedMode: event.mode,
          selectedMapIds: event.mapIds,
          queuedPlayers: 0,
          activity: null,
          onlinePlayers: null,
          playersRequired: 0,
          position: 0,
          queuedAt: null,
          autoFillAt: null,
          searchStage: null,
          queueStartedAt: null,
          readyDeadline: null,
          readyDeclineAvailableAt: null,
          acceptedPlayerIds: [],
          readyPlayersRequired: 0,
          readyResponse: 'pending',
          countdown: null,
          connectionDetails: null,
          gameExited: false,
          error: null
        })
        break
      case 'match_found':
        if ((event.mode === 'ffa' || event.mode === 'arena') && get().queueStatus === 'joining')
          terminalMatchIds.delete(event.matchId)
        if (terminalMatchIds.has(event.matchId)) break
        set((state) =>
          state.match?.matchId === event.matchId && isMatchLifecycleStatus(state.queueStatus)
            ? {
                // Status recovery can deliver roster/deadline before the durable
                // Match Found event. A replay must never erase actionable readiness.
                match: { ...state.match, ...event }
              }
            : {
                queueStatus: 'match_found',
                selectedMode: event.mode,
                selectedMapIds: [event.mapId],
                match: {
                  matchId: event.matchId,
                  mode: event.mode,
                  mapId: event.mapId,
                  region: event.region,
                  hostApiUrl: event.hostApiUrl,
                  teams: event.teams
                },
                assetPreparation: { status: 'checking', completedFiles: 0, totalFiles: 0 },
                activeRegion: event.region,
                queuedAt: null,
                autoFillAt: null,
                searchStage: null,
                queueStartedAt: null,
                readyDeadline: null,
                readyDeclineAvailableAt: null,
                acceptedPlayerIds: [],
                readyPlayersRequired: 0,
                readyResponse: 'pending',
                countdown: null,
                connectionDetails: null,
                gameExited: false,
                error: null
              }
        )
        break
      case 'match_roster':
        if (terminalMatchIds.has(event.matchId)) break
        set({
          match: {
            matchId: event.matchId,
            warmupPhase: event.warmupPhase,
            ratingMultiplier: event.ratingMultiplier,
            mode: event.mode,
            mapId: event.mapId,
            region: event.region,
            hostApiUrl: event.hostApiUrl,
            teams: event.teams
          },
          selectedMode: event.mode,
          selectedMapIds: [event.mapId],
          activeRegion: event.region
        })
        break
      case 'match_assets_progress':
        set((state) =>
          state.match?.matchId === event.matchId ||
          state.connectionDetails?.matchId === event.matchId
            ? {
                assetPreparation: {
                  status: event.status,
                  completedFiles: event.completedFiles,
                  totalFiles: event.totalFiles
                }
              }
            : {}
        )
        break
      case 'match_ready_check':
        recoveringReadyMatchId = null
        set((state) => {
          const remainingMs = readyCheckRemainingMs(
            event.deadline,
            event.serverNow,
            serverClockNow()
          )
          const declineRemainingMs = event.declineAvailableAt
            ? readyCheckRemainingMs(event.declineAvailableAt, event.serverNow, serverClockNow())
            : null
          if (
            terminalMatchIds.has(event.matchId) ||
            state.match?.matchId !== event.matchId ||
            remainingMs === null ||
            remainingMs <= 0
          ) {
            return {}
          }
          return {
            queueStatus: 'ready_check',
            dismissedReadyMatchId: null,
            readyDeadline: new Date(Date.now() + remainingMs).toISOString(),
            readyDeclineAvailableAt:
              declineRemainingMs === null
                ? null
                : new Date(Date.now() + declineRemainingMs).toISOString(),
            acceptedPlayerIds: event.acceptedPlayerIds,
            readyPlayersRequired: event.playersRequired,
            readyResponse: readyResponseFromServer(
              state.readyResponse,
              event.acceptedPlayerIds,
              useAuthStore.getState().session?.player.id
            ),
            error: null
          }
        })
        break
      case 'match_ready_updated':
        set((state) =>
          terminalMatchIds.has(event.matchId) || state.match?.matchId !== event.matchId
            ? {}
            : {
                acceptedPlayerIds: event.acceptedPlayerIds,
                readyPlayersRequired: event.playersRequired,
                readyResponse: readyResponseFromServer(
                  state.readyResponse,
                  event.acceptedPlayerIds,
                  useAuthStore.getState().session?.player.id
                )
              }
        )
        break
      case 'match_countdown':
        set((state) =>
          terminalMatchIds.has(event.matchId) || state.match?.matchId !== event.matchId
            ? {}
            : { queueStatus: 'countdown', countdown: event.secondsRemaining, error: null }
        )
        break
      case 'match_server_starting':
        set((state) =>
          terminalMatchIds.has(event.matchId) || state.match?.matchId !== event.matchId
            ? {}
            : { queueStatus: 'starting_server', countdown: 0, error: null }
        )
        break
      case 'match_connect':
        set((state) =>
          terminalMatchIds.has(event.matchId) ||
          (state.match !== null && state.match.matchId !== event.matchId)
            ? {}
            : {
                queueStatus: 'server_ready',
                connectionDetails: {
                  matchId: event.matchId,
                  host: event.host,
                  port: event.port,
                  password: event.password
                },
                gameExited: false,
                matchReadyAt:
                  state.connectionDetails?.matchId === event.matchId && state.matchReadyAt
                    ? state.matchReadyAt
                    : Date.now(),
                copyConnectionStatus: 'idle',
                error: null
              }
        )
        break
      case 'game_process_exited':
        set((state) =>
          state.connectionDetails?.matchId === event.matchId
            ? {
                queueStatus: 'server_ready',
                gameExited: true,
                gameExitCount: state.gameExitCount + 1,
                error: 'Counter-Strike closed. Reconnect to continue the match.'
              }
            : { gameExitCount: state.gameExitCount + 1 }
        )
        break
      case 'match_finished':
        if (terminalMatchIds.has(event.matchId)) break
        terminalMatchIds.add(event.matchId)
        {
          const currentPlayerId = useAuthStore.getState().session?.player.id
          const currentPlayer = event.players.find((player) => player.id === currentPlayerId)
          if (currentPlayer) useAuthStore.getState().setMmr(currentPlayer.mmrAfter)
        }
        set({
          queueStatus: 'idle',
          queuedAt: null,
          autoFillAt: null,
          searchStage: null,
          queueStartedAt: null,
          queueAgainStatus: 'idle',
          completedMatch: {
            matchId: event.matchId,
            mode: event.mode,
            mapId: event.mapId,
            teams: event.teams,
            isCustomRoom: event.isCustomRoom,
            winner: event.winner,
            winnerPlayerId: event.winnerPlayerId,
            teamAScore: event.teamAScore,
            teamBScore: event.teamBScore,
            profileXp: event.profileXp,
            players: event.players
          },
          match: null,
          assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
          connectionDetails: null,
          matchReadyAt: null,
          gameExited: false,
          error: null
        })
        window.setTimeout(() => void useAuthStore.getState().refreshSession(), 1_000)
        break
      case 'match_cancelled': {
        const playerId = useAuthStore.getState().session?.player.id
        if (
          event.readyCheckFailed === true &&
          playerId &&
          (event.reason === 'PLAYER_NOT_READY' || event.reason === 'PLAYER_DECLINED') &&
          readReadyWarning(playerId)?.matchId !== event.matchId
        ) {
          saveReadyWarning(playerId, { matchId: event.matchId, acknowledged: false })
        }
        if (terminalMatchIds.has(event.matchId)) break
        terminalMatchIds.add(event.matchId)
        if (event.serverCrashed) {
          const language = useLanguageStore.getState().language
          toast.error(
            translate(language, event.pCashRefunded ? 'bet.crashRefunded' : 'bet.crashed', {
              amount: event.pCashRefunded ?? 0
            }),
            { toastId: `server-crash:${event.matchId}` }
          )
          void usePCashBetsStore.getState().load(event.matchId)
        }
        set((state) =>
          (state.match && state.match.matchId !== event.matchId) ||
          (!state.match && ['queued', 'joining', 'leaving'].includes(state.queueStatus))
            ? {}
            : {
                antiCheatTermination:
                  event.message === ANTI_CHEAT_CANCELLED_MESSAGE
                    ? state.antiCheatTermination?.matchId === event.matchId
                      ? state.antiCheatTermination
                      : { matchId: event.matchId, dismissed: false }
                    : state.antiCheatTermination,
                queueStatus: 'idle',
                queuedAt: null,
                autoFillAt: null,
                searchStage: null,
                queueStartedAt: null,
                match: null,
                readyDeadline: null,
                readyDeclineAvailableAt: null,
                acceptedPlayerIds: [],
                readyPlayersRequired: 0,
                readyResponse: 'pending',
                countdown: null,
                assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
                connectionDetails: null,
                matchReadyAt: null,
                gameExited: false,
                error: event.serverCrashed
                  ? null
                  : (state.match?.mode === 'ffa' || state.match?.mode === 'arena') &&
                      event.reason === 'PLAYER_DECLINED'
                    ? null
                    : event.message
              }
        )
        break
      }
      case 'error':
        if (event.code === 'NOT_QUEUED') {
          const state = get()
          if (state.queueStatus === 'ready_check' || state.queueStatus === 'match_found') {
            const deadline = state.readyDeadline ? timestampMs(state.readyDeadline) : null
            // A status request may have been sent just before a match was found.
            // Only an expired ready check can use this response to clear the match.
            if (
              state.match &&
              ((deadline !== null && deadline <= Date.now()) ||
                (state.queueStatus === 'match_found' &&
                  recoveringReadyMatchId === state.match.matchId))
            ) {
              terminalMatchIds.add(state.match.matchId)
              recoveringReadyMatchId = null
              set({
                queueStatus: 'idle',
                queuedAt: null,
                autoFillAt: null,
                searchStage: null,
                queueStartedAt: null,
                match: null,
                readyDeadline: null,
                readyDeclineAvailableAt: null,
                acceptedPlayerIds: [],
                readyPlayersRequired: 0,
                readyResponse: 'pending',
                countdown: null,
                assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
                connectionDetails: null,
                matchReadyAt: null,
                gameExited: false,
                error: translate(useLanguageStore.getState().language, 'match.ready.expired')
              })
            }
            break
          }
          if (!['queued', 'joining', 'leaving'].includes(state.queueStatus)) break
        }
        if (event.code === 'BOT_FILL_NOT_AVAILABLE') {
          set({ error: translate(useLanguageStore.getState().language, 'activity.botUnavailable') })
          break
        }
        if (event.code.startsWith('FRIENDLY_FIRE_')) {
          set((state) => ({
            error: friendlyFireMessage(event.message),
            ...(event.code === 'FRIENDLY_FIRE_KICKED'
              ? { connectionDetails: null, gameExited: true }
              : {}),
            ...(state.queueStatus === 'joining' ? { queueStatus: 'idle' as const } : {})
          }))
          break
        }
        if (event.code === 'UNAUTHORIZED') {
          get().reset()
          useAuthStore.getState().expireSession()
          break
        }
        if (event.code === 'MATCH_ABANDON_WARNING' || event.code === 'MATCH_ABANDON_PENALTY') {
          set({
            matchAbandonNotice: {
              penalized: event.code === 'MATCH_ABANDON_PENALTY',
              message: event.message
            }
          })
          void window.api.window.focus()
          if (event.code === 'MATCH_ABANDON_PENALTY') {
            window.setTimeout(() => void useAuthStore.getState().refreshSession(), 1_000)
          }
          break
        }
        if (event.code === 'MAP_NOT_FOUND') {
          set({
            queueStatus: 'idle',
            queuedAt: null,
            autoFillAt: null,
            searchStage: null,
            queueStartedAt: null,
            selectedMapIds: [],
            error: 'That map is no longer available. Refreshing maps—please select one again.'
          })
          void get()
            .loadMaps()
            .then(() => {
              if (get().mapsStatus === 'ready') {
                set({ error: 'That map is no longer available. Please select a map again.' })
              }
            })
          break
        }
        if (event.code === 'MAP_MODE_UNSUPPORTED') {
          set({
            queueStatus: 'idle',
            queuedAt: null,
            autoFillAt: null,
            searchStage: null,
            queueStartedAt: null,
            selectedMapIds: [],
            error: 'That map is not available for 5v5. Please select another map.'
          })
          break
        }
        set((state) => ({
          ...(event.code === 'NOT_QUEUED' || event.code === 'SERVER_RESTARTING'
            ? {
                queueStatus: 'idle' as const,
                queuedAt: null,
                autoFillAt: null,
                searchStage: null,
                queueStartedAt: null
              }
            : {}),
          ...(event.code === 'MATCH_PREPARATION_FAILED' ||
          event.code === 'MATCH_ASSET_PRELOAD_FAILED'
            ? { assetPreparation: { status: 'idle' as const, completedFiles: 0, totalFiles: 0 } }
            : {}),
          ...((event.code === 'MATCH_PREPARATION_FAILED' ||
            event.code === 'MATCH_ASSET_PRELOAD_FAILED') &&
          state.connectionDetails
            ? { gameExited: true }
            : {}),
          error:
            event.message === 'match.proton.runtimeUnavailable' ||
            event.message === 'match.proton.gameUnavailable' ||
            event.message === 'match.assets.storageDenied' ||
            event.message === 'match.launch.closeFailed' ||
            event.message === 'match.launch.alreadyRunning' ||
            event.message === 'match.launch.adminRequired' ||
            event.message === 'match.launch.adminCancelled' ||
            event.message === 'match.launch.adminFailed' ||
            event.message === 'match.launch.adminRestarting' ||
            event.message === 'legacy.error.installationRequired' ||
            event.message === 'legacy.error.invalidInstallation' ||
            event.message === 'legacy.error.settingsFailed' ||
            event.message === 'legacy.error.busy' ||
            event.message === 'legacy.error.launchFailed'
              ? translate(useLanguageStore.getState().language, event.message)
              : event.code === 'CS13_SERVER_NOT_READY'
                ? translate(useLanguageStore.getState().language, 'legacy.queueUnavailable')
                : event.message
        }))
        break
      case 'pong':
      case 'party_invitation_received':
      case 'party_updated':
      case 'party_disbanded':
      case 'party_presence_ping':
        break
    }
  }

  return {
    connectionStatus: 'disconnected',
    queueStatus: 'idle',
    selectedMode: isWebRuntime() ? 'unrated' : '5v5',
    customModes: [],
    modeOrder: [],
    maps: [],
    mapsStatus: 'idle',
    selectedMapIds: [],
    nodes: [],
    selectedNodeId: null,
    activeRegion: null,
    activeApiUrl: null,
    websocketUrl: null,
    allowRegionExpansion: true,
    botFillOptIn: false,
    botMatchPending: false,
    queuedPlayers: 0,
    activity: null,
    onlinePlayers: null,
    playersRequired: 0,
    position: 0,
    queuedAt: null,
    autoFillAt: null,
    searchStage: null,
    queueStartedAt: null,
    match: null,
    completedMatch: null,
    queueAgainStatus: 'idle',
    readyDeadline: null,
    readyDeclineAvailableAt: null,
    acceptedPlayerIds: [],
    readyPlayersRequired: 0,
    readyResponse: 'pending',
    dismissedReadyMatchId: null,
    dismissPreparingReadyCheck: () => {
      if (get().queueStatus === 'match_found')
        set({ dismissedReadyMatchId: get().match?.matchId ?? null })
    },
    countdown: null,
    assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
    launchPreparation: null,
    connectionDetails: null,
    gameExited: false,
    reconnectingGame: false,
    gameExitCount: 0,
    matchReadyAt: null,
    copyConnectionStatus: 'idle',
    serverRestarting: null,
    antiCheatTermination: null,
    dismissAntiCheatTermination: () =>
      set((state) => ({
        antiCheatTermination: state.antiCheatTermination
          ? { ...state.antiCheatTermination, dismissed: true }
          : null
      })),
    readyWarningOpen: false,
    showReadyWarning: () => {
      const playerId = useAuthStore.getState().session?.player.id
      const warning = playerId ? readReadyWarning(playerId) : undefined
      if (!warning || warning.acknowledged) return false
      set({ readyWarningOpen: true })
      return true
    },
    acknowledgeReadyWarning: () => {
      const playerId = useAuthStore.getState().session?.player.id
      const warning = playerId ? readReadyWarning(playerId) : undefined
      if (playerId && warning) saveReadyWarning(playerId, { ...warning, acknowledged: true })
      set({ readyWarningOpen: false })
    },
    matchAbandonNotice: null,
    error: null,

    connect: async () => {
      if (!removeEventListener) {
        removeEventListener = window.api.matchmaking.onEvent(handleEvent)
      }
      if (!queueStatusPollTimer) {
        queueStatusPollTimer = window.setInterval(() => {
          const state = get()
          const expiredReadyCheck =
            state.queueStatus === 'ready_check' &&
            state.readyDeadline !== null &&
            (timestampMs(state.readyDeadline) ?? Infinity) + 2_000 <= Date.now()
          if (
            state.connectionStatus === 'ready' &&
            (state.queueStatus === 'queued' ||
              state.queueStatus === 'match_found' ||
              expiredReadyCheck)
          ) {
            recoveringReadyMatchId =
              state.queueStatus === 'match_found' ? (state.match?.matchId ?? null) : null
            void window.api.matchmaking.getQueueStatus().catch(() => undefined)
          }
        }, 10_000)
      }

      if (get().connectionStatus !== 'ready') {
        set({ connectionStatus: 'connecting', error: null })
      }
      try {
        await window.api.matchmaking.connect()
      } catch (error) {
        set({ connectionStatus: 'disconnected', error: readableError(error) })
      }
    },

    loadMaps: async () => {
      if (get().mapsStatus === 'loading') return
      const playerId = useAuthStore.getState().session?.player.id
      const saved = readMatchmakingPreferences(playerId)
      const initialMode =
        get().mapsStatus === 'idle' && get().queueStatus === 'idle'
          ? (saved.lastMode ?? get().selectedMode)
          : get().selectedMode
      set({
        ...(get().mapsStatus === 'ready' ? {} : { mapsStatus: 'loading' as const }),
        selectedMode: initialMode,
        error: null
      })
      try {
        const { maps, customModes, modeOrder } = await window.api.matchmaking.getMaps()
        const availableModesFor = (map: MatchmakingMap): MatchmakingMode[] =>
          isWebRuntime() && !useWebHelperPromptStore.getState().competitiveReady
            ? map.webModes
            : map.supportedModes
        const selectedMode =
          get().queueStatus === 'idle' &&
          !maps.some((map) => availableModesFor(map).includes(get().selectedMode))
            ? (maps.flatMap(availableModesFor)[0] ?? get().selectedMode)
            : get().selectedMode
        const availableMaps = maps.filter((map) => availableModesFor(map).includes(selectedMode))
        const availableMapIds = new Set(availableMaps.map((map) => map.id))
        if (selectedMode !== get().selectedMode) {
          saveMatchmakingPreferences(playerId, { lastMode: selectedMode })
        }
        set({
          maps,
          customModes,
          modeOrder,
          mapsStatus: 'ready',
          selectedMode,
          selectedMapIds:
            get().queueStatus === 'idle'
              ? selectedMapsForMode(playerId, selectedMode, availableMaps)
              : get().selectedMapIds.filter((mapId) => availableMapIds.has(mapId))
        })
      } catch (error) {
        const message = readableError(error)
        set({
          mapsStatus: 'error',
          maps: [],
          customModes: [],
          modeOrder: [],
          selectedMapIds: [],
          error: message
        })
        if (message.includes('MATCHMAKING_MAPS_UNAUTHORIZED')) {
          void useAuthStore.getState().logout()
        }
      }
    },

    loadRegions: async () => {
      try {
        const [nodes, preferences] = await Promise.all([
          window.api.matchmaking.getNodes(),
          window.api.matchmaking.getPreferences()
        ])
        if (!preferences.allowRegionExpansion)
          await window.api.matchmaking.setAllowRegionExpansion(true)
        set({
          nodes,
          selectedNodeId: preferences.selectedNodeId,
          allowRegionExpansion: !preferences.selectedNodeId
        })
        const activity =
          typeof window.api.matchmaking.getActivity === 'function'
            ? await loadActivity(get()).catch(() => null)
            : null
        if (get().selectedNodeId === preferences.selectedNodeId) set({ activity })
      } catch (error) {
        set({ error: readableError(error) })
      }
    },

    selectNode: async (selectedNodeId) => {
      try {
        const preferences = await window.api.matchmaking.selectNode(selectedNodeId)
        set({
          selectedNodeId: preferences.selectedNodeId,
          allowRegionExpansion: !preferences.selectedNodeId,
          activity: null
        })
        const activity =
          typeof window.api.matchmaking.getActivity === 'function'
            ? await loadActivity(get()).catch(() => null)
            : null
        if (get().selectedNodeId === preferences.selectedNodeId) set({ activity })
      } catch (error) {
        set({ error: readableError(error) })
      }
    },

    setAllowRegionExpansion: async (allowRegionExpansion) => {
      try {
        const preferences =
          await window.api.matchmaking.setAllowRegionExpansion(allowRegionExpansion)
        set({ allowRegionExpansion: preferences.allowRegionExpansion, activity: null })
        set({ activity: await loadActivity(get()).catch(() => null) })
      } catch (error) {
        set({ error: readableError(error) })
      }
    },

    selectMode: (selectedMode) => {
      const { maps } = get()
      const availableMaps = maps.filter((map) => map.supportedModes.includes(selectedMode))
      const playerId = useAuthStore.getState().session?.player.id
      saveMatchmakingPreferences(playerId, { lastMode: selectedMode })
      set({
        selectedMode,
        selectedMapIds: selectedMapsForMode(playerId, selectedMode, availableMaps),
        error: null
      })
    },

    selectMap: (selectedMapId) => {
      const { maps } = get()
      if (
        !maps.some(
          (map) => map.id === selectedMapId && map.supportedModes.includes(get().selectedMode)
        )
      ) {
        return
      }
      const { selectedMapIds, selectedMode } = get()
      const nextMapIds = selectedMapIds.includes(selectedMapId)
        ? selectedMapIds.filter((mapId) => mapId !== selectedMapId)
        : [...selectedMapIds, selectedMapId]
      saveMatchmakingPreferences(useAuthStore.getState().session?.player.id, {
        mode: selectedMode,
        mapIds: nextMapIds
      })
      set({ selectedMapIds: nextMapIds, error: null })
    },

    playWithBots: async () => {
      if (get().botMatchPending) return
      set({ botMatchPending: true })
      const language = useLanguageStore.getState().language
      const feedback = toast.loading(translate(language, 'activity.playBotsPending'))
      try {
        await requestBotMatch(window.api.matchmaking)
        set({ error: null })
        toast.update(feedback, {
          render: translate(language, 'activity.playBotsRequested'),
          type: 'success',
          isLoading: false,
          autoClose: 3000
        })
      } catch (error) {
        console.warn('[Matchmaking] bot match request failed', error)
        set({ error: translate(language, 'activity.playBotsError') })
        toast.update(feedback, {
          render: translate(language, 'activity.playBotsError'),
          type: 'error',
          isLoading: false,
          autoClose: 6000
        })
      } finally {
        set({ botMatchPending: false })
      }
    },

    queueAgain: async () => {
      const state = get()
      const completed = state.completedMatch
      const playerId = useAuthStore.getState().session?.player.id
      const party = usePartyStore.getState().party
      if (
        !completed ||
        completed.mode !== 'arena' ||
        !playerId ||
        state.queueAgainStatus === 'joining' ||
        state.queueStatus !== 'idle' ||
        (party && party.leaderId !== playerId)
      )
        return false
      if (state.connectionStatus !== 'ready' || state.mapsStatus !== 'ready') {
        set({ queueAgainStatus: 'error' })
        return false
      }
      const available = new Set(
        state.maps
          .filter(
            (map) =>
              map.supportedModes.includes(completed.mode) &&
              (!isWebRuntime() || map.webModes.includes(completed.mode))
          )
          .map((map) => map.id)
      )
      const savedMaps = readMatchmakingPreferences(playerId).mapIdsByMode?.[completed.mode]
      const previousMaps =
        savedMaps ??
        (state.selectedMode === completed.mode ? state.selectedMapIds : [completed.mapId])
      const mapIds = previousMaps.filter((id) => available.has(id))
      if (mapIds.length === 0) {
        set({ queueAgainStatus: 'error' })
        return false
      }
      set({
        selectedMode: completed.mode,
        selectedMapIds: mapIds,
        queueAgainStatus: 'joining',
        error: null
      })
      await get().joinQueue({ keepCompletedMatch: true })
      const joined = get().queueStatus !== 'idle'
      set({
        queueAgainStatus: joined ? 'idle' : 'error',
        ...(joined ? { completedMatch: null } : {})
      })
      return joined
    },

    joinQueue: async (options) => {
      if (get().showReadyWarning()) return
      const {
        connectionStatus,
        maps,
        mapsStatus,
        selectedMapIds,
        selectedNodeId,
        nodes,
        selectedMode
      } = get()
      if (connectionStatus !== 'ready' || get().queueStatus !== 'idle') return
      // Ask while the Join Queue click still has browser user activation.
      if (isWebRuntime() && 'Notification' in window && Notification.permission === 'default') {
        void Notification.requestPermission().catch(() => undefined)
      }
      const settings = await window.api.gameSettings.get().catch(() => null)
      const game = gameForMode(selectedMode)
      const ready =
        game === 'cs13' ? (await configuredGames()).includes(game) : !!settings?.cs16ExecutablePath
      if (!ready) {
        set({
          error: translate(useLanguageStore.getState().language, 'gameSetup.required')
        })
        return
      }
      if (mapsStatus !== 'ready' || selectedMapIds.length === 0) {
        set({ error: 'Select at least one available map before joining matchmaking.' })
        return
      }
      const availableMapIds = new Set(
        maps.filter((map) => map.supportedModes.includes(selectedMode)).map((map) => map.id)
      )
      if (selectedMapIds.some((mapId) => !availableMapIds.has(mapId))) {
        set({
          selectedMapIds: selectedMapIds.filter((mapId) => availableMapIds.has(mapId)),
          error: `One or more selected maps are no longer available for ${selectedMode}. Review your map pool.`
        })
        return
      }

      set({
        queueStatus: 'joining',
        completedMatch: options?.keepCompletedMatch ? get().completedMatch : null,
        queuedAt: null,
        onlinePlayers: null,
        autoFillAt: null,
        searchStage: null,
        queueStartedAt: null,
        error: null
      })
      try {
        const { preferredNode, eligibleRegions } = matchmakingRegionSelection(
          nodes,
          selectedNodeId,
          !selectedNodeId
        )
        if (!preferredNode)
          throw new Error(translate(useLanguageStore.getState().language, 'activity.noNearby'))
        await window.api.matchmaking.joinQueue(
          selectedMode,
          selectedMapIds,
          !selectedNodeId,
          preferredNode?.region ?? null,
          eligibleRegions
        )
      } catch (error) {
        set({ queueStatus: 'idle', queueStartedAt: null, error: readableError(error) })
      }
    },

    leaveQueue: async () => {
      set({ queueStatus: 'leaving', error: null })
      try {
        await window.api.matchmaking.leaveQueue()
      } catch (error) {
        set({ queueStatus: 'queued', error: readableError(error) })
      }
    },

    respondReady: async (accepted) => {
      const matchId = get().match?.matchId
      const previousResponse = get().readyResponse
      const declineAt = get().readyDeclineAvailableAt
      if (
        !matchId ||
        get().queueStatus !== 'ready_check' ||
        (get().readyResponse !== 'pending' &&
          !(
            get().readyResponse === 'accepted' &&
            !accepted &&
            declineAt &&
            Date.parse(declineAt) <= Date.now()
          ))
      )
        return
      set({ readyResponse: 'sending', error: null })
      try {
        await window.api.matchmaking.respondReady(matchId, accepted)
        if (get().match?.matchId === matchId) {
          set({ readyResponse: accepted ? 'accepted' : 'declined' })
        }
      } catch (error) {
        if (get().match?.matchId === matchId) {
          set({ readyResponse: previousResponse, error: readableError(error) })
        }
      }
    },

    reconnectGame: async () => {
      if (get().reconnectingGame) return
      const language = useLanguageStore.getState().language
      const feedback = toast.loading(translate(language, 'match.launch.processing'))
      set({ error: null, reconnectingGame: true })
      try {
        await window.api.matchmaking.reconnectGame()
        set({ gameExited: false })
        toast.update(feedback, {
          render: translate(language, 'match.launch.requested'),
          type: 'success',
          isLoading: false,
          autoClose: 4000
        })
      } catch (error) {
        const message = readableError(error)
        const friendly = message.includes('match.assets.storageDenied')
          ? translate(language, 'match.assets.storageDenied')
          : message
        set({
          assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
          error: friendly
        })
        toast.update(feedback, {
          render: friendly,
          type: 'error',
          isLoading: false,
          autoClose: 6000
        })
      } finally {
        set({ reconnectingGame: false })
      }
    },

    copyConnection: async () => {
      const matchMode = get().match?.mode
      const rankedWebEnabled =
        matchMode === '5v5' && get().maps.some((map) => map.webModes.includes('5v5'))
      if (!allowsManualMatchConnection(matchMode) && !rankedWebEnabled) {
        set({ error: 'Ranked matches require the desktop launcher.', copyConnectionStatus: 'idle' })
        return
      }
      const matchId = get().connectionDetails?.matchId
      if (!matchId || get().copyConnectionStatus === 'copying') return
      set({ copyConnectionStatus: 'copying', error: null })
      try {
        await window.api.matchmaking.copyConnection(matchId)
        if (get().connectionDetails?.matchId === matchId) set({ copyConnectionStatus: 'copied' })
      } catch (error) {
        set({ copyConnectionStatus: 'idle', error: readableError(error) })
      }
    },

    exitCustomMatch: (matchId) => {
      if (get().match?.matchId !== matchId) return
      terminalMatchIds.add(matchId)
      set({
        queueStatus: 'idle',
        queuedAt: null,
        autoFillAt: null,
        searchStage: null,
        queueStartedAt: null,
        match: null,
        readyDeadline: null,
        readyDeclineAvailableAt: null,
        acceptedPlayerIds: [],
        readyPlayersRequired: 0,
        readyResponse: 'pending',
        countdown: null,
        assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
        connectionDetails: null,
        matchReadyAt: null,
        copyConnectionStatus: 'idle',
        gameExited: false,
        error: null
      })
    },

    leavingFfa: false,
    leaveFfa: async () => {
      const match = get().match
      if (!match || (match.mode !== 'ffa' && match.mode !== 'arena') || get().leavingFfa) return
      set({ leavingFfa: true, error: null })
      const t = (key: 'ffa.leaving' | 'ffa.left' | 'ffa.leaveError'): string =>
        translate(useLanguageStore.getState().language, key)
      const feedback = toast.loading(t('ffa.leaving'))
      try {
        await window.api.matchmaking.leaveFfa(match.matchId)
        toast.update(feedback, {
          render: t('ffa.left'),
          type: 'success',
          isLoading: false,
          autoClose: 3000
        })
      } catch {
        const message = t('ffa.leaveError')
        set({ error: message })
        toast.update(feedback, {
          render: message,
          type: 'error',
          isLoading: false,
          autoClose: 6000
        })
      } finally {
        set({ leavingFfa: false })
      }
    },

    dismissCompletedMatch: () =>
      set({ completedMatch: null, queueAgainStatus: 'idle', error: null }),

    dismissMatchAbandonNotice: () => set({ matchAbandonNotice: null }),

    reset: () => {
      recoveringReadyMatchId = null
      set({ dismissedReadyMatchId: null })
      set({ readyWarningOpen: false })
      useQueueWarmupStore.getState().reset()
      set({
        connectionStatus: 'disconnected',
        copyConnectionStatus: 'idle',
        matchReadyAt: null,
        queueStatus: 'idle',
        selectedMode: isWebRuntime() ? 'unrated' : '5v5',
        customModes: [],
        maps: [],
        mapsStatus: 'idle',
        selectedMapIds: [],
        nodes: [],
        selectedNodeId: null,
        activeRegion: null,
        activeApiUrl: null,
        websocketUrl: null,
        allowRegionExpansion: true,
        queuedPlayers: 0,
        activity: null,
        onlinePlayers: null,
        playersRequired: 0,
        position: 0,
        queuedAt: null,
        autoFillAt: null,
        searchStage: null,
        queueStartedAt: null,
        match: null,
        completedMatch: null,
        queueAgainStatus: 'idle',
        readyDeadline: null,
        readyDeclineAvailableAt: null,
        acceptedPlayerIds: [],
        readyPlayersRequired: 0,
        readyResponse: 'pending',
        countdown: null,
        assetPreparation: { status: 'idle', completedFiles: 0, totalFiles: 0 },
        connectionDetails: null,
        gameExited: false,
        serverRestarting: null,
        antiCheatTermination: null,
        matchAbandonNotice: null,
        error: null
      })
    }
  }
})
import { useWebHelperPromptStore } from './web-helper-prompt.store'

useAuthStore.subscribe((state, previous) => {
  if (state.session?.player.id !== previous.session?.player.id) {
    useMatchmakingStore.getState().reset()
  }
})

rendererMatchmakingDiagnostics.setSnapshot(() => {
  rendererMatchmakingDiagnostics.setOwner(useAuthStore.getState().session?.player.id ?? null)
  const state = useMatchmakingStore.getState()
  return {
    connectionStatus: state.connectionStatus,
    queueStatus: state.queueStatus,
    activeApiUrl: state.activeApiUrl,
    websocketUrl: state.websocketUrl,
    matchId: state.match?.matchId ?? null,
    readyDeadline: state.readyDeadline,
    remainingMs: state.readyDeadline ? Date.parse(state.readyDeadline) - serverClockNow() : null,
    readyResponse: state.readyResponse,
    readyWarningOpen: state.readyWarningOpen,
    acceptedCount: state.acceptedPlayerIds.length,
    readyPlayersRequired: state.readyPlayersRequired,
    status: state.assetPreparation.status,
    completedFiles: state.assetPreparation.completedFiles,
    totalFiles: state.assetPreparation.totalFiles,
    hasConnection: state.connectionDetails !== null,
    gameExited: state.gameExited,
    gameExitCount: state.gameExitCount,
    copyConnectionStatus: state.copyConnectionStatus,
    clockOffsetMs: serverClockNow() - Date.now()
  }
})
