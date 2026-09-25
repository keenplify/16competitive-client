export function isLoopbackBackend(value: string): boolean {
  try {
    const url = new URL(value)
    return (
      ['http:', 'https:', 'ws:', 'wss:'].includes(url.protocol) &&
      ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname) &&
      !url.username &&
      !url.password
    )
  } catch {
    return false
  }
}

export function allowsVoiceTransport(
  policy: unknown,
  serverCount: number,
  endpoint: string
): boolean {
  if (!Number.isInteger(serverCount) || serverCount < 0 || serverCount > 4) return false
  if (policy === 'relay') return serverCount >= 1
  return policy === 'all' && isLoopbackBackend(endpoint)
}

export function resolveBackendPolicy(input: {
  packaged: boolean
  apiUrl?: string
  websocketUrl?: string
}): {
  apiUrl: string
  websocketUrl: string
  requiresSignedHelper: boolean
  localDevelopment: boolean
} {
  const api = new URL(
    input.apiUrl || (input.packaged ? 'https://16competitive.papamo.dev' : 'http://127.0.0.1:3000')
  )
  if (
    !['http:', 'https:'].includes(api.protocol) ||
    api.username ||
    api.password ||
    api.pathname !== '/' ||
    api.search ||
    api.hash ||
    (!isLoopbackBackend(api.href) && api.protocol !== 'https:')
  )
    throw new Error('Backend must be an HTTPS origin or a loopback development origin')
  const defaultWs = new URL('/matchmaking/ws', api)
  defaultWs.protocol = api.protocol === 'https:' ? 'wss:' : 'ws:'
  const websocket = new URL(input.websocketUrl || defaultWs.href)
  if (
    !['ws:', 'wss:'].includes(websocket.protocol) ||
    websocket.username ||
    websocket.password ||
    (!isLoopbackBackend(websocket.href) && websocket.protocol !== 'wss:')
  )
    throw new Error('Matchmaking must use WSS or a loopback development socket')
  const localDevelopment =
    !input.packaged && isLoopbackBackend(api.href) && isLoopbackBackend(websocket.href)
  return {
    apiUrl: api.origin,
    websocketUrl: websocket.href,
    requiresSignedHelper: !localDevelopment,
    localDevelopment
  }
}
