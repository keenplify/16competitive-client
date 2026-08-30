import { API_BASE_URL } from './config'
import { getSessionToken } from './auth'
import type {
  Party,
  PartyInvitationDecision,
  PartyInvitationResponse,
  PartyLeaveResponse,
  PendingPartyInvitation,
  SentPartyInvitation
} from '../shared/party'

const USERNAME_PATTERN = /^[A-Za-z0-9_]{3,32}$/
const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i

const isObject = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null

const isMember = (value: unknown): boolean =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.username === 'string' &&
  typeof value.mmr === 'number'

const isParty = (value: unknown): value is Party =>
  isObject(value) &&
  typeof value.id === 'string' &&
  typeof value.leaderId === 'string' &&
  Array.isArray(value.members) &&
  value.members.length <= 5 &&
  value.members.every(isMember)

const errorMessage = (body: unknown, status: number): string =>
  isObject(body) && typeof body.message === 'string'
    ? body.message
    : `Party request failed (${status})`

const partyRequest = async (path: string, init?: RequestInit): Promise<unknown> => {
  const token = getSessionToken()
  if (!token) throw new Error('Sign in before managing a party')

  let response: Response
  try {
    response = await fetch(`${API_BASE_URL}${path}`, {
      ...init,
      headers: {
        authorization: `Bearer ${token}`,
        ...(init?.body ? { 'content-type': 'application/json' } : {})
      },
      signal: AbortSignal.timeout(10_000)
    })
  } catch (error) {
    if (error instanceof Error && error.name === 'TimeoutError') {
      throw new Error('The party server did not respond in time')
    }
    throw new Error('Could not reach the party server')
  }

  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) throw new Error(errorMessage(body, response.status))
  return body
}

export const getPartyInvitations = async (): Promise<PendingPartyInvitation[]> => {
  const body = await partyRequest('/party/invitations')
  if (
    !isObject(body) ||
    !Array.isArray(body.invitations) ||
    !body.invitations.every(
      (invitation) =>
        isObject(invitation) &&
        typeof invitation.id === 'string' &&
        typeof invitation.partyId === 'string' &&
        typeof invitation.createdAt === 'string' &&
        isObject(invitation.inviter) &&
        typeof invitation.inviter.id === 'string' &&
        typeof invitation.inviter.username === 'string'
    )
  ) {
    throw new Error('The party server returned invalid invitations')
  }
  return body.invitations as PendingPartyInvitation[]
}

export const getParty = async (): Promise<Party | null> => {
  const body = await partyRequest('/party')
  if (!isObject(body) || !(body.party === null || isParty(body.party))) {
    throw new Error('The party server returned an invalid party')
  }
  return body.party
}

export const inviteToParty = async (username: unknown): Promise<SentPartyInvitation> => {
  if (typeof username !== 'string' || !USERNAME_PATTERN.test(username)) {
    throw new Error('Username must be 3–32 characters using letters, numbers, or underscores')
  }
  const body = await partyRequest('/party/invitations', {
    method: 'POST',
    body: JSON.stringify({ username })
  })
  if (
    !isObject(body) ||
    typeof body.invitationId !== 'string' ||
    typeof body.partyId !== 'string' ||
    !isObject(body.invitedPlayer) ||
    typeof body.invitedPlayer.id !== 'string' ||
    typeof body.invitedPlayer.username !== 'string'
  ) {
    throw new Error('The party server returned an invalid invitation')
  }
  return body as unknown as SentPartyInvitation
}

export const respondToPartyInvitation = async (
  invitationId: unknown,
  decision: unknown
): Promise<PartyInvitationResponse> => {
  if (typeof invitationId !== 'string' || !UUID_PATTERN.test(invitationId)) {
    throw new Error('A valid invitation ID is required')
  }
  if (decision !== 'accept' && decision !== 'decline') {
    throw new Error('Invalid invitation response')
  }
  const body = await partyRequest(`/party/invitations/${invitationId}/${decision}`, {
    method: 'POST'
  })
  if (!isObject(body) || typeof body.accepted !== 'boolean' || typeof body.partyId !== 'string') {
    throw new Error('The party server returned an invalid response')
  }
  return body as unknown as PartyInvitationResponse
}

export const leaveParty = async (): Promise<PartyLeaveResponse> => {
  const body = await partyRequest('/party/leave', { method: 'POST' })
  if (!isObject(body) || typeof body.disbanded !== 'boolean') {
    throw new Error('The party server returned an invalid response')
  }
  return body as unknown as PartyLeaveResponse
}

export type { PartyInvitationDecision }
