import { getDB } from "./offlineDB"
import {
  createActionId,
  createOrderAtomic,
} from "@/lib/services/atomicStockService"

let syncing = false

export async function syncQueue() {

  if (syncing) return
  syncing = true

  console.log("Synchronisation...")

  try {

    const db = await getDB()
    const actions = await db.getAll("queue")
    const actionKeys = await db.getAllKeys("queue")

    console.log("Queue length:", actions.length)

    for (let index = 0; index < actions.length; index += 1) {
      const action = actions[index]

      if (!action.items || action.items.length === 0) {
        console.warn("Action sans items, skip", action)
        continue
      }

      /* ====================== */
      /* Création commande      */
      /* ====================== */

      try {
        const actionId = action.action_id || createActionId()
        if (!action.action_id) {
          await db.put("queue", { ...action, action_id: actionId }, actionKeys[index])
        }
        const orderId = await createOrderAtomic({
          actionId,
          destinationLocationId: action.destination_location_id,
          items: action.items,
        })
        await db.delete("queue", actionKeys[index])
        console.log("Commande synchronisée:", orderId)
      } catch (error) {
        console.error("Erreur synchronisation commande:", error)
      }

    }

    console.log("Synchronisation de la queue terminée")

  } catch (err) {

    console.error("Erreur syncQueue:", err)

  } finally {

    syncing = false

    window.dispatchEvent(new Event("ordersSynced"))

  }

}
