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
  const actions = data.actions || []

  event.waitUntil(
    self.registration.showNotification(data.title || 'Vekoo', {
      body: data.body,
      icon: data.icon || '/pwa-192x192.png',
      badge: data.badge || '/pwa-badge-96x96.png',
      image: data.image,
      tag: data.tag || 'vekoo',
      data: {
        url: HOME,
        timestamp: Date.now(),
        ...data.data,
        // O navegador só guarda `action` e `title` dos botões: o destino de cada um
        // precisa viajar em `data` para chegar ao clique.
        actionUrls: Object.fromEntries(actions.map((item) => [item.action, item.urlPath])),
      },
      actions,
      requireInteraction: data.requireInteraction || false,
      silent: data.silent || false,
      vibrate: data.vibrate || (isMobile ? [300, 100, 300] : [200, 100, 200]),
      renotify: true,
    })
  )
})

/** `/a/<hashid>/...`: a organização da aba. O link do aviso já vem com a de quem recebe. */
function accountPrefix(url) {
  const match = new URL(url).pathname.match(/^\/a\/[^/]+\//)
  return match ? match[0] : null
}

/**
 * Foca uma janela do app e leva para o destino; sem janela, abre uma. Cada aba trabalha numa
 * organização: com o destino numa organização, só serve a aba que já está nela, para o clique
 * não arrancar outra aba da organização dela.
 */
async function openTarget(target) {
  const windows = await self.clients.matchAll({ type: 'window', includeUncontrolled: true })
  const prefix = accountPrefix(target)
  const client = windows.find(
    (candidate) =>
      candidate.url.startsWith(HOME) &&
      'focus' in candidate &&
      (!prefix || accountPrefix(candidate.url) === prefix)
  )

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
  if (event.action === 'close' || event.action === 'dismiss') return

  const data = event.notification.data || {}
  const url = data.actionUrls?.[event.action] || data.url || HOME
  event.waitUntil(openTarget(new URL(url, self.location.origin).href))
})
