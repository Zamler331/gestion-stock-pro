import { getDB } from "./offlineDB"

export async function addToQueue(action) {

  const db = await getDB()

  await db.add("queue", {
    ...action,
    created_at: Date.now()
  })

}