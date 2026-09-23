import type { DailyQuestSnapshot } from '../shared/daily-quests'
import type {
  FriendChatMessage,
  FriendSearchResult,
  FriendsSnapshot
} from '../shared/friends'
import type { GameSettings, SkinAssetSyncProgress } from '../shared/game-settings'
import type { LeaderboardEntry, TopMmrLeaderboard } from '../shared/leaderboard'
import type {
  MatchHistoryEntry,
  MatchSummary,
  PlayerProfile
} from '../shared/match-history'
import type { NewsPost } from '../shared/news'
import type {
  Operation,
  OperationSnapshot,
  OperationViewedResult
} from '../shared/operations'
import type {
  Party,
  PartyInvitationResponse,
  PartyLeaveResponse,
  PendingPartyInvitation,
  SentPartyInvitation
} from '../shared/party'
import type { RedeemCodeResponse } from '../shared/redeem-codes'
import type {
  LobbyLoadout,
  OwnedSkin,
  Skin,
  SkinCurrency,
  SkinGift,
  SkinGiftChoice,
  UnlockResult
} from '../shared/skins'
import { browserAuthApi } from './browser-auth'
import {
  browserMatchmakingApi,
  browserPartyRealtime
} from './browser-matchmaking'
import {
  getWebSessionToken,
  requestArrayBuffer,
  requestJson
} from './browser-session'

const runtimeWindow = window as Window & { __SIXTEEN_COMPETITIVE_WEB__?: boolean }
runtimeWindow.__SIXTEEN_COMPETITIVE_WEB__ = true

const PTT_KEYS_KEY = '16competitive.web.ptt-keys'
const thumbnailCache = new Map<string, ArrayBuffer>()

const getPttKeys = (): [string, string] => {
  try {
    const parsed = JSON.parse(localStorage.getItem(PTT_KEYS_KEY) ?? 'null') as unknown
    if (
      Array.isArray(parsed) &&
      parsed.length === 2 &&
      parsed.every((value) => typeof value === 'string' && value.length > 0)
    ) {
      return [parsed[0], parsed[1]]
    }
  } catch {
    // Fall back to launcher defaults.
  }
  return ['K', 'V']
}

const browserSettings = (): GameSettings => {
  const [team, party] = getPttKeys()
  return {
    cs16ExecutablePath: 'steam://run/10',
    cs16FolderPath: null,
    configFilePath: 'Browser / Steam',
    voicePttKey: team,
    voicePttKeys: [team, party]
  }
}

const authenticatedGet = <T>(path: string): Promise<T> =>
  requestJson<T>(path, { authenticated: true })

const jsonPost = <T>(path: string, body?: unknown): Promise<T> =>
  requestJson<T>(path, {
    authenticated: true,
    init: {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }
  })

const friends = {
  async list(): Promise<FriendsSnapshot> {
    const body = await authenticatedGet<FriendsSnapshot>('/friends')
    return body
  },
  async search(query: string): Promise<FriendSearchResult[]> {
    const body = await authenticatedGet<{ players: FriendSearchResult[] }>(
      `/friends/search?query=${encodeURIComponent(query.trim())}`
    )
    return body.players
  },
  async request(playerId: string): Promise<void> {
    await jsonPost('/friends/requests', { playerId })
  },
  async accept(requestId: string): Promise<void> {
    await jsonPost(`/friends/requests/${requestId}/accept`)
  },
  async discard(requestId: string): Promise<void> {
    await requestJson(`/friends/requests/${requestId}`, {
      authenticated: true,
      init: { method: 'DELETE' }
    })
  },
  async remove(playerId: string): Promise<void> {
    await requestJson(`/friends/${playerId}`, {
      authenticated: true,
      init: { method: 'DELETE' }
    })
  },
  async getChatHistory(playerId: string): Promise<FriendChatMessage[]> {
    const body = await authenticatedGet<{ messages: FriendChatMessage[] }>(
      `/friends/${playerId}/messages`
    )
    return body.messages
  },
  async sendChatMessage(playerId: string, message: string): Promise<FriendChatMessage> {
    const body = await jsonPost<{ message: FriendChatMessage }>(
      `/friends/${playerId}/messages`,
      { message: message.trim() }
    )
    return body.message
  },
  async requestAttention(): Promise<void> {
    if (document.hidden && 'Notification' in window && Notification.permission === 'granted') {
      new Notification('1.6 Competitive', { body: 'You have a new message.' })
    }
  }
}

