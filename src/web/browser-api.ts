import { partnerAssetPath } from './partner-runtime'
import { loadBrowserCommunityDirectory } from './partner-community-context'
import { saveBrowserCrosshair } from './crosshair-settings'
import { loadCustomGameList } from '../shared/custom-game-list'
import {
  parseCommunityJoin,
  parseCommunityLeave,
  parseCommunityOwnerSettings,
  validateCommunityJoin,
  validateCommunityUpdate,
  communityUpdateBody,
  validateServerImageUpload,
  parseServerImageUpload
} from '../shared/community-directory'
import { parsePartnerLaunchTicket, partnerLaunchArguments } from '../shared/partner-launch'
import { isPlayerProfile } from '../shared/player-profile-validation'
import {
  parseCommunityTransfer,
  parseCommunityDecision,
  parseServerLink,
  validateCommunityDecision,
  validateServerLinkCode
} from '../shared/community-membership'
import {
  parsePartnerLaunchGroup,
  parsePartnerPresence,
  parsePartnerServerStatuses
} from '../shared/partner-community'
import {
  parseCommunityHistory,
  parseCommunityMessage,
  parseCommunityMembers,
  communityMembersPath
} from '../shared/partner-community'
import { getBrowserPartnerId } from './partner-attribution'
import { DEFAULT_PLAYER_PING_KEY } from '../shared/player-ping'
import {
  onNativeDiscordJoin,
  nativeHelperSettings,
  readNativeModel,
  nativeDeviceStatus,
  nativeNextClient,
  onNativeInstallerProgress,
  cancelNativeInstaller,
  onNativeAssetSync,
  nativeAssetStatus,
  syncNativeAssets,
  nativeDiagnosticLogs,
  launchPartnerWithNativeHelper
} from './local-play'
import type { NativeHelperSettings } from '../shared/native-helper-settings'
import type { DailyQuestSnapshot } from '../shared/daily-quests'
import type { FriendChatMessage, FriendSearchResult, FriendsSnapshot } from '../shared/friends'
import type { GameSettings, SkinAssetSyncProgress } from '../shared/game-settings'
import { DEFAULT_CROSSHAIR, parseNativeCrosshairConfig } from '../shared/crosshair'
import type {
  FeaturedRankedLadder,
  LeaderboardEntry,
  TopMmrLeaderboard
} from '../shared/leaderboard'
import type {
  MatchHistoryEntry,
  MatchSummary,
  MatchSurveyStatus,
  MatchSurveySubmission,
  PendingMatchSurvey,
  PlayerProfile
} from '../shared/match-history'
import { parseNewsVisibility, type NewsPost } from '../shared/news'
import type { Operation, OperationSnapshot, OperationViewedResult } from '../shared/operations'
import type {
  Party,
  PartyInvitationResponse,
  PartyLeaveResponse,
  PendingPartyInvitation,
  SentPartyInvitation
} from '../shared/party'
import type { RedeemCodeResponse } from '../shared/redeem-codes'
import type { CustomGameChatMessage, CustomGameRoom, CustomGamesApi } from '../shared/custom-games'
import { isCustomGameChatMessage } from '../shared/custom-games'
import { parsePartnerBranding } from '../shared/partner-branding'
import {
  parsePaymentOrder,
  parseManualOrder,
  validateTransferDetails,
  parsePaymentSnapshot,
  validatePaymentAmount,
  validatePaymentId
} from '../shared/payments'
import type {
  LobbyLoadout,
  OwnedSkin,
  Skin,
  SkinCurrency,
  SkinGift,
  SkinGiftChoice,
  SkinResaleQuote,
  SkinResaleResult,
  UnlockResult
} from '../shared/skins'
import bundledAwpModelUrl from '../../resources/web-models/p_awp.mdl?url'
import bundledDeagleModelUrl from '../../resources/web-models/p_deagle.mdl?url'
import bundledMp5ModelUrl from '../../resources/web-models/p_mp5.mdl?url'
import bundledM4a1ModelUrl from '../../resources/web-models/p_m4a1.mdl?url'
import bundledAk47ModelUrl from '../../resources/web-models/p_ak47.mdl?url'
import { browserAuthApi } from './browser-auth'
import { browserMatchmakingApi, browserPartyRealtime, navigateToNode } from './browser-matchmaking'
import {
  currentApiOrigin,
  getWebSessionToken,
  requestArrayBuffer,
  requestJson
} from './browser-session'

