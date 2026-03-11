const CACHE_NAME = "stock-app-v1"

const urlsToCache = [
  "/",
  "/login",
  "/manifest.json"
]

/* ========================= */
/* INSTALL */
/* ========================= */

self.addEventListener("install", (event) => {

  console.log("SW install")

  event.waitUntil(
    caches.open(CACHE_NAME).then((cache) => {
      return cache.addAll(urlsToCache)
    })
  )

  self.skipWaiting()
})

/* ========================= */
/* ACTIVATE */
/* ========================= */

self.addEventListener("activate", (event) => {

  console.log("SW activate")

  event.waitUntil(

    caches.keys().then((keys) => {

      return Promise.all(

        keys.map((key) => {

          if (key !== CACHE_NAME) {
            return caches.delete(key)
          }

        })

      )

    })

  )

  self.clients.claim()

})

/* ========================= */
/* FETCH */
/* ========================= */

self.addEventListener("fetch", (event) => {

  const request = event.request

  if (request.method !== "GET") return

  event.respondWith(

    fetch(request)
      .then((response) => {

        const responseClone = response.clone()

        caches.open(CACHE_NAME).then((cache) => {
          cache.put(request, responseClone)
        })

        return response

      })

      .catch(() => {
        return caches.match(request)
      })

  )

})