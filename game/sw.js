// The service worker that lets the game be installed on a phone (per user
// request: the drawing Imágenes/pantalla inicio tower.png as its icon;
// manifest.webmanifest). Registered only over https (main.js), where the
// game is hosted.
//
// Network first: every file comes from the server as it is now, and the
// copy kept here is only for when there's no connection -- this project
// ships updates by changing files, and an old copy served first kept
// browsers running old game code before (see server.js's no-store). The
// home server's game state (/api/...) never goes through the cache.
const CACHE = "tower-defense-v1";

self.addEventListener("install", () => self.skipWaiting());
self.addEventListener("activate", (event) => event.waitUntil(self.clients.claim()));

self.addEventListener("fetch", (event) => {
  const { request } = event;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== self.location.origin || url.pathname.startsWith("/api/")) return;
  event.respondWith(
    fetch(request)
      .then((response) => {
        if (response.ok) {
          const copy = response.clone();
          caches.open(CACHE).then((cache) => cache.put(request, copy));
        }
        return response;
      })
      .catch(() => caches.match(request).then((cached) => cached || Response.error())),
  );
});
