// OpenBoard's service worker. It exists for one job: showing rating-alert
// notifications, which iPhone and iPad only allow from a Home Screen web app
// through a service worker. It does no caching; every page load is live.

self.addEventListener('install', () => self.skipWaiting())
self.addEventListener('activate', (event) => event.waitUntil(self.clients.claim()))

// Tapping a notification opens (or focuses) OpenBoard on the Watching tab.
self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  const target = new URL('/#/watching', self.location.origin).href
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((windows) => {
      const open = windows.find((w) => new URL(w.url).origin === self.location.origin)
      if (open) return open.navigate(target).then((w) => (w ?? open).focus())
      return self.clients.openWindow(target)
    }),
  )
})
