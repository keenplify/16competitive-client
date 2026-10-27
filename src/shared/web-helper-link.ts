export const WEB_HELPER_PROTOCOL = 'competitive16-play'
export const WEB_NATIVE_HELPER_PROTOCOL = 'competitive16-helper'

export interface WebHelperLink {
  apiOrigin: string
  matchId: string
  handoff: string
}

export interface LocalSettingsLink {
  port: number
  token: string
  origin: string
}

export interface WebHelperCheckLink {
  apiOrigin: string
  handoff: string
  localSettings?: LocalSettingsLink
}

const MATCH_ID = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const HANDOFF = /^[A-Za-z0-9_-]{32,128}$/

export function allowedHelperApiOrigin(value: string, development = false): string | null {
  try {
    const url = new URL(value)
    if (url.username || url.password || url.pathname !== '/' || url.search || url.hash) return null
    if (
      development &&
      url.protocol === 'http:' &&
      ['localhost', '127.0.0.1'].includes(url.hostname)
    )
      return url.origin
    if (url.protocol !== 'https:' || url.port) return null
    if (
      url.hostname !== '16competitive.papamo.dev' &&
      !/^[a-z0-9-]+\.16competitive\.papamo\.dev$/.test(url.hostname)
    )
      return null
    return url.origin
  } catch {
    return null
  }
}

export function webHelperLaunchUrl(
  input: WebHelperLink,
  development = false,
  protocol = WEB_HELPER_PROTOCOL
): string {
  const origin = allowedHelperApiOrigin(input.apiOrigin, development)
  if (!origin || !MATCH_ID.test(input.matchId) || !HANDOFF.test(input.handoff))
    throw new Error('Invalid web helper link')
  if (protocol !== WEB_HELPER_PROTOCOL && protocol !== WEB_NATIVE_HELPER_PROTOCOL)
    throw new Error('Invalid web helper protocol')
  const url = new URL(`${protocol}://join/${input.matchId}`)
  url.searchParams.set('api', origin)
  url.searchParams.set('handoff', input.handoff)
  return url.toString()
}

export function webHelperCheckUrl(
  input: WebHelperCheckLink,
  development = false,
  protocol = WEB_HELPER_PROTOCOL
): string {
  const origin = allowedHelperApiOrigin(input.apiOrigin, development)
  if (!origin || !HANDOFF.test(input.handoff)) throw new Error('Invalid web helper check')
  if (protocol !== WEB_HELPER_PROTOCOL && protocol !== WEB_NATIVE_HELPER_PROTOCOL)
    throw new Error('Invalid web helper protocol')
  const url = new URL(`${protocol}://check-setup`)
  if (input.localSettings) {
    const local = input.localSettings
    if (
      protocol !== WEB_NATIVE_HELPER_PROTOCOL ||
      !Number.isInteger(local.port) ||
      local.port < 49152 ||
      local.port > 65535 ||
      !/^[a-f0-9]{64}$/.test(local.token) ||
      !allowedHelperApiOrigin(local.origin, development)
    )
      throw new Error('Invalid local helper settings')
    url.searchParams.set('localPort', String(local.port))
    url.searchParams.set('localToken', local.token)
    url.searchParams.set('webOrigin', local.origin)
  }
  url.searchParams.set('api', origin)
  url.searchParams.set('handoff', input.handoff)
  return url.toString()
}

export function parseWebHelperLink(value: string, development = false): WebHelperLink | null {
  try {
    const url = new URL(value)
    if (
      url.protocol !== `${WEB_HELPER_PROTOCOL}:` ||
      url.hostname !== 'join' ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      [...url.searchParams.keys()].some((key) => key !== 'api' && key !== 'handoff') ||
      url.searchParams.getAll('api').length !== 1 ||
      url.searchParams.getAll('handoff').length !== 1
    )
      return null
    const matchId = url.pathname.slice(1)
    const apiOrigin = allowedHelperApiOrigin(url.searchParams.get('api') ?? '', development)
    const handoff = url.searchParams.get('handoff') ?? ''
    return apiOrigin && MATCH_ID.test(matchId) && HANDOFF.test(handoff)
      ? { apiOrigin, matchId, handoff }
      : null
  } catch {
    return null
  }
}

export function parseWebHelperCheckLink(
  value: string,
  development = false,
  protocol = WEB_HELPER_PROTOCOL
): WebHelperCheckLink | null {
  try {
    const url = new URL(value)
    if (
      (protocol !== WEB_HELPER_PROTOCOL && protocol !== WEB_NATIVE_HELPER_PROTOCOL) ||
      url.protocol !== `${protocol}:` ||
      url.hostname !== 'check-setup' ||
      (url.pathname !== '' && url.pathname !== '/') ||
      url.username ||
      url.password ||
      url.port ||
      url.hash ||
      [...url.searchParams.keys()].some(
        (key) => !['api', 'handoff', 'localPort', 'localToken', 'webOrigin'].includes(key)
      ) ||
      url.searchParams.getAll('api').length !== 1 ||
      url.searchParams.getAll('handoff').length !== 1
    )
      return null
    const apiOrigin = allowedHelperApiOrigin(url.searchParams.get('api') ?? '', development)
    const handoff = url.searchParams.get('handoff') ?? ''
    if (!apiOrigin || !HANDOFF.test(handoff)) return null
    const hasLocal = ['localPort', 'localToken', 'webOrigin'].some((key) =>
      url.searchParams.has(key)
    )
    if (!hasLocal) return { apiOrigin, handoff }
    if (
      protocol !== WEB_NATIVE_HELPER_PROTOCOL ||
      ['localPort', 'localToken', 'webOrigin'].some(
        (key) => url.searchParams.getAll(key).length !== 1
      )
    )
      return null
    const port = Number(url.searchParams.get('localPort'))
    const token = url.searchParams.get('localToken') ?? ''
    const origin = allowedHelperApiOrigin(url.searchParams.get('webOrigin') ?? '', development)
    if (
      !Number.isInteger(port) ||
      port < 49152 ||
      port > 65535 ||
      !/^[a-f0-9]{64}$/.test(token) ||
      !origin
    )
      return null
    return { apiOrigin, handoff, localSettings: { port, token, origin } }
  } catch {
    return null
  }
}
