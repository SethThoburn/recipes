self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', () => self.clients.claim());

self.addEventListener('message', async (event) => {
  const { type, id, endTime, label } = event.data ?? {};

  if (type === 'timer-start') {
    // TimestampTrigger hands the notification to the OS — fires even when
    // the screen is locked and JS is fully suspended.
    if ('TimestampTrigger' in self) {
      try {
        await self.registration.showNotification('Timer done!', {
          body: label,
          tag: id,
          showTrigger: new TimestampTrigger(endTime),
          requireInteraction: true,
          vibrate: [200, 100, 200],
        });
      } catch {}
    }
    // If TimestampTrigger is unavailable the page fires 'timer-done' instead.
  }

  if (type === 'timer-cancel') {
    const pending = await self.registration.getNotifications({ tag: id });
    pending.forEach((n) => n.close());
  }

  // Fallback fired by the page when TimestampTrigger isn't available
  // and the timer completes while the page is still active.
  if (type === 'timer-done') {
    self.registration.showNotification('Timer done!', {
      body: label,
      requireInteraction: true,
      vibrate: [200, 100, 200],
    });
  }
});
