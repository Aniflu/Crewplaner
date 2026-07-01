// ── Service Worker · Cache-Buster ─────────────────────────────────────────────
// Zweck: behebt DAUERHAFT das „stale Sub-Modul"-Problem. Die ES-Module (js/*.js) werden
// ohne ?v= geladen → der Browser nahm sie sonst aus dem HTTP-Cache, und Fixes kamen erst
// nach manuellem Hard-Reload an. Dieser SW erzwingt für gleich-Origin JS/CSS/HTML eine
// Revalidierung (network-first, cache:'no-cache') → immer der aktuelle Stand.
//
// WICHTIG: Der SW CACHET NICHTS selbst (kein caches.put) → er kann NIEMALS eine alte
// Version „einsperren". Fällt das Netz aus, fällt er auf den normalen Browser-Fetch zurück.
// Die PocketBase-API (api.crewplanner.nyxlightwork.de) ist eine andere Origin und wird
// NICHT angefasst.
//
// KILL-SWITCH (falls je nötig): den Inhalt dieser Datei ersetzen durch
//   self.addEventListener('install',()=>self.skipWaiting());
//   self.addEventListener('activate',e=>e.waitUntil(self.registration.unregister()
//     .then(()=>self.clients.matchAll()).then(cs=>cs.forEach(c=>c.navigate(c.url)))));
// Danach deployen → der SW deinstalliert sich beim nächsten Aufruf selbst.

const SW_VERSION = 'v0.19.0';

self.addEventListener('install', () => self.skipWaiting());
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;

  let url;
  try { url = new URL(req.url); } catch (_) { return; }
  if (url.origin !== self.location.origin) return;   // nur eigene Domain (nicht die PB-API)

  const isNavigation = req.mode === 'navigate';
  const isAsset = /\.(?:js|mjs|css|html)$/i.test(url.pathname);
  if (!isNavigation && !isAsset) return;             // Bilder/Fonts/etc. normal lassen

  // Immer frisch vom Server holen (revalidieren); bei Netzfehler normaler Fetch als Fallback.
  event.respondWith(
    fetch(req, { cache: 'no-cache' }).catch(() => fetch(req))
  );
});
