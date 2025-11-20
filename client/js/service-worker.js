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

self.addEventListener("install", function (evnt) {
  evnt.waitUntil(
    caches.open("clock").then((cache) => {
      return cache.addAll(filesToCache.map((file) => `./${file}`));
    })
  );
});

// This should, I hope, serve requests from the cache first and then update the
// cache from the network in the background.
self.addEventListener("fetch", function (evnt) {
  evnt.respondWith(
    caches.open("clock").then((cache) => {
      return cache.match(evnt.request).then((cachedResponse) => {
        const fetchedResponse = fetch(evnt.request).then((networkResponse) => {
          cache.put(evnt.request, networkResponse.clone());

          return networkResponse;
        });

        return cachedResponse || fetchedResponse;
      });
    })
  );
});
