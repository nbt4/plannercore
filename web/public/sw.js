const CACHE_PREFIX = 'plannercore-'
const CACHE_NAME = `${CACHE_PREFIX}shell-v1`
const SCOPE_URL = new URL(self.registration.scope)
const SHELL_URLS = [
  SCOPE_URL.href,
  new URL('manifest.webmanifest', SCOPE_URL).href,
  new URL('app-icons/icon-192.png', SCOPE_URL).href,
  new URL('app-icons/icon-512.png', SCOPE_URL).href,
  new URL('app-icons/icon-maskable-512.png', SCOPE_URL).href,
]

self.addEventListener('install', (event) => {
  event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.addAll(SHELL_URLS)))
  self.skipWaiting()
})

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys().then((names) =>
      Promise.all(
        names
          .filter((name) => name.startsWith(CACHE_PREFIX) && name !== CACHE_NAME)
          .map((name) => caches.delete(name)),
      ),
    ),
  )
  self.clients.claim()
})

self.addEventListener('fetch', (event) => {
  const { request } = event
  if (request.method !== 'GET') return

  const url = new URL(request.url)
  const apiPath = new URL('api/', SCOPE_URL).pathname
  if (url.origin !== SCOPE_URL.origin || url.pathname.startsWith('/api/') || url.pathname.startsWith(apiPath)) return

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(SCOPE_URL.href)))
    return
  }

  const cacheable = new Set(['font', 'image', 'script', 'style'])
  if (!cacheable.has(request.destination) && !url.pathname.endsWith('/manifest.webmanifest')) return

  event.respondWith(
    caches.match(request).then((cached) => {
      const refresh = fetch(request).then((response) => {
        if (response.ok) {
          event.waitUntil(caches.open(CACHE_NAME).then((cache) => cache.put(request, response.clone())))
        }
        return response
      })
      return cached || refresh
    }),
  )
})
