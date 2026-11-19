/* wacrm service worker — receives Web Push and opens the right chat.
 * Kept dependency-free and cache-free on purpose: it exists only for
 * notifications and installability, so it never serves stale pages. */

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

self.addEventListener('push', (event) => {
  let data = {}
  try {
    data = event.data ? event.data.json() : {}
  } catch {
    data = { title: 'New message', body: event.data ? event.data.text() : '' }
  }
  const title = data.title || 'New message'
  event.waitUntil(
    (async () => {
      // If the CRM is open and on screen, the page shows its own alert
      // (and the open chat is the alert) — don't ring twice. Test pushes
      // always show so "Send test" proves the background path works.
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      const visible = windows.some((c) => c.visibilityState === 'visible')
      if (visible && data.tag !== 'wacrm-test') return
      await self.registration.showNotification(title, buildOptions(data))
    })(),
  )
})

function buildOptions(data) {
  return {
    body: data.body || '',
    icon: '/icons/icon-192.png',
    badge: '/icons/badge-96.png',
    tag: data.tag || undefined,
    renotify: Boolean(data.tag),
    vibrate: [200, 100, 200],
    data: { url: data.url || '/inbox' },
  }
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL(event.notification.data?.url || '/inbox', self.location.origin)
  event.waitUntil(
    (async () => {
      const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
      for (const client of windows) {
        if (new URL(client.url).origin === target.origin) {
          await client.focus()
          if ('navigate' in client) {
            try {
              await client.navigate(target.href)
            } catch {
              /* cross-document navigation can be refused; focus is enough */
            }
          }
          return
        }
      }
      await self.clients.openWindow(target.href)
    })(),
  )
})
