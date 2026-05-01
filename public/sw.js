const CACHE_NAME = "bag-it-app-shell-v1";
const APP_SHELL_URLS = ["/", "/icon.svg"];
const CACHEABLE_PREFIXES = ["/_next/static/"];

self.addEventListener("install", (event) => {
  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => cache.addAll(APP_SHELL_URLS)),
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE_NAME).map((key) => caches.delete(key))),
      ),
  );
});

self.addEventListener("fetch", (event) => {
  const request = event.request;

  if (request.method !== "GET") {
    return;
  }

  const url = new URL(request.url);

  if (url.origin !== self.location.origin) {
    return;
  }

  const isAppShellRequest =
    APP_SHELL_URLS.includes(url.pathname) ||
    CACHEABLE_PREFIXES.some((prefix) => url.pathname.startsWith(prefix));

  if (!isAppShellRequest) {
    return;
  }

  event.respondWith(
    caches.match(request).then((cachedResponse) => {
      if (cachedResponse) {
        return cachedResponse;
      }

      return fetch(request).then((response) => {
        if (!response.ok) {
          return response;
        }

        const responseForCache = response.clone();
        event.waitUntil(
          caches
            .open(CACHE_NAME)
            .then((cache) => cache.put(request, responseForCache)),
        );
        return response;
      });
    }),
  );
});
