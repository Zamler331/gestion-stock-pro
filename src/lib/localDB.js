import Dexie from "dexie"

export const db = new Dexie("gestionStockDB")

db.version(4).stores({
  pendingActions: "++id, type, synced, processing, retryCount, createdAt, actionId"
})