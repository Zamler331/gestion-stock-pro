import { openDB } from "idb"

let dbPromise = null

export function getDB() {

  if (typeof window === "undefined") {
    return null
  }

  if (!dbPromise) {

    dbPromise = openDB("stock-offline", 1, {
      upgrade(db) {

        if (!db.objectStoreNames.contains("stocks")) {
          db.createObjectStore("stocks", { keyPath: "product_id" })
        }

        if (!db.objectStoreNames.contains("locations")) {
          db.createObjectStore("locations", { keyPath: "id" })
        }

        if (!db.objectStoreNames.contains("queue")) {
          db.createObjectStore("queue", { autoIncrement: true })
        }

      }
    })

  }

  return dbPromise
}