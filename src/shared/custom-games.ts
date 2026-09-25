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
  kick: 'custom-games:kick'
} as const

export type CustomGameMode = 'unrated' | 'ffa'
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
}
