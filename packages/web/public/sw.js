self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('message', (event) => {
  if (event.data?.type === 'timer-done') {
    self.registration.showNotification('Timer done!', {
      body: event.data.label,
      vibrate: [200, 100, 200],
      requireInteraction: true,
    });
  }
});