const runtimeWindow = window as Window & { __SIXTEEN_COMPETITIVE_WEB__?: boolean }
runtimeWindow.__SIXTEEN_COMPETITIVE_WEB__ = true

const PTT_KEYS_KEY = '16competitive.web.ptt-keys'
const thumbnailCache = new Map<string, ArrayBuffer>()

const bundledModels: Record<string, string> = {
  'p_ak47.mdl': bundledAk47ModelUrl,
  'p_m4a1.mdl': bundledM4a1ModelUrl,
  'p_awp.mdl': bundledAwpModelUrl,
  'p_deagle.mdl': bundledDeagleModelUrl,
  'p_mp5.mdl': bundledMp5ModelUrl
}
const previewPaths = new Map<string, string>()
let previewAccount: string | null = null
const rememberPreviewPaths = (items: Skin[]): void => {
  const token = getWebSessionToken()
  if (previewAccount !== token) {
    previewPaths.clear()
    previewAccount = token
  }
  for (const skin of items)
    if (skin.playerModelPath) previewPaths.set(skin.id, skin.playerModelPath)
}

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
    display: { resolution: 'current', widescreen: true },
    currentDisplayResolution: { width: 1920, height: 1080 },
    cs16ExecutablePath: 'steam://run/10',
    cs16FolderPath: null,
    configFilePath: 'Browser / Steam',
    voicePttKey: team,
    voicePttKeys: [team, party],
    playerPingKey: DEFAULT_PLAYER_PING_KEY,
    crosshair: DEFAULT_CROSSHAIR,
    nextClientDetected: false,
    nextClientIntegrationEnabled: false,
    nextClientIntegrationDisabledReason: null,
    fastSwitchEnabled: true,
    fastSwitchManaged: false,
    lightweightHud: false,
    killCardsEnabled: false,
    setupCompleted: true,
    setupMode: null,
    clientType: 'steam',
    platform: 'other'
  }
}

const authenticatedGet = <T>(path: string): Promise<T> =>
  requestJson<T>(path, { authenticated: true })

let lastHelperSettings: { accountToken: string | null; settings: GameSettings } | null = null

function helperGameSettings(settings: NativeHelperSettings): GameSettings {
  const result: GameSettings = {
    ...browserSettings(),
    cs16FolderPath: settings.cs16FolderPath,
    platform: settings.platform,
    cs16ExecutablePath: settings.cs16FolderPath,
    display: settings.display,
    currentDisplayResolution: settings.currentDisplayResolution,
    playerPingKey: settings.playerPingKey,
    voicePttKeys: settings.voicePttKeys,
    voicePttKey: settings.voicePttKeys[0],
    crosshair: settings.crosshairConfig
      ? parseNativeCrosshairConfig(settings.crosshairConfig)
      : DEFAULT_CROSSHAIR,
    nextClientIntegrationEnabled: settings.enhancementsEnabled,
    nextClientDetected: settings.nextClientDetected,
    fastSwitchEnabled: settings.fastSwitchEnabled,
    fastSwitchManaged: true,
    lightweightHud: settings.lightweightHud,
    killCardsEnabled: settings.killCardsEnabled
  }
  lastHelperSettings = { accountToken: getWebSessionToken(), settings: result }
  return result
}

async function saveHelperPreferences(update: Partial<NativeHelperSettings>): Promise<GameSettings> {
  const current = await nativeHelperSettings({ action: 'get' })
  const values = { ...current, ...update }
  const settings = {
    display: values.display,
    currentDisplayResolution: values.currentDisplayResolution,
    fastSwitchEnabled: values.fastSwitchEnabled,
    enhancementsEnabled: values.enhancementsEnabled,
    lightweightHud: values.lightweightHud,
    killCardsEnabled: values.killCardsEnabled,
    crosshairConfig: values.crosshairConfig,
    playerPingKey: values.playerPingKey,
    voicePttKeys: values.voicePttKeys
  }
  return helperGameSettings(await nativeHelperSettings({ action: 'save', settings }))
}

const jsonPost = <T>(path: string, body?: unknown): Promise<T> =>
  requestJson<T>(path, {
    authenticated: true,
    init: {
      method: 'POST',
      ...(body === undefined ? {} : { body: JSON.stringify(body) })
    }
  })

