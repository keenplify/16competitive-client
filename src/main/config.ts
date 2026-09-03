export const API_BASE_URL = process.env.API_BASE_URL ?? 'http://127.0.0.1:3000'

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
