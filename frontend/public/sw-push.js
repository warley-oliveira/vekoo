// Push e clique em notificação. Carregado pelo service worker gerado pelo Workbox
// (`importScripts`, em vite.config.ts). O resto do SW, inclusive o SKIP_WAITING do
// "Atualizar agora", é do Workbox.

const HOME = self.registration.scope

self.addEventListener('push', (event) => {
  if (!event.data) return

  let data
  try {
    data = event.data.json()
  } catch {
    data = { body: event.data.text() }
  }

  const isMobile = /Android|iPhone|iPad|iPod/i.test(self.navigator.userAgent || '')

  event.waitUntil(
    self.registration.showNotification(data.title || 'Vekoo', {
      body: data.body,
      icon: data.icon || '/pwa-192x192.png',
      badge: data.badge || '/pwa-badge-96x96.png',
      image: data.image,
      tag: data.tag || 'vekoo',
      data: { url: HOME, timestamp: Date.now(), ...data.data },
      actions: data.actions || [],
      requireInteraction: data.requireInteraction || false,
      silent: data.silent || false,
      vibrate: data.vibrate || (isMobile ? [300, 100, 300] : [200, 100, 200]),
      renotify: true,
    })
  )
})

/** Foca uma janela do app e leva para o destino; sem janela, abre uma. */
async function openTarget(target) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const client = windows.find((candidate) => candidate.url.startsWith(HOME) && 'focus' in candidate)

  if (client && new URL(target).origin === self.location.origin) {
    await client.focus()
    if (client.url === target) return
    try {
      await client.navigate(target)
      return
    } catch {
      // Janela ainda não controlada por este SW (primeira instalação): navigate recusa.
    }
  }
  await self.clients.openWindow(target)
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close()
  if (event.action === 'close') return

  const url = event.notification.data?.url || HOME
  event.waitUntil(openTarget(new URL(url, self.location.origin).href))
})
