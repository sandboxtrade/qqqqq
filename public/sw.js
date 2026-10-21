const CACHE = "vc-shell-0.21.21-photo-path-fix";
const ROOT = new URL("./", self.location.href);
self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(CACHE).then((cache) => cache.addAll([
    ROOT.href, new URL("manifest.webmanifest", ROOT).href,
    new URL("icons/icon-192.png", ROOT).href, new URL("icons/icon-512.png", ROOT).href,
  ])));
  // Let existing tabs finish their session before activating the new shell.
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(
    keys.filter((key) => key.startsWith("vc-shell-") && key !== CACHE).map((key) => caches.delete(key)),
  )));
});
self.addEventListener("fetch", (event) => {
  const request = event.request;
  const url = new URL(request.url);
  if (request.method !== "GET" || url.origin !== ROOT.origin || !url.pathname.startsWith(ROOT.pathname)) return;
  // Ignore runtime config, profiles, Firebase, photo endpoints and all other data.
  const shell = request.mode === "navigate" && url.pathname === ROOT.pathname;
  const asset = url.pathname.startsWith(new URL("assets/", ROOT).pathname) && /\.(js|css)$/.test(url.pathname);
  if (!shell && !asset) return;
  event.respondWith((async () => {
    const cache = await caches.open(CACHE);
    if (asset) {
      const cached = await cache.match(request);
      if (cached) return cached;
    }
    try {
      const response = await fetch(request);
      if (response.ok && response.type !== "opaque") {
        try { await cache.put(shell ? ROOT.href : request, response.clone()); } catch { /* Storage quota must not break a successful network response. */ }
      }
      return response;
    } catch (error) {
      const cached = await cache.match(shell ? ROOT.href : request);
      if (cached) return cached;
      throw error;
    }
  })());
});
