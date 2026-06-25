/**
 * Fivefive push service worker. Stays tiny — only handles push and
 * notificationclick. Notification suppression happens when an existing
 * client window is already visible (the player is staring at the game).
 */

self.addEventListener("install", (event) => {
  event.waitUntil(self.skipWaiting());
});
self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("push", (event) => {
  let payload = {};
  try {
    payload = event.data ? event.data.json() : {};
  } catch (e) {
    /* ignore parse errors */
  }

  const title = payload.title || "Fivefive";
  const body = payload.body || "It's your turn!";
  const tag = payload.tag || "sequence-turn";
  const roomCode = payload.roomCode || "";

  event.waitUntil(
    (async () => {
      // If a window is already open and visible, skip the notification —
      // the player can already see the game.
      try {
        const clients = await self.clients.matchAll({
          type: "window",
          includeUncontrolled: true,
        });
        const anyVisible = clients.some(
          (c) => c.visibilityState === "visible",
        );
        if (anyVisible) return;
      } catch (e) {
        /* fall through to show notification */
      }

      await self.registration.showNotification(title, {
        body,
        tag,
        renotify: true,
        requireInteraction: false,
        data: { roomCode },
      });
    })(),
  );
});

self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  const url = "/"; // landing → rejoin via stored session
  event.waitUntil(
    (async () => {
      const clients = await self.clients.matchAll({
        type: "window",
        includeUncontrolled: true,
      });
      // Focus an existing tab if any.
      for (const c of clients) {
        if ("focus" in c) {
          await c.focus();
          return;
        }
      }
      await self.clients.openWindow(url);
    })(),
  );
});
