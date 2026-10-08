export const CUSTOM_GAME_CHANNELS = {
  list: 'custom-games:list',
  mine: 'custom-games:mine',
  create: 'custom-games:create',
  update: 'custom-games:update',
  join: 'custom-games:join',
  leave: 'custom-games:leave',
  start: 'custom-games:start',
  addBot: 'custom-games:add-bot',
  setTeamCapacity: 'custom-games:set-team-capacity',
  moveServer: 'custom-games:move-server',
  moveMember: 'custom-games:move-member',
  kick: 'custom-games:kick',
  chatHistory: 'custom-games:chat-history',
  chatSend: 'custom-games:chat-send'
} as const

export const SERVER_CUSTOM_GAME_MODES = [
  '3v3',
  '5v5',
  'unrated',
  'legacy',
  'ffa',
  'fight_yard'
] as const
export type ServerCustomGameMode = (typeof SERVER_CUSTOM_GAME_MODES)[number]

export const isServerCustomGameMode = (value: unknown): value is ServerCustomGameMode =>
  SERVER_CUSTOM_GAME_MODES.some((mode) => mode === value)

export const CUSTOM_GAME_MODES = ['unrated', 'legacy', 'ffa', 'fight_yard'] as const
export type CustomGameMode = (typeof CUSTOM_GAME_MODES)[number]

export const CUSTOM_GAME_MODE_LABELS: Record<CustomGameMode, string> = {
  unrated: 'Unranked',
  legacy: 'Legacy',
  ffa: 'FFA',
  fight_yard: 'Fight Yard'
}

export const isCustomGameMode = (value: unknown): value is CustomGameMode =>
  CUSTOM_GAME_MODES.some((mode) => mode === value)
export type CustomGameState = 'WAITING' | 'READY_CHECK' | 'LIVE' | 'FINISHED'

export interface CustomGameMember {
  id: string
  username: string
  mmr: number
  isBot: boolean
  team: 0 | 1 | 2
}

export interface CustomGameRoom {
  id: string
  ownerId: string
  name: string
  mode: CustomGameMode
  mapId: string
  state: CustomGameState
  maxPlayers: 18
  teamOneCapacity: number
  teamTwoCapacity: number
  hasPassword: boolean
  matchId: string | null
  createdAt: string
  hostNodeId: string
  region: string
  hostApiUrl: string
  members: CustomGameMember[]
}

export interface CustomGameChatMessage {
  id: string
  roomId: string
  sender: { id: string; username: string }
  message: string
  sentAt: string
}

const CHAT_MESSAGE_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

export const isCustomGameChatMessage = (value: unknown): value is CustomGameChatMessage => {
  if (typeof value !== 'object' || value === null) return false
  const entry = value as Record<string, unknown>
  if (typeof entry.sender !== 'object' || entry.sender === null) return false
  const sender = entry.sender as Record<string, unknown>
  return (
    typeof entry.id === 'string' &&
    CHAT_MESSAGE_ID.test(entry.id) &&
    typeof entry.roomId === 'string' &&
    CHAT_MESSAGE_ID.test(entry.roomId) &&
    typeof sender.id === 'string' &&
    typeof sender.username === 'string' &&
    typeof entry.message === 'string' &&
    entry.message.length > 0 &&
    entry.message.length <= 300 &&
    typeof entry.sentAt === 'string' &&
    Number.isFinite(Date.parse(entry.sentAt))
  )
}

export interface CustomGameSettings {
  name: string
  mode: CustomGameMode
  mapId: string
  password?: string
}

export type CustomGameSettingsUpdate = Partial<Omit<CustomGameSettings, 'password'>> & {
  password?: string | null
}

export interface CustomGamesApi {
  list(selectedNodeId?: string | null): Promise<CustomGameRoom[]>
  mine(hostApiUrl?: string): Promise<CustomGameRoom | null>
  create(settings: CustomGameSettings): Promise<CustomGameRoom>
  update(
    roomId: string,
    settings: CustomGameSettingsUpdate,
    hostApiUrl?: string
  ): Promise<CustomGameRoom>
  join(roomId: string, password?: string, hostApiUrl?: string): Promise<CustomGameRoom>
  leave(roomId: string, hostApiUrl?: string): Promise<CustomGameRoom | null>
  start(roomId: string, hostApiUrl?: string): Promise<CustomGameRoom>
  addBot(roomId: string, hostApiUrl?: string): Promise<CustomGameRoom>
  setTeamCapacity(
    roomId: string,
    team: 1 | 2,
    capacity: number,
    hostApiUrl?: string
  ): Promise<CustomGameRoom>
  moveMember(
    roomId: string,
    playerId: string,
    team: 0 | 1 | 2,
    hostApiUrl?: string
  ): Promise<CustomGameRoom>
  moveServer(roomId: string, targetNodeId: string, hostApiUrl?: string): Promise<CustomGameRoom>
  kick(roomId: string, playerId: string, hostApiUrl?: string): Promise<CustomGameRoom | null>
  getChatHistory(roomId: string, hostApiUrl?: string): Promise<CustomGameChatMessage[]>
  sendChatMessage(
    roomId: string,
    message: string,
    hostApiUrl?: string
  ): Promise<CustomGameChatMessage>
}
