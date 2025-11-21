const filesToCache = [
  "index.html",
  "js/index.js",
  "style/index.css",
  "style/full-screen.svg",
  "style/settings.svg",
  "style/faces/dots.png",
  "style/faces/fat numbers.png",
  "style/faces/minimal numbers.png",
  "style/faces/modern numbers.png",
  "style/faces/ns.png",
  "style/faces/quartz.png",
  "style/fonts/fonts.css",
  "style/fonts/oPWc_kRmmu4oQ88oo13o48DHbsqn28eR20vUQCYqe3PZ_7w.woff2",
  "style/fonts/oPWc_kRmmu4oQ88oo13o48DHbsqn28eR20vUQCYqdXPZ.woff2",
  "style/fonts/oPWc_kRmmu4oQ88oo13o48DHbsqn28eR20vUniYqe3PZ_7w.woff2",
  "style/fonts/oPWc_kRmmu4oQ88oo13o48DHbsqn28eR20vUniYqdXPZ.woff2",
  "ping.mp3",
  "sample-schedule.json",
];

// Prefetch everything in the above array and store in the cache on install
self.addEventListener("install", function (evnt) {
  evnt.waitUntil(
    caches.open("clock").then((cache) => {
      return cache.addAll(filesToCache.map((file) => `../${file}`));
    })
  );
});

// This should serve requests from the cache first and then update the cache
// from the network in the background.
self.addEventListener("fetch", function (evnt) {
  if (evnt.request.method !== "GET") {
    return; // Let the browser handle other requests
  }

  evnt.respondWith(
    caches.open("clock").then((cache) => {
      return cache.match(evnt.request).then((cachedResponse) => {
        // cache.match always resolves, with either a response or undefined.

        // Fetch the requested resource in parallel
        const fetchedResponse = fetch(evnt.request)
          .then((networkResponse) => {
            // Cache the network response for the next request
            cache.put(evnt.request, networkResponse.clone());
            return networkResponse;
          })
          // This is probably BS, but ChatGPT thinks this prevents us from
          // throwing too many errors in the console. Kinda hard to validate...
          .catch(() => cachedResponse);

        // Return from cache immediately on cache hit or return the network
        // request promise on cache miss
        return cachedResponse || fetchedResponse;
      });
    })
  );
});
