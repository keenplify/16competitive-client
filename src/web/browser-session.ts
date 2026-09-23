const TOKEN_KEY = '16competitive.web.session'

let sessionToken = localStorage.getItem(TOKEN_KEY)

export const currentApiOrigin = (): string => window.location.origin
export const getWebSessionToken = (): string | null => sessionToken

export const setWebSessionToken = (token: string): void => {
  sessionToken = token
  localStorage.setItem(TOKEN_KEY, token)
}

export const clearWebSessionToken = (): void => {
  sessionToken = null
  localStorage.removeItem(TOKEN_KEY)
}

const consumeHandoff = async (): Promise<void> => {
  const url = new URL(window.location.href)
  const token = url.searchParams.get('handoff')
  if (!token) return

  try {
    const response = await fetch('/auth/web-handoff/consume', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ token }),
      signal: AbortSignal.timeout(10_000)
    })
    const body: unknown = await response.json().catch(() => null)
    if (
      response.ok &&
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).token === 'string'
    ) {
      setWebSessionToken((body as { token: string }).token)
    }
  } finally {
    url.searchParams.delete('handoff')
    history.replaceState({}, '', url.pathname + url.search + url.hash)
  }
}

export const webHandoffReady = consumeHandoff()

export const authenticatedHeaders = (headers?: HeadersInit): Headers => {
  const result = new Headers(headers)
  if (sessionToken) result.set('authorization', `Bearer ${sessionToken}`)
  return result
}

export const requestJson = async <T>(
  path: string,
  options: {
    baseUrl?: string
    authenticated?: boolean
    init?: RequestInit
    timeoutMs?: number
    clearOnUnauthorized?: boolean
  } = {}
): Promise<T> => {
  await webHandoffReady
  const base = options.baseUrl ?? currentApiOrigin()
  const headers = new Headers(options.init?.headers)
  if (options.authenticated) {
    if (!sessionToken) throw new Error('Authentication required')
    headers.set('authorization', `Bearer ${sessionToken}`)
  }
  if (options.init?.body && !headers.has('content-type')) {
    headers.set('content-type', 'application/json')
  }

  const response = await fetch(new URL(path, `${base.replace(/\/$/, '')}/`), {
    ...options.init,
    headers,
    signal: AbortSignal.timeout(options.timeoutMs ?? 10_000)
  })
  const body: unknown = await response.json().catch(() => null)
  if (!response.ok) {
    if (response.status === 401 && options.clearOnUnauthorized !== false) clearWebSessionToken()
    const message =
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).message === 'string'
        ? String((body as Record<string, unknown>).message)
        : typeof body === 'object' &&
            body !== null &&
            typeof (body as Record<string, unknown>).error === 'string'
          ? String((body as Record<string, unknown>).error)
          : `Request failed (${response.status})`
    const error = new Error(message) as Error & { code?: string; status?: number }
    if (
      typeof body === 'object' &&
      body !== null &&
      typeof (body as Record<string, unknown>).error === 'string'
    ) {
      error.code = String((body as Record<string, unknown>).error)
    }
    error.status = response.status
    throw error
  }
  return body as T
}

export const requestArrayBuffer = async (
  path: string,
  options: { baseUrl?: string; authenticated?: boolean; timeoutMs?: number } = {}
): Promise<ArrayBuffer> => {
  await webHandoffReady
  const base = options.baseUrl ?? currentApiOrigin()
  const headers = new Headers()
  if (options.authenticated) {
    if (!sessionToken) throw new Error('Authentication required')
    headers.set('authorization', `Bearer ${sessionToken}`)
  }
  const response = await fetch(new URL(path, `${base.replace(/\/$/, '')}/`), {
    headers,
    signal: AbortSignal.timeout(options.timeoutMs ?? 15_000)
  })
  if (response.status === 401) clearWebSessionToken()
  if (!response.ok) throw new Error(`Request failed (${response.status})`)
  return response.arrayBuffer()
}