const customGames: CustomGamesApi = {
  async list(selectedNodeId) {
    const nodes = await browserMatchmakingApi.getNodes()
    return loadCustomGameList(nodes, selectedNodeId, async (node) => {
      const result = await requestJson<{ rooms: CustomGameRoom[] }>('/custom-games', {
        authenticated: true,
        baseUrl: node.publicApiUrl,
        clearOnUnauthorized: false
      })
      return result.rooms
    })
  },
  async mine(host) {
    return (
      await requestJson<{ room: CustomGameRoom | null }>('/custom-games/mine', {
        authenticated: true,
        baseUrl: host
      })
    ).room
  },
  async getChatHistory(roomId, host) {
    const result = await requestJson<{ messages: CustomGameChatMessage[] }>(
      `/custom-games/${encodeURIComponent(roomId)}/messages`,
      { authenticated: true, baseUrl: host }
    )
    if (
      !Array.isArray(result.messages) ||
      !result.messages.every((entry) => isCustomGameChatMessage(entry) && entry.roomId === roomId)
    ) {
      throw new Error('The custom game server returned invalid chat messages')
    }
    return result.messages
  },
  async sendChatMessage(roomId, message, host) {
    const result = await requestJson<{ message: CustomGameChatMessage }>(
      `/custom-games/${encodeURIComponent(roomId)}/messages`,
      {
        authenticated: true,
        baseUrl: host,
        init: { method: 'POST', body: JSON.stringify({ message }) }
      }
    )
    if (!isCustomGameChatMessage(result.message) || result.message.roomId !== roomId) {
      throw new Error('The custom game server returned an invalid chat message')
    }
    return result.message
  },
  async create(settings) {
    const [nodes, preferences] = await Promise.all([
      browserMatchmakingApi.getNodes(),
      browserMatchmakingApi.getPreferences()
    ])
    const available = nodes.filter((node) => node.available)
    const latency = (node: (typeof nodes)[number]): number =>
      typeof node.latencyMs === 'number' && Number.isFinite(node.latencyMs)
        ? node.latencyMs
        : Infinity
    const target = preferences.selectedNodeId
      ? available.find((node) => node.id === preferences.selectedNodeId)
      : available.sort((left, right) => latency(left) - latency(right))[0]
    if (!target) throw new Error('No custom game server is available for your selection.')
    const result = await requestJson<{ room: CustomGameRoom }>('/custom-games', {
      authenticated: true,
      baseUrl: target.publicApiUrl,
      init: { method: 'POST', body: JSON.stringify(settings) }
    })
    if (new URL(target.publicApiUrl).origin !== window.location.origin) {
      await navigateToNode(target.publicApiUrl, preferences.selectedNodeId)
    }
    return result.room
  },
  async update(roomId, settings, host) {
    return (
      await requestJson<{ room: CustomGameRoom }>(`/custom-games/${encodeURIComponent(roomId)}`, {
        authenticated: true,
        baseUrl: host,
        init: { method: 'PATCH', body: JSON.stringify(settings) }
      })
    ).room
  },
  async join(roomId, password, host) {
    const result = await requestJson<{ room: CustomGameRoom }>(
      `/custom-games/${encodeURIComponent(roomId)}/join`,
      {
        authenticated: true,
        baseUrl: host,
        init: { method: 'POST', body: JSON.stringify({ password }) }
      }
    )
    if (host && new URL(host).origin !== window.location.origin) {
      const preferences = await browserMatchmakingApi.getPreferences()
      await navigateToNode(host, preferences.selectedNodeId)
    }
    return result.room
  },
  async leave(roomId, host) {
    return (
      await requestJson<{ room: CustomGameRoom | null }>(
        `/custom-games/${encodeURIComponent(roomId)}/leave`,
        { authenticated: true, baseUrl: host, init: { method: 'POST' } }
      )
    ).room
  },
  async start(roomId, host) {
    return (
      await requestJson<{ room: CustomGameRoom }>(
        `/custom-games/${encodeURIComponent(roomId)}/start`,
        {
          authenticated: true,
          baseUrl: host,
          init: { method: 'POST' }
        }
      )
    ).room
  },
  async addBot(roomId, host) {
    return (
      await requestJson<{ room: CustomGameRoom }>(
        `/custom-games/${encodeURIComponent(roomId)}/bots`,
        {
          authenticated: true,
          baseUrl: host,
          init: { method: 'POST' }
        }
      )
    ).room
  },
  async setTeamCapacity(roomId, team, capacity, host) {
    return (
      await requestJson<{ room: CustomGameRoom }>(
        `/custom-games/${encodeURIComponent(roomId)}/team-capacity`,
        {
          authenticated: true,
          baseUrl: host,
          init: { method: 'PATCH', body: JSON.stringify({ team, capacity }) }
        }
      )
    ).room
  },
  async moveMember(roomId, playerId, team, host) {
    return (
      await requestJson<{ room: CustomGameRoom }>(
        `/custom-games/${encodeURIComponent(roomId)}/members/${encodeURIComponent(playerId)}/team`,
        {
          authenticated: true,
          baseUrl: host,
          init: { method: 'PATCH', body: JSON.stringify({ team }) }
        }
      )
    ).room
  },
  async moveServer(roomId, targetNodeId, host) {
    return (
      await requestJson<{ room: CustomGameRoom }>(
        `/custom-games/${encodeURIComponent(roomId)}/move`,
        {
          authenticated: true,
          baseUrl: host,
          init: { method: 'POST', body: JSON.stringify({ targetNodeId }) }
        }
      )
    ).room
  },
  async kick(roomId, playerId, host) {
    return (
      await requestJson<{ room: CustomGameRoom | null }>(
        `/custom-games/${encodeURIComponent(roomId)}/members/${encodeURIComponent(playerId)}`,
        { authenticated: true, baseUrl: host, init: { method: 'DELETE' } }
      )
    ).room
  }
}

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
    const body = await jsonPost<{ message: FriendChatMessage }>(`/friends/${playerId}/messages`, {
      message: message.trim()
    })
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
  onDiscordJoinResult: onNativeDiscordJoin
}