const party = {
  async get(): Promise<Party | null> {
    const body = await authenticatedGet<{ party: Party | null }>('/party')
    return body.party
  },
  async getInvitations(): Promise<PendingPartyInvitation[]> {
    const body = await authenticatedGet<{ invitations: PendingPartyInvitation[] }>(
      '/party/invitations'
    )
    return body.invitations
  },
  async invite(username: string): Promise<SentPartyInvitation> {
    return jsonPost('/party/invitations', { username })
  },
  async respond(
    invitationId: string,
    decision: 'accept' | 'decline'
  ): Promise<PartyInvitationResponse> {
    return jsonPost(`/party/invitations/${invitationId}/${decision}`)
  },
  async leave(): Promise<PartyLeaveResponse> {
    return jsonPost('/party/leave')
  },
  sendMessage: browserPartyRealtime.sendMessage,
  sendGlobalMessage: browserPartyRealtime.sendGlobalMessage,
  setGlobalChatLanguage: browserPartyRealtime.setGlobalChatLanguage,
  onDiscordJoinResult() {
    return () => undefined
  }
}

const skins = {
  async list(weaponKey?: string): Promise<Skin[]> {
    const data = await authenticatedGet<Skin[]>('/skins/store')
    return weaponKey ? data.filter((skin) => skin.weaponKey === weaponKey) : data
  },
  mine(): Promise<OwnedSkin[]> {
    return authenticatedGet('/skins/mine')
  },
  getLobbyLoadout(): Promise<LobbyLoadout> {
    return authenticatedGet('/skins/lobby-loadout')
  },
  async unlock(skinId: string, currency: SkinCurrency): Promise<UnlockResult> {
    const path =
      currency === 'P_CASH'
        ? `/skins/${skinId}/unlock-p-cash`
        : `/skins/${skinId}/unlock`
    const body = await jsonPost<Record<string, unknown>>(path)
    return { ...body, currency } as unknown as UnlockResult
  },
  async equip(skinId: string): Promise<void> {
    await jsonPost(`/skins/${skinId}/equip`)
  },
  async unequip(skinId: string): Promise<void> {
    await jsonPost(`/skins/${skinId}/unequip`)
  },
  previewModel(skinId: string): Promise<ArrayBuffer> {
    return requestArrayBuffer(`/skins/${skinId}/preview-model`, {
      authenticated: true
    })
  },
  async setLobbyWeapon(skinId: string): Promise<void> {
    await jsonPost(`/skins/${skinId}/lobby-weapon`)
  },
  async setLobbyWeaponKey(weaponKey: string): Promise<void> {
    await jsonPost('/skins/lobby-weapon', { weaponKey })
  },
  async setLobbyPlayerModel(modelPath: string): Promise<void> {
    await jsonPost('/skins/lobby-player-model', { modelPath })
  },
  async pendingGift(): Promise<SkinGift | null> {
    const body = await authenticatedGet<{ gift: SkinGift | null }>('/skin-gifts/pending')
    return body.gift
  },
  async claimGift(
    giftId: string,
    rewardId: string
  ): Promise<{ reward: SkinGiftChoice; pointsGranted?: number; pCoinsGranted?: number }> {
    return jsonPost(`/skin-gifts/${giftId}/claim`, { rewardId })
  }
}

const parseNews = (value: unknown): NewsPost | null => {
  if (typeof value !== 'object' || value === null) return null
  const item = value as Record<string, unknown>
  if (
    typeof item.id !== 'string' ||
    typeof item.created_at !== 'string' ||
    typeof item.content !== 'string'
  ) {
    return null
  }
  const media = Array.isArray(item.media_attachments) ? item.media_attachments[0] : null
  const mediaUrl =
    typeof media === 'object' &&
    media !== null &&
    typeof (media as Record<string, unknown>).preview_url === 'string'
      ? String((media as Record<string, unknown>).preview_url)
      : null
  return {
    id: item.id,
    createdAt: item.created_at,
    url:
      typeof item.url === 'string'
        ? item.url
        : 'https://mastodon.social/@16competitive',
    content: item.content,
    mediaUrl
  }
}

