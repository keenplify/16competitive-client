export const FRIEND_CHANNELS = {
  list: 'friends:list',
  search: 'friends:search',
  request: 'friends:request',
  accept: 'friends:accept',
  discard: 'friends:discard',
  remove: 'friends:remove',
  chatHistory: 'friends:chat-history',
  chatSend: 'friends:chat-send',
  announce: 'friends:announce',
  requestAttention: 'friends:request-attention'
} as const

export type FriendPresence = 'ONLINE' | 'IN_GAME' | 'OFFLINE'
export type FriendRelationship = 'NONE' | 'OUTGOING' | 'INCOMING' | 'FRIEND'

export interface FriendPlayer {
  id: string
  username: string
  mmr: number
  profileXp: number
  level: number
  levelTitle: string
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

export interface FriendChatMessage {
  id: string
  sender: { id: string; username: string }
  recipientPlayerId: string
  message: string
  sentAt: string
}

export interface ChatAnnouncement {
  id: string
  sender: { id: string; username: string }
  communityId: string | null
  tag: string
  message: string
  sentAt: string
}

export const isChatAnnouncement = (value: unknown): value is ChatAnnouncement => {
  if (!value || typeof value !== 'object') return false
  const a = value as Record<string, unknown>
  const sender = a.sender as Record<string, unknown> | undefined
  return typeof a.id === 'string' && /^[a-f0-9-]{36}$/.test(a.id) &&
    !!sender && typeof sender.id === 'string' && typeof sender.username === 'string' &&
    (a.communityId === null || typeof a.communityId === 'string') &&
    typeof a.tag === 'string' && a.tag.length <= 256 && typeof a.message === 'string' && a.message.length <= 300 &&
    typeof a.sentAt === 'string' && Number.isFinite(Date.parse(a.sentAt))
}

export interface FriendsApi {
  announce(message: string, requestId: string): Promise<void>
  list(): Promise<FriendsSnapshot>
  search(query: string): Promise<FriendSearchResult[]>
  request(playerId: string): Promise<void>
  accept(requestId: string): Promise<void>
  discard(requestId: string): Promise<void>
  remove(playerId: string): Promise<void>
  getChatHistory(playerId: string): Promise<FriendChatMessage[]>
  sendChatMessage(playerId: string, message: string): Promise<FriendChatMessage>
  requestAttention(): Promise<void>
}
