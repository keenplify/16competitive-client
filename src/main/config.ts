import { app } from 'electron'
import { resolveBackendPolicy } from './backend-policy'

const backend = resolveBackendPolicy({
  packaged: app.isPackaged,
  apiUrl: process.env.API_BASE_URL,
  websocketUrl: process.env.MATCHMAKING_WS_URL
})
export let API_BASE_URL = backend.apiUrl
export let nativeHelperApiUrl: string | null = null

/** A background helper pins every service to the browser's validated region. */
export function setNativeHelperApiUrl(origin: string): void {
  if (!process.argv.includes('--native-helper-runtime')) throw new Error('Invalid runtime')
  const url = new URL(origin)
  if (
    url.origin !== origin ||
    url.username ||
    url.password ||
    !(
      (url.protocol === 'https:' &&
        !url.port &&
        (url.hostname === '16competitive.papamo.dev' ||
          /^[a-z0-9-]+\.16competitive\.papamo\.dev$/.test(url.hostname))) ||
      (LOCAL_DEVELOPMENT &&
        url.protocol === 'http:' &&
        ['localhost', '127.0.0.1'].includes(url.hostname))
    )
  )
    throw new Error('Invalid helper API origin')
  nativeHelperApiUrl = API_BASE_URL = origin
}
export const MATCHMAKING_WS_URL = backend.websocketUrl
export const REQUIRES_SIGNED_HELPER = backend.requiresSignedHelper
export const LOCAL_DEVELOPMENT = backend.localDevelopment

export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim() ?? ''

export const DISCORD_LARGE_IMAGE_KEY = process.env.DISCORD_LARGE_IMAGE_KEY?.trim() || 'logo'

// A path-list override for custom Discord RPC servers. Normal Discord and
// Vesktop/arRPC installs are discovered automatically.
export const DISCORD_IPC_PATH = process.env.DISCORD_IPC_PATH?.trim() ?? ''