const fetchNews = async (limit: 4 | 20, pinned = false): Promise<NewsPost[]> => {
  const query = new URLSearchParams({ limit: String(limit) })
  if (pinned) query.set('pinned', 'true')
  const response = await fetch(
    `https://mastodon.social/api/v1/accounts/117184181054588299/statuses?${query}`,
    { signal: AbortSignal.timeout(10_000) }
  )
  if (!response.ok) throw new Error('Could not load news.')
  const body: unknown = await response.json()
  return Array.isArray(body)
    ? body.map(parseNews).filter((post): post is NewsPost => post !== null)
    : []
}

const api: Window['api'] = {
  auth: browserAuthApi,

  antiCheat: {
    async getDeviceStatus() {
      // The browser has no privileged hardware fingerprint. Account/server bans
      // remain enforced by authenticated backend endpoints and matchmaking.
      return { banned: false }
    }
  },

  dailyQuests: {
    get(): Promise<DailyQuestSnapshot> {
      return authenticatedGet('/daily-quests')
    }
  },

  friends,

  gameSettings: {
    async get() {
      return browserSettings()
    },
    async chooseFolder() {
      return null
    },
    async save() {
      throw new Error('Browser mode launches the Steam copy of Counter-Strike directly.')
    },
    async setVoicePttKey(key) {
      const [team, partyKey] = getPttKeys()
      const next: [string, string] = key.startsWith('party:')
        ? [team, key.slice('party:'.length)]
        : [key, partyKey]
      if (next[0].toLowerCase() === next[1].toLowerCase()) {
        throw new Error('Team and Party talk need different push-to-talk keys.')
      }
      localStorage.setItem(PTT_KEYS_KEY, JSON.stringify(next))
      return browserSettings()
    },
    async getAssetSyncStatus(): Promise<SkinAssetSyncProgress> {
      return { status: 'ready', completedFiles: 0, totalFiles: 0 }
    },
    async syncAssets() {
      // Web previews stream assets from the selected regional API instead.
    },
    onAssetSyncProgress() {
      return () => undefined
    }
  },

  leaderboard: {
    async getTopMmr(continentOf?: string): Promise<TopMmrLeaderboard> {
      const query = continentOf ? `?continentOf=${encodeURIComponent(continentOf)}` : ''
      const leaderboard = await requestJson<Omit<TopMmrLeaderboard, 'currentPlayer'>>(
        `/leaderboard/top-mmr${query}`
      )
      let currentPlayer: LeaderboardEntry | null = null
      if (getWebSessionToken()) {
        try {
          currentPlayer = await requestJson<LeaderboardEntry>(`/leaderboard/me${query}`, {
            authenticated: true
          })
        } catch {
          currentPlayer = null
        }
      }
      return { ...leaderboard, currentPlayer }
    }
  },

  matchmaking: browserMatchmakingApi,

  matchHistory: {
    async get(): Promise<MatchHistoryEntry[]> {
      const body = await authenticatedGet<{ matches: MatchHistoryEntry[] }>('/profile/matches')
      return body.matches
    },
    async getSummary(matchId: string): Promise<MatchSummary> {
      const body = await authenticatedGet<{ match: MatchSummary }>(
        `/profile/matches/${matchId}`
      )
      return body.match
    },
    async getPlayerProfile(playerId: string): Promise<PlayerProfile> {
      const body = await authenticatedGet<{ player: PlayerProfile }>(
        `/profile/players/${playerId}`
      )
      return body.player
    }
  },

  news: {
    async getPreview() {
      const [pinned, recent] = await Promise.all([fetchNews(4, true), fetchNews(4)])
      const pinnedIds = new Set(pinned.map(({ id }) => id))
      return [...pinned, ...recent.filter(({ id }) => !pinnedIds.has(id))].slice(0, 2)
    },
    getAll() {
      return fetchNews(20)
    }
  },

  operations: {
    async getActive(): Promise<Operation | null> {
      const body = await requestJson<{ operation: Operation | null }>('/operations/active')
      return body.operation
    },
    async getMine(): Promise<OperationSnapshot> {
      return authenticatedGet('/operations/me')
    },
    async markViewed(
      operationId: string,
      viewedPoints: number
    ): Promise<OperationViewedResult> {
      return jsonPost(`/operations/${operationId}/view`, { viewedPoints })
    }
  },

  redeemCodes: {
    async redeem(code: string): Promise<RedeemCodeResponse> {
      try {
        const result = await jsonPost<{
          code: string
          pointsGranted: number
          points: number
          skinId: string | null
          skinGranted: boolean
        }>('/redeem-codes/redeem', { code: code.trim() })
        return { ok: true, result }
      } catch (error) {
        const codeValue = (error as Error & { code?: string }).code
        const known = [
          'UNAUTHORIZED',
          'INVALID_CODE',
          'CODE_NOT_FOUND',
          'CODE_EXPIRED',
          'CODE_LIMIT_REACHED',
          'CODE_ALREADY_REDEEMED',
          'INTERNAL_ERROR'
        ] as const
        const errorCode = known.includes(codeValue as (typeof known)[number])
          ? (codeValue as (typeof known)[number])
          : 'INTERNAL_ERROR'
        return { ok: false, error: errorCode, message: error instanceof Error ? error.message : 'Could not redeem the code.' }
      }
    }
  },

  skins,

  models: {
    async read(relativePath: string): Promise<ArrayBuffer> {
      const normalized = relativePath.replace(/\\/g, '/').replace(/^models\//i, '')
      if (normalized.startsWith('lobby/')) {
        const file = normalized.slice('lobby/'.length)
        if (!/^[a-z0-9_]+\.mdl$/i.test(file)) throw new Error('Invalid lobby model.')
        return requestArrayBuffer(`/pwa/lobby-models/${encodeURIComponent(file)}`)
      }

      const stockPlayer = normalized.match(
        /^player\/(arctic|gign|gsg9|guerilla|leet|sas|terror|urban)\/\1\.mdl$/i
      )
      if (stockPlayer) {
        return requestArrayBuffer(
          `/pwa/lobby-models/${encodeURIComponent(stockPlayer[1].toLowerCase() + '_lobby.mdl')}`
        )
      }

      if (/^p_[a-z0-9_]+\.mdl$/i.test(normalized)) {
        return requestArrayBuffer(
          '/skins/assets/file?path=' +
            encodeURIComponent('models/16competitive/system/p_null.mdl'),
          { authenticated: true }
        )
      }

      const key = relativePath.replace(/\\/g, '/').startsWith('models/')
        ? relativePath.replace(/\\/g, '/')
        : `models/${normalized}`
      return requestArrayBuffer(`/skins/assets/file?path=${encodeURIComponent(key)}`, {
        authenticated: true
      })
    },
    async readThumbnail(cacheKey: string) {
      const cached = thumbnailCache.get(cacheKey)
      return cached ? cached.slice(0) : null
    },
    async writeThumbnail(cacheKey: string, png: ArrayBuffer) {
      thumbnailCache.set(cacheKey, png.slice(0))
    }
  },

  party,

  updater: {
    async getCurrentVersion() {
      return __SIXTEEN_COMPETITIVE_VERSION__
    },
    async getStatus() {
      return { state: 'idle' }
    },
    async restartAndInstall() {
      window.location.reload()
    },
    onStatus() {
      return () => undefined
    }
  },

  window: {
    async maximize() {
      // Browser window management belongs to the user/browser.
    },
    async focus() {
      window.focus()
    },
    async openCounterStrikeSteamStore() {
      window.location.href = 'steam://store/10'
    },
    async exit() {
      window.location.href = 'https://www.papamo.dev/16competitive'
    }
  },

  diagnosticLogs: {
    async get() {
      return []
    },
    async report(description: string, rendererLogs: string[]) {
      return jsonPost('/auth/issue-reports', {
        description,
        logs: rendererLogs.join('\n').slice(0, 500_000) || '[no renderer logs]',
        clientVersion: 'web'
      })
    }
  }
}

window.api = api
