export interface PartnerUiPage {
  key: string
  html: string
  sha256: string
  width: number
  height: number
}
export interface PartnerUiDisplay {
  connectionId: string
  sequence: number
  key: string | null
  sha256: string | null
  data: string
  expiresAt: string
}
const key = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-z][a-z0-9_]{0,31}$/.test(value)
const hash = (value: unknown): value is string =>
  typeof value === 'string' && /^[a-f0-9]{64}$/.test(value)
export function parsePartnerUiCatalog(value: unknown): PartnerUiPage[] {
  if (
    !value ||
    typeof value !== 'object' ||
    !('pages' in value) ||
    !Array.isArray(value.pages) ||
    value.pages.length > 8
  )
    throw new Error('Invalid partner UI catalog')
  const keys = new Set<string>()
  return value.pages.map((page: unknown) => {
    if (!page || typeof page !== 'object') throw new Error('Invalid UI page')
    const p = page as Record<string, unknown>
    if (
      !key(p.key) ||
      keys.has(p.key) ||
      !hash(p.sha256) ||
      typeof p.html !== 'string' ||
      new TextEncoder().encode(p.html).length > 65536 ||
      !p.html.length ||
      p.html.includes('\0') ||
      !Number.isInteger(p.width) ||
      Number(p.width) < 64 ||
      Number(p.width) > 768 ||
      !Number.isInteger(p.height) ||
      Number(p.height) < 64 ||
      Number(p.height) > 512
    )
      throw new Error('Invalid UI page')
    keys.add(p.key)
    return p as unknown as PartnerUiPage
  })
}
export function parsePartnerUiDisplay(value: unknown, now = Date.now()): PartnerUiDisplay | null {
  if (!value || typeof value !== 'object' || !('state' in value))
    throw new Error('Invalid UI response')
  if (value.state === null) return null
  if (!value.state || typeof value.state !== 'object') throw new Error('Invalid UI state')
  const state = value.state as Record<string, unknown>
  if (
    typeof state.connectionId !== 'string' ||
    !/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i.test(state.connectionId) ||
    !Number.isInteger(state.sequence) ||
    Number(state.sequence) < 1 ||
    Number(state.sequence) > 2147483647 ||
    !(state.key === null || key(state.key)) ||
    !(state.sha256 === null || hash(state.sha256)) ||
    (state.key === null) !== (state.sha256 === null) ||
    typeof state.data !== 'string' ||
    new TextEncoder().encode(state.data).length > 4096 ||
    typeof state.expiresAt !== 'string'
  )
    throw new Error('Invalid UI state')
  const expiry = Date.parse(state.expiresAt)
  if (!Number.isFinite(expiry) || expiry > now + 65000) throw new Error('Invalid UI expiry')
  JSON.parse(state.data)
  return expiry <= now ? null : (state as unknown as PartnerUiDisplay)
}

// Every page is isolated, offline and display-only. An HTML-supplied second CSP
// can further restrict this policy but cannot relax it.
export const PARTNER_UI_CSP =
  "default-src 'none'; script-src 'unsafe-inline'; style-src 'unsafe-inline'; img-src data:; font-src data:; connect-src 'none'; frame-src 'none'; child-src 'none'; worker-src 'none'; object-src 'none'; media-src 'none'; base-uri 'none'; form-action 'none'"
export function partnerUiDocument(html: string): string {
  return (
    '<!doctype html><meta charset="utf-8"><meta http-equiv="Content-Security-Policy" content="' +
    PARTNER_UI_CSP +
    '">' +
    html
  )
}

export interface PartnerUiViewport {
  width: number
  height: number
}
/** Native game viewport, never the launcher's screen/window dimensions. */
export function parsePartnerUiViewport(text: string, now = Date.now()): PartnerUiViewport | null {
  const match = /^v1\n(\d{1,16})\n(\d{1,5})\n(\d{1,5})\n$/.exec(text)
  if (!match) return null
  const [, stamp, w, h] = match.map(Number)
  if (
    !Number.isSafeInteger(stamp) ||
    stamp > now + 250 ||
    now - stamp > 3000 ||
    w < 320 ||
    w > 8192 ||
    h < 160 ||
    h > 8192 ||
    w * h > 35389440
  )
    return null
  return { width: w, height: h }
}
