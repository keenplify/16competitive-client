const CACHE = '16competitive-web-v2'
const APP_SHELL = ['/pwa/', '/pwa/site.webmanifest']

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll(APP_SHELL)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key)))
      )
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  if (event.request.method !== 'GET') return
  const url = new URL(event.request.url)
  if (url.origin !== self.location.origin || !url.pathname.startsWith('/pwa/')) return
  if (['token', 'handoff', 'validate-url'].some((key) => url.searchParams.has(key))) return
  event.respondWith(
    fetch(event.request)
      .then((response) => {
        const copy = response.clone()
        void caches.open(CACHE).then((cache) => cache.put(event.request, copy))
        return response
      })
      .catch(() => caches.match(event.request).then((cached) => cached ?? caches.match('/pwa/')))
  )
})

// Push delivery is independent of any open page and carries no login token.
self.addEventListener('push', (event) => {
  event.waitUntil(
    (async () => {
      let data
      try {
        data = event.data?.json()
      } catch {
        return
      }
      if (
        !data ||
        typeof data.title !== 'string' ||
        typeof data.body !== 'string' ||
        typeof data.matchId !== 'string' ||
        !/^[a-f0-9-]{36}$/i.test(data.matchId) ||
        typeof data.deadline !== 'string' ||
        !Number.isFinite(Date.parse(data.deadline)) ||
        Date.parse(data.deadline) <= Date.now()
      )
        return
      await self.registration.showNotification(data.title.slice(0, 128), {
        body: data.body.slice(0, 512),
        tag: `match-ready-${data.matchId}`,
        requireInteraction: true,
        data: { deadline: data.deadline },
        icon: '/pwa/web-app-manifest-192x192.png'
      })
    })()
  )
})

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  event.waitUntil(
    (async () => {
      const pages = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const page = pages.find(
        (client) =>
          new URL(client.url).origin === self.location.origin &&
          new URL(client.url).pathname.startsWith('/pwa/')
      )
      if (page) return page.focus()
      return self.clients.openWindow('/pwa/')
    })()
  )
})
