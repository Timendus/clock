const filesToCache = [
  "index.html",
  "index.js",
  "index.css",
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
