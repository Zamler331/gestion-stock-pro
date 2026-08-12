import { db } from "./localDB"
import { supabase } from "@/lib/supabase"
import {
  createOrderAtomic,
  deliverOrderAtomic,
  recordStockEntry,
  recordStockExit,
  transferStock,
} from "@/lib/services/atomicStockService"

let isSyncing = false
const MAX_RETRY = 3

/* ========================= */
/* SYNC STATUS LISTENERS */
/* ========================= */

let listeners = []

export function subscribeSync(callback) {
  listeners.push(callback)
}

function notifySync(status) {
  listeners.forEach(cb => cb(status))
}

/* ========================= */
/* MAIN SYNC FUNCTION */
/* ========================= */

export async function syncPendingActions() {

  if (!navigator.onLine) {
    notifySync(false)
    return
  }

  // 🔒 Empêcher double lancement
  if (isSyncing) return
  isSyncing = true
  notifySync(true)

  const actions = await db.pendingActions
  .filter(a => a.synced === false && !a.processing)
  .toArray()

// Supprimer les actions invalides
for (const action of actions) {
  if (!action.actionId || !action.type || !action.payload) {
    await db.pendingActions.delete(action.id)
  }
}

  if (!navigator.onLine) {
  isSyncing = false
  notifySync(false)
  return
}

  // Débloquer les actions bloquées
await db.pendingActions
  .filter(action => action.processing === true)
  .modify(action => {
    action.processing = false
  })

  try {

    const actions = await db.pendingActions
  .filter(a => a.synced === false && !a.processing && !a.failed)
  .toArray()

    for (const action of actions) {

      if (action.retryCount >= MAX_RETRY) {
  console.warn("Action marquée en échec définitif", action)

  await db.pendingActions.update(action.id, {
    failed: true,
    processing: false
  })

  continue
}

      try {

        await processAction(action)

        // ✅ Suppression après succès
        await db.pendingActions.delete(action.id)

      } catch (error) {

        console.error("Erreur sync :", error)

        await db.pendingActions.update(action.id, {
          processing: false,
          retryCount: (action.retryCount || 0) + 1,
          lastError: error.message,
          lastAttemptAt: new Date()
        })
      }
    }

  } finally {
    isSyncing = false
    notifySync(false)
  }
}

/* ========================= */
/* PROCESS ACTION */
/* ========================= */

async function processAction(action) {
  const { type, payload, actionId } = action
  if (!actionId) throw new Error("actionId manquant — action invalide")

  switch (type) {
    case "supplier_entry":
      return recordStockEntry({
        actionId,
        productId: payload.product_id,
        locationId: payload.location_id,
        quantity: payload.quantity,
        expirationDate: payload.expiration_date,
        annotation: payload.annotation,
      })
    case "transfer":
      return transferStock({
        actionId,
        productId: payload.product_id,
        sourceLocationId: payload.source_location_id,
        destinationLocationId: payload.destination_location_id,
        quantity: payload.quantity,
        annotation: payload.annotation,
      })
    case "pole_exit":
      return recordStockExit({
        actionId,
        productId: payload.product_id,
        locationId: payload.location_id,
        quantity: payload.quantity,
        annotation: payload.annotation,
      })
    case "create_order":
      return createOrderAtomic({
        actionId,
        destinationLocationId: payload.destination_location_id,
        items: [{
          product_id: payload.product_id,
          quantity_ordered: payload.quantity,
        }],
      })
    case "validate_order": {
      const { data: order, error } = await supabase
        .from("orders")
        .select("id, order_items(id, quantity_ordered)")
        .eq("id", payload.order_id)
        .single()
      if (error) throw error
      return deliverOrderAtomic({
        actionId,
        orderId: order.id,
        deliveries: order.order_items.map((item) => ({
          item_id: item.id,
          reserve_id: payload.source_location_id,
          quantity: item.quantity_ordered,
        })),
      })
    }
    default:
      throw new Error(`Type non géré : ${type}`)
  }
}
