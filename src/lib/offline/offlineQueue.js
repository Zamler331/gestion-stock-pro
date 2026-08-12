import { getDB } from "./offlineDB"
import { createActionId } from "@/lib/services/atomicStockService"

export async function addToQueue(action) {

  const db = await getDB()

  await db.add("queue", {
    ...action,
    action_id: action.action_id || createActionId(),
    created_at: Date.now()
  })

}
