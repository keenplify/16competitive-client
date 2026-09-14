export const FRIEND_CHANNELS = {
  list: 'friends:list',
  search: 'friends:search',
  request: 'friends:request',
  accept: 'friends:accept',
  discard: 'friends:discard',
  remove: 'friends:remove'
} as const

export type FriendPresence = 'ONLINE' | 'IN_GAME' | 'OFFLINE'
export type FriendRelationship = 'NONE' | 'OUTGOING' | 'INCOMING' | 'FRIEND'

export interface FriendPlayer {
  id: string
  username: string
  mmr: number
  presence: FriendPresence
}

export interface FriendSearchResult extends FriendPlayer {
  relationship: FriendRelationship
}

export interface IncomingFriendRequest {
  id: string
  player: Pick<FriendPlayer, 'id' | 'username' | 'mmr'>
  createdAt: string
}

export interface FriendsSnapshot {
  friends: FriendPlayer[]
  incomingRequests: IncomingFriendRequest[]
}

export interface FriendsApi {
  list(): Promise<FriendsSnapshot>
  search(query: string): Promise<FriendSearchResult[]>
  request(playerId: string): Promise<void>
  accept(requestId: string): Promise<void>
  discard(requestId: string): Promise<void>
  remove(playerId: string): Promise<void>
}
