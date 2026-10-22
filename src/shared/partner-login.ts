export interface PartnerLoginPreview {
  proof: string
  expiresAt: string
  partnerId: string
  partnerName: string
  username: string
  email: string | null
}
export function parsePartnerLoginPreview(value: unknown, partnerId: string): PartnerLoginPreview {
  if (!value || typeof value !== 'object') throw new Error('INVALID_PARTNER_HANDOFF')
  const v = value as Record<string, unknown>
  if (
    typeof v.proof !== 'string' ||
    !/^[A-Za-z0-9_-]{43}$/.test(v.proof) ||
    v.partnerId !== partnerId ||
    typeof v.expiresAt !== 'string' ||
    !Number.isFinite(Date.parse(v.expiresAt)) ||
    Date.parse(v.expiresAt) <= Date.now() ||
    Date.parse(v.expiresAt) > Date.now() + 180_000 ||
    typeof v.partnerName !== 'string' ||
    v.partnerName.length > 128 ||
    typeof v.username !== 'string' ||
    !v.username.trim() ||
    v.username.length > 128 ||
    (v.email !== null && (typeof v.email !== 'string' || v.email.length > 254))
  )
    throw new Error('INVALID_PARTNER_HANDOFF')
  return {
    proof: v.proof,
    expiresAt: v.expiresAt,
    partnerId,
    partnerName: v.partnerName,
    username: v.username,
    email: v.email as string | null
  }
}
