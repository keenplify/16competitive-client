export const PARTY_CHANNELS = {
  get: 'party:get',
  getInvitations: 'party:get-invitations',
  invite: 'party:invite',
  respond: 'party:respond',
  leave: 'party:leave',
  sendMessage: 'party:send-message',
  sendGlobalMessage: 'party:send-global-message'
} as const

export interface PartyMember {
  id: string
  username: string
  mmr: number
}

export interface Party {
  id: string
  leaderId: string
  members: PartyMember[]
}

export interface SentPartyInvitation {
  invitationId: string
  partyId: string
  invitedPlayer: Pick<PartyMember, 'id' | 'username'>
}

export interface PendingPartyInvitation {
  id: string
  partyId: string
  inviter: Pick<PartyMember, 'id' | 'username'>
  createdAt: string
}

export interface PartyInvitationResponse {
  accepted: boolean
  partyId: string
}

export interface PartyLeaveResponse {
  disbanded: boolean
}

export type PartyInvitationDecision = 'accept' | 'decline'

export interface PartyApi {
  get(): Promise<Party | null>
  getInvitations(): Promise<PendingPartyInvitation[]>
  invite(username: string): Promise<SentPartyInvitation>
  respond(invitationId: string, decision: PartyInvitationDecision): Promise<PartyInvitationResponse>
  leave(): Promise<PartyLeaveResponse>
  sendMessage(message: string): Promise<void>
  sendGlobalMessage(message: string): Promise<void>
}
