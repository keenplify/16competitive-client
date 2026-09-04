// Keep local development configurable through .env, but never let a packaged
// launcher silently fall back to a localhost service that is not running on
// the player's machine. Production builds still replace this value at bundle
// time via electron.vite.config.ts.
const DEFAULT_API_BASE_URL = 'https://16competitive.papamo.dev'

export const API_BASE_URL = process.env.API_BASE_URL ?? DEFAULT_API_BASE_URL

export const MATCHMAKING_WS_URL =
  process.env.MATCHMAKING_WS_URL ??
  (() => {
    const url = new URL(API_BASE_URL)
    url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'
    url.pathname = '/matchmaking/ws'
    url.search = ''
    url.hash = ''
    return url.toString()
  })()
