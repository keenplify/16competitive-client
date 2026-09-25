import { app } from 'electron'
import { resolveBackendPolicy } from './backend-policy'

const backend = resolveBackendPolicy({
  packaged: app.isPackaged,
  apiUrl: process.env.API_BASE_URL,
  websocketUrl: process.env.MATCHMAKING_WS_URL
})
export const API_BASE_URL = backend.apiUrl
export const MATCHMAKING_WS_URL = backend.websocketUrl
export const REQUIRES_SIGNED_HELPER = backend.requiresSignedHelper
export const LOCAL_DEVELOPMENT = backend.localDevelopment

export const DISCORD_CLIENT_ID = process.env.DISCORD_CLIENT_ID?.trim() ?? ''

export const DISCORD_LARGE_IMAGE_KEY = process.env.DISCORD_LARGE_IMAGE_KEY?.trim() || 'logo'

// A path-list override for custom Discord RPC servers. Normal Discord and
// Vesktop/arRPC installs are discovered automatically.
export const DISCORD_IPC_PATH = process.env.DISCORD_IPC_PATH?.trim() ?? ''
