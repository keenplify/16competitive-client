import { requestJson } from './browser-session'

export interface BrowserPushStatus {
  supported: boolean
  available: boolean
  enabled: boolean
  blocked: boolean
}
const supported = (): boolean =>
  window.isSecureContext &&
  'serviceWorker' in navigator &&
  'PushManager' in window &&
  'Notification' in window

async function registration(): Promise<ServiceWorkerRegistration> {
  await navigator.serviceWorker.register('/pwa/sw.js')
  let timer: ReturnType<typeof setTimeout> | undefined
  try {
    return await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error('PUSH_WORKER_UNAVAILABLE')), 10_000)
      })
    ])
  } finally {
    if (timer) clearTimeout(timer)
  }
}

export async function getBrowserPushStatus(): Promise<BrowserPushStatus> {
  if (!supported()) return { supported: false, available: false, enabled: false, blocked: false }
  const config = await requestJson<{ available: boolean; publicKey: string | null }>(
    '/notifications/push/config'
  )
  const worker = await navigator.serviceWorker.getRegistration('/pwa/')
  const subscription = await worker?.pushManager.getSubscription()
  const enabled =
    subscription && Notification.permission === 'granted'
      ? (
          await requestJson<{ enabled: boolean }>('/notifications/push/status', {
            authenticated: true,
            init: { method: 'POST', body: JSON.stringify({ endpoint: subscription.endpoint }) }
          })
        ).enabled === true
      : false
  return {
    supported: true,
    available: config.available === true,
    enabled,
    blocked: Notification.permission === 'denied'
  }
}

export async function enableBrowserPush(language: string): Promise<void> {
  if (!supported() || Notification.permission !== 'granted') throw new Error('PUSH_PERMISSION')
  const config = await requestJson<{ available: boolean; publicKey: string | null }>(
    '/notifications/push/config'
  )
  if (
    !config.available ||
    typeof config.publicKey !== 'string' ||
    !/^[A-Za-z0-9_-]{87}$/.test(config.publicKey)
  )
    throw new Error('PUSH_UNAVAILABLE')
  const worker = await registration()
  const bytes = Uint8Array.from(
    atob(config.publicKey.replace(/-/g, '+').replace(/_/g, '/') + '='),
    (character) => character.charCodeAt(0)
  )
  let subscription = await worker.pushManager.getSubscription()
  // Replace a subscription if the deployment deliberately rotated its VAPID key.
  const oldKey = subscription?.options.applicationServerKey
  if (
    subscription &&
    oldKey &&
    !bytes.every((value, index) => new Uint8Array(oldKey)[index] === value)
  ) {
    await subscription.unsubscribe()
    subscription = null
  }
  subscription ??= await worker.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: bytes
  })
  await requestJson('/notifications/push/subscribe', {
    authenticated: true,
    init: { method: 'POST', body: JSON.stringify({ ...subscription.toJSON(), language }) }
  })
}

export async function disableBrowserPush(): Promise<void> {
  const worker = await navigator.serviceWorker.getRegistration('/pwa/')
  const subscription = await worker?.pushManager.getSubscription()
  if (!subscription) return
  await requestJson('/notifications/push/subscribe', {
    authenticated: true,
    init: { method: 'DELETE', body: JSON.stringify({ endpoint: subscription.endpoint }) }
  })
  await subscription.unsubscribe()
}
