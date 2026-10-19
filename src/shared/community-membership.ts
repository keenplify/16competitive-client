export const COMMUNITY_MEMBERSHIP_CHANNELS = {
  pending: 'community:transfer-pending',
  decide: 'community:transfer-decide',
  link: 'community:server-link'
} as const
export interface CommunityTransferRequest {
  id: string
  partnerId: string
  name: string
  currentCommunityId: string
}
export interface CommunityMembershipApi {
  pending(): Promise<CommunityTransferRequest | null>
  decide(requestId: string, accept: boolean): Promise<{ transferred: boolean }>
  linkServer(code: string): Promise<{ linked: true; serverId: string }>
}
const uuid = (value: unknown): value is string =>
  typeof value === 'string' && /^[0-9a-f]{8}-(?:[0-9a-f]{4}-){3}[0-9a-f]{12}$/i.test(value)
export function validateCommunityDecision(id: unknown, accept: unknown): asserts id is string {
  if (!uuid(id) || typeof accept !== 'boolean') throw new Error('INVALID_COMMUNITY_DECISION')
}
export function isServerLinkCode(code: unknown): code is string {
  return typeof code === 'string' && /^(?:[2-9A-HJ-NP-Z]{6}|[A-F0-9]{12})$/i.test(code)
}
export function validateServerLinkCode(code: unknown): asserts code is string {
  if (!isServerLinkCode(code)) throw new Error('INVALID_SERVER_LINK_CODE')
}
export function parseCommunityTransfer(input: unknown): CommunityTransferRequest | null {
  if (!input || typeof input !== 'object' || !('request' in input))
    throw new Error('INVALID_COMMUNITY_TRANSFER')
  const value = (input as { request: unknown }).request
  if (value === null) return null
  if (!value || typeof value !== 'object') throw new Error('INVALID_COMMUNITY_TRANSFER')
  const row = value as Record<string, unknown>
  if (
    !uuid(row.id) ||
    !uuid(row.partnerId) ||
    !uuid(row.currentCommunityId) ||
    typeof row.name !== 'string' ||
    !row.name.trim() ||
    row.name.length > 64 ||
    [...row.name].some((character) => character.charCodeAt(0) < 32)
  )
    throw new Error('INVALID_COMMUNITY_TRANSFER')
  return {
    id: row.id,
    partnerId: row.partnerId,
    currentCommunityId: row.currentCommunityId,
    name: row.name
  }
}
export function parseCommunityDecision(input: unknown): { transferred: boolean } {
  if (
    !input ||
    typeof input !== 'object' ||
    !('transferred' in input) ||
    typeof input.transferred !== 'boolean'
  )
    throw new Error('INVALID_COMMUNITY_DECISION')
  return { transferred: input.transferred }
}
export function parseServerLink(input: unknown): { linked: true; serverId: string } {
  if (
    !input ||
    typeof input !== 'object' ||
    !('linked' in input) ||
    input.linked !== true ||
    !('serverId' in input) ||
    !uuid(input.serverId)
  )
    throw new Error('INVALID_SERVER_LINK')
  return { linked: true, serverId: input.serverId }
}