const skins = {
  async payments() {
    return parsePaymentSnapshot(await authenticatedGet('/payments/p-cash'))
  },
  async createManualPayment(requestId: string, methodId: string, amount: number) {
    return parseManualOrder(
      await requestJson('/payments/manual', {
        authenticated: true,
        init: {
          method: 'POST',
          body: JSON.stringify({
            requestId: validatePaymentId(requestId),
            methodId: validatePaymentId(methodId),
            amount: validatePaymentAmount(amount)
          })
        }
      })
    )
  },
  async submitManualPayment(id: string, senderName: string, reference: string) {
    return parseManualOrder(
      await requestJson(`/payments/manual/${validatePaymentId(id)}/submit`, {
        authenticated: true,
        init: {
          method: 'POST',
          body: JSON.stringify(validateTransferDetails(senderName, reference))
        }
      })
    )
  },
  async cancelManualPayment(id: string) {
    return parseManualOrder(
      await requestJson(`/payments/manual/${validatePaymentId(id)}/cancel`, {
        authenticated: true,
        init: { method: 'POST' }
      })
    )
  },
  async createPayment(requestId: string, amount: number) {
    // Reserve the tab during the user's click, before awaiting the API (popup blockers).
    const checkout = window.open('about:blank', '_blank')
    if (checkout) checkout.opener = null
    try {
      const order = parsePaymentOrder(
        await requestJson('/payments/p-cash', {
          authenticated: true,
          timeoutMs: 25_000,
          init: {
            method: 'POST',
            body: JSON.stringify({
              requestId: validatePaymentId(requestId),
              amount: validatePaymentAmount(amount)
            })
          }
        })
      )
      if (order.checkoutUrl && checkout && !checkout.closed)
        checkout.location.replace(order.checkoutUrl)
      else checkout?.close()
      return order
    } catch (error) {
      checkout?.close()
      throw error
    }
  },
  async refreshPayment(id: string) {
    return parsePaymentSnapshot(
      await requestJson(`/payments/p-cash/${validatePaymentId(id)}/refresh`, {
        authenticated: true,
        timeoutMs: 25_000,
        init: { method: 'POST' }
      })
    )
  },
  async list(weaponKey?: string): Promise<Skin[]> {
    const data = await authenticatedGet<Skin[]>('/skins/store')
    rememberPreviewPaths(data)
    return weaponKey ? data.filter((skin) => skin.weaponKey === weaponKey) : data
  },
  async mine(): Promise<OwnedSkin[]> {
    const items = await authenticatedGet<OwnedSkin[]>('/skins/mine')
    rememberPreviewPaths(items.map((item) => item.skin))
    return items
  },
  resaleQuote(skinId: string): Promise<SkinResaleQuote> {
    return authenticatedGet(`/skins/${encodeURIComponent(skinId)}/resale-quote`)
  },
  sell(skinId: string, quote: SkinResaleQuote): Promise<SkinResaleResult> {
    return jsonPost(`/skins/${encodeURIComponent(skinId)}/sell`, {
      currency: quote.currency,
      payout: quote.payout
    })
  },
  async setCharacter(team, model): Promise<void> {
    await jsonPost('/skins/character', { team, model })
  },
  getLobbyLoadout(): Promise<LobbyLoadout> {
    return authenticatedGet('/skins/lobby-loadout')
  },
  async unlock(skinId: string, currency: SkinCurrency): Promise<UnlockResult> {
    const path =
      currency === 'P_CASH' ? `/skins/${skinId}/unlock-p-cash` : `/skins/${skinId}/unlock`
    const body = await jsonPost<Record<string, unknown>>(path)
    return { ...body, currency } as unknown as UnlockResult
  },
  async equip(skinId: string): Promise<void> {
    await jsonPost(`/skins/${skinId}/equip`)
  },
  async unequip(skinId: string): Promise<void> {
    await jsonPost(`/skins/${skinId}/unequip`)
  },
  async previewModel(skinId: string): Promise<ArrayBuffer> {
    const path = previewAccount === getWebSessionToken() ? previewPaths.get(skinId) : undefined
    const local = path ? await readNativeModel(path) : null
    if (local) return local
    return requestArrayBuffer(`/skins/${skinId}/preview-model`, {
      authenticated: true
    })
  },
  async previewExplosionSprite(skinId: string): Promise<ArrayBuffer | null> {
    try {
      return await requestArrayBuffer(`/skins/${skinId}/preview-explosion-sprite`, {
        authenticated: true
      })
    } catch (error) {
      if (error instanceof Error && error.message === 'Request failed (404)') return null
      throw error
    }
  },
  async setLobbyWeapon(): Promise<void> {
    throw new Error('Lobby weapon selection is only available in the desktop app.')
  },
  async setLobbyWeaponKey(): Promise<void> {
    throw new Error('Lobby weapon selection is only available in the desktop app.')
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
    url: typeof item.url === 'string' ? item.url : 'https://mastodon.social/@16competitive',
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
  communityDirectory: {
    leave: async (expectedCommunityId) => {
      validateCommunityJoin(expectedCommunityId, null)
      return parseCommunityLeave(
        await jsonPost('/partners/communities/leave', { expectedCommunityId })
      )
    },
    list: loadBrowserCommunityDirectory,
    update: async (input) => {
      validateCommunityUpdate(input)
      await requestJson('/partners/branding/settings', {
        authenticated: true,
        init: {
          method: 'PUT',
          body: JSON.stringify(communityUpdateBody(input))
        }
      })
      return { saved: true }
    },
    ownerSettings: async () =>
      parseCommunityOwnerSettings(await authenticatedGet('/partners/branding/settings')),
    uploadServerImage: async (id, bytes) => {
      validateServerImageUpload(id, bytes)
      const body = new FormData()
      body.set('file', new Blob([new Uint8Array(bytes)]), 'server-image')
      return parseServerImageUpload(
        await requestJson(`/partners/branding/servers/${id}/image`, {
          authenticated: true,
          init: { method: 'POST', body },
          timeoutMs: 30_000
        })
      )
    },
    join: async (id, expectedCommunityId) => {
      validateCommunityJoin(id, expectedCommunityId)
      const result = parseCommunityJoin(
        await jsonPost(`/partners/communities/${id}/join`, { expectedCommunityId })
      )
      if (result.communityId !== id) throw new Error('INVALID_COMMUNITY_JOIN')
      return result
    }
  },
  communityMembership: {
    async pending() {
      return parseCommunityTransfer(await authenticatedGet('/partners/community/transfer'))
    },
    async decide(id, accept) {
      validateCommunityDecision(id, accept)
      return parseCommunityDecision(
        await jsonPost('/partners/community/transfer', { requestId: id, accept })
      )
    },
    async linkServer(code) {
      validateServerLinkCode(code)
      return parseServerLink(await jsonPost('/partners/plugin/link', { code }))
    }
  },
  communityChat: {
    members: async (page, communityId) =>
      parseCommunityMembers(await authenticatedGet(communityMembersPath(page, communityId))),
    kickMember: async (communityId, playerId) => {
      validateCommunityJoin(communityId, null)
      validateCommunityJoin(playerId, null)
      const result = await requestJson<{ removed?: unknown }>(
        `/admin/communities/${communityId}/members/${playerId}`,
        { authenticated: true, init: { method: 'DELETE' } }
      )
      if (result?.removed !== true) throw new Error('COMMUNITY_KICK_FAILED')
      return { removed: true as const }
    },
    history: async () => parseCommunityHistory(await authenticatedGet('/partners/community/chat')),
    send: async (communityId, message) =>
      parseCommunityMessage(await jsonPost('/partners/community/chat', { communityId, message }))
  },
  partnerServers: {
    async list(communityId) {
      if (communityId !== undefined) validateCommunityJoin(communityId, null)
      return parsePartnerServerStatuses(
        await authenticatedGet(
          `/partners/community/servers${communityId ? `?communityId=${communityId}` : ''}`
        )
      )
    },
    async connect(id, groupId, communityId) {
      const group = groupId
        ? parsePartnerLaunchGroup(await authenticatedGet(`/partners/launch/${groupId}`))
        : null
      const servers = group ? [] : await this.list(communityId)
      const server =
        group?.server.id === id
          ? group.server
          : servers.find((row) => row.id === id && row.online !== false)
      if (!server) throw new Error('INVALID_SERVER')
      if (server.gameVersion === 'cs13') {
        await launchPartnerWithNativeHelper(id, groupId, communityId)
        return
      }
      const ticket = parsePartnerLaunchTicket(
        await jsonPost(`/partners/servers/${id}/launch-ticket`, {})
      )
      const args = partnerLaunchArguments(server.host, server.port, ticket).join(' ')
      if (group) await jsonPost(`/partners/launch/${group.id}/launched`, {})
      window.location.href = `steam://run/10//${encodeURIComponent(args)}/`
    },
    async startGroup(serverId) {
      return parsePartnerLaunchGroup(
        await jsonPost(`/partners/servers/${serverId}/party-launch`, {})
      )
    },
    async pendingGroup() {
      const response = await authenticatedGet('/partners/launch/pending')
      return response === null ? null : parsePartnerLaunchGroup(response)
    },
    async getGroup(groupId) {
      return parsePartnerLaunchGroup(await authenticatedGet(`/partners/launch/${groupId}`))
    },
    async respondGroup(groupId, accepted) {
      return parsePartnerLaunchGroup(
        await jsonPost(`/partners/launch/${groupId}/response`, { accepted })
      )
    },
    async markLaunched(groupId) {
      await jsonPost(`/partners/launch/${groupId}/launched`, {})
    },
    async presence() {
      const response = await authenticatedGet('/partners/play/presence')
      return response === null ? null : parsePartnerPresence(response)
    }
  },
  partnerBranding: {
    async getJoined() {
      const token = getWebSessionToken()
      if (!token) return { branding: null }
      const result = await authenticatedGet('/partners/branding/me')
      if (getWebSessionToken() !== token) throw new Error('Session changed.')
      return parsePartnerBranding(result, currentApiOrigin())
    },
    async get() {
      const token = getWebSessionToken()
      const partnerId = getBrowserPartnerId()
      if (!token && !partnerId) return { branding: null }
      // A partner PWA link chooses the presentation context, independently of
      // account affiliation. Only the backend can approve membership changes.
      const response: unknown = partnerId
        ? await requestJson(`/partners/branding/public/${partnerId}`)
        : await authenticatedGet('/partners/branding/me')
      if (getWebSessionToken() !== token) throw new Error('Session changed.')
      return parsePartnerBranding(response, currentApiOrigin())
    }
  },
  customGames,

  antiCheat: {
    async getDeviceStatus() {
      // The browser has no privileged hardware fingerprint. Account/server bans
      // remain enforced by authenticated backend endpoints and matchmaking.
      return nativeDeviceStatus()
    }
  },

  dailyQuests: {
    get(): Promise<DailyQuestSnapshot> {
      return authenticatedGet('/daily-quests')
    }
  },

  friends,

  legacyGame: {
    async openDownload() {
      return { ok: false, error: 'unsupportedPlatform' }
    },
    async get() {
      return { ok: false, error: 'unsupportedPlatform' }
    },
    async choose() {
      return { ok: false, error: 'unsupportedPlatform' }
    },
    async launch() {
      return { ok: false, error: 'unsupportedPlatform' }
    }
  },

  gameSettings: {
    async setDisplay(display) {
      return saveHelperPreferences({ display })
    },
    async get() {
      let local: NativeHelperSettings | null = null
      let settings: GameSettings
      try {
        local = await nativeHelperSettings({ action: 'get' })
        settings = helperGameSettings(local)
      } catch {
        // A stopped/blocked helper must not erase the folder just selected in
        // this account's session. Readiness still gates competitive actions.
        settings = {
          ...(lastHelperSettings?.accountToken === getWebSessionToken()
            ? lastHelperSettings.settings
            : browserSettings())
        }
      }
      try {
        const profile = await requestJson<{ profile: string | null }>('/auth/crosshair', {
          authenticated: true
        })
        settings.crosshair = profile.profile
          ? parseNativeCrosshairConfig(profile.profile)
          : DEFAULT_CROSSHAIR
        if (local && profile.profile && local.crosshairConfig?.trim() !== profile.profile.trim()) {
          try {
            const synced = await saveHelperPreferences({ crosshairConfig: `${profile.profile}\n` })
            return { ...synced, crosshair: settings.crosshair }
          } catch {
            // Account profile remains usable even if the helper has stopped.
          }
        }
      } catch {
        // Keep the helper's local profile when the account API is unavailable.
      }
      return settings
    },
    async chooseFolder() {
      return (await nativeHelperSettings({ action: 'choose', game: 'cs16' })).cs16FolderPath
    },
    async installNextClient() {
      await nativeNextClient(true)
    },
    async cancelNextClientInstall() {
      await cancelNativeInstaller()
    },
    async detectNextClient() {
      return nativeNextClient(false)
    },
    onNextClientInstallProgress: onNativeInstallerProgress,
    async save(folderPath) {
      return helperGameSettings(
        await nativeHelperSettings({ action: 'select', game: 'cs16', folderPath })
      )
    },
    async setVoicePttKey(key) {
      const [team, partyKey] = getPttKeys()
      const next: [string, string] = key.startsWith('party:')
        ? [team, key.slice('party:'.length)]
        : [key, partyKey]
      if (next[0].toLowerCase() === next[1].toLowerCase()) {
        throw new Error('Team and Party talk need different push-to-talk keys.')
      }
      const settings = await saveHelperPreferences({ voicePttKeys: next })
      localStorage.setItem(PTT_KEYS_KEY, JSON.stringify(next))
      return settings
    },
    async setCrosshair(profile) {
      return saveBrowserCrosshair(
        profile,
        (config) =>
          requestJson('/auth/crosshair', {
            authenticated: true,
            init: { method: 'PUT', body: JSON.stringify({ profile: config }) }
          }),
        (config) => saveHelperPreferences({ crosshairConfig: config }),
        browserSettings
      )
    },
    async setNextClientIntegration(enabled) {
      return saveHelperPreferences({ enhancementsEnabled: enabled })
    },
    async completeSetup() {
      throw new Error('Game setup requires the desktop launcher.')
    },
    async setPlayerPingKey(key) {
      return saveHelperPreferences({ playerPingKey: key })
    },
    async setFastSwitch(enabled) {
      return saveHelperPreferences({ fastSwitchEnabled: enabled })
    },
    async setLightweightHud(enabled) {
      return saveHelperPreferences({ lightweightHud: enabled })
    },
    async setKillCards(enabled) {
      return saveHelperPreferences({ killCardsEnabled: enabled })
    },
    async getAssetSyncStatus(): Promise<SkinAssetSyncProgress> {
      return nativeAssetStatus()
    },
    async syncAssets(mode) {
      await syncNativeAssets(mode)
    },
    onAssetSyncProgress: onNativeAssetSync
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
    },
    getFeaturedLadder(): Promise<FeaturedRankedLadder> {
      return requestJson('/leaderboard/featured-ladder')
    }
  },

  matchmaking: browserMatchmakingApi,

  matchHistory: {
    async get(): Promise<MatchHistoryEntry[]> {
      const body = await authenticatedGet<{ matches: MatchHistoryEntry[] }>('/profile/matches')
      return body.matches
    },
    async getSummary(matchId: string): Promise<MatchSummary> {
      const body = await authenticatedGet<{ match: MatchSummary }>(`/profile/matches/${matchId}`)
      return body.match
    },
    async getPlayerProfile(playerId: string): Promise<PlayerProfile> {
      const body = await authenticatedGet<{ player: PlayerProfile }>(`/profile/players/${playerId}`)
      if (!isPlayerProfile(body.player)) throw new Error('Invalid player profile')
      return body.player
    },
    async getSurvey(matchId: string): Promise<MatchSurveyStatus> {
      return authenticatedGet<MatchSurveyStatus>(`/profile/matches/${matchId}/survey`)
    },
    async getPendingSurvey(): Promise<PendingMatchSurvey | null> {
      const body = await authenticatedGet<{ match: PendingMatchSurvey | null }>(
        '/profile/matches/pending-survey'
      )
      return body.match
    },
    async submitSurvey(
      matchId: string,
      funRating: number,
      fairnessRating: number,
      comment?: string
    ): Promise<MatchSurveySubmission> {
      return jsonPost<MatchSurveySubmission>(`/profile/matches/${matchId}/survey`, {
        funRating,
        fairnessRating,
        comment: comment?.trim()
      })
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
    },
    async getVisibility() {
      return parseNewsVisibility(await requestJson('/news/visibility'))
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
    async markViewed(operationId: string, viewedPoints: number): Promise<OperationViewedResult> {
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
          pCashGranted?: number
          pCash?: number | null
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
        return {
          ok: false,
          error: errorCode,
          message: error instanceof Error ? error.message : 'Could not redeem the code.'
        }
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
        return requestArrayBuffer(partnerAssetPath(`lobby-models/${encodeURIComponent(file)}`), {
          baseUrl: window.location.origin
        })
      }
      const native = await readNativeModel(normalized)
      if (native) return native

      const stockPlayer = normalized.match(
        /^player\/(arctic|gign|gsg9|guerilla|leet|sas|terror|urban)\/\1\.mdl$/i
      )
      if (stockPlayer) {
        return requestArrayBuffer(
          partnerAssetPath(
            `lobby-models/${encodeURIComponent(stockPlayer[1].toLowerCase() + '_lobby.mdl')}`
          ),
          { baseUrl: window.location.origin }
        )
      }

      const bundled = bundledModels[normalized.toLowerCase()]
      if (bundled) {
        const response = await fetch(bundled)
        if (!response.ok) throw new Error('Bundled weapon model is unavailable.')
        return response.arrayBuffer()
      }
      if (/^p_[a-z0-9_]+\.mdl$/i.test(normalized)) {
        throw new Error('This stock weapon model is unavailable in the browser.')
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
    async checkAfterGameAtLobby() {
      return
    },
    async restartAndInstall() {
      window.location.reload()
    },
    async retry() {
      window.location.reload()
    },
    async openDownload() {
      const partnerId = getBrowserPartnerId()
      if (partnerId) {
        const response = await requestJson<{ branding: { desktopAppEnabled?: boolean } | null }>(
          `/partners/branding/public/${partnerId}`
        )
        if (response.branding?.desktopAppEnabled === false) return
        const platform = /Linux/i.test(navigator.userAgent) ? 'linux' : 'windows'
        window.open(
          new URL(
            `/partners/download/${platform}?partnerId=${partnerId}`,
            currentApiOrigin()
          ).toString(),
          '_blank',
          'noopener,noreferrer'
        )
        return
      }
      window.open(
        'https://github.com/keenplify/16competitive-client/releases/latest',
        '_blank',
        'noopener,noreferrer'
      )
    },
    async rendererReady() {
      return
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
    async report(description: string, rendererLogs: string[], matchId?: string) {
      const helperLogs = await nativeDiagnosticLogs(matchId).catch(
        () => '[Native helper diagnostics] Unavailable; reconnect the helper to include game logs.'
      )
      return jsonPost('/auth/issue-reports', {
        description,
        ...(matchId ? { matchId } : {}),
        logs: `${rendererLogs.join('\n').slice(-300_000) || '[no renderer logs]'}\n\n${helperLogs}`,
        clientVersion: 'web'
      })
    }
  }
}

window.api = api
