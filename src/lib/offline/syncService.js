import { getDB } from "./offlineDB"
import { supabase } from "@/lib/supabase"

let syncing = false

export async function syncQueue() {

  if (syncing) return
  syncing = true

  console.log("Synchronisation...")

  try {

    const db = await getDB()
    const actions = await db.getAll("queue")

    console.log("Queue length:", actions.length)

    for (const action of actions) {

      if (!action.items || action.items.length === 0) {
        console.warn("Action sans items, skip", action)
        continue
      }

      /* ====================== */
      /* Création commande      */
      /* ====================== */

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          destination_location_id: action.destination_location_id,
          status: "pending"
        })
        .select()
        .single()

      if (orderError || !order) {
        console.error("Erreur création commande:", orderError)
        continue
      }

      /* ====================== */
      /* Création items         */
      /* ====================== */

      const items = action.items.map(item => ({
        ...item,
        order_id: order.id
      }))

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(items)

      if (itemsError) {
        console.error("Erreur insertion items:", itemsError)
        continue
      }

      console.log("Commande synchronisée:", order.id)

    }

    /* ====================== */
    /* Vider queue locale     */
    /* ====================== */

    await db.clear("queue")

    console.log("Queue vidée")

  } catch (err) {

    console.error("Erreur syncQueue:", err)

  } finally {

    syncing = false

    window.dispatchEvent(new Event("ordersSynced"))

  }

}