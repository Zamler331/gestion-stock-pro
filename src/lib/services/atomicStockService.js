import { supabase } from "@/lib/supabase"

export function createActionId() {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID()
  }

  throw new Error("Ce navigateur ne permet pas de sécuriser cette opération")
}

async function callRpc(name, params) {
  const { data, error } = await supabase.rpc(name, params)

  if (error) {
    throw new Error(error.message || "Erreur de mise à jour du stock")
  }

  return data
}

function actionStorageKey(name, params) {
  const value = `${name}:${JSON.stringify(params)}`
  let hash = 2166136261
  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return `pending-stock-action:${name}:${(hash >>> 0).toString(16)}`
}

async function callIdempotentRpc(name, params, suppliedActionId) {
  let actionId = suppliedActionId
  let storageKey = null

  if (!actionId && typeof window !== "undefined") {
    storageKey = actionStorageKey(name, params)
    actionId = window.sessionStorage.getItem(storageKey)
    if (!actionId) {
      actionId = createActionId()
      window.sessionStorage.setItem(storageKey, actionId)
    }
  }

  actionId ||= createActionId()

  const data = await callRpc(name, { p_action_id: actionId, ...params })
  if (storageKey && window.sessionStorage.getItem(storageKey) === actionId) {
    window.sessionStorage.removeItem(storageKey)
  }
  return data
}

export function recordStockEntry({
  actionId = null,
  productId,
  locationId,
  quantity,
  expirationDate = null,
  effectiveDate = null,
  annotation = null,
  movementType = "entry",
}) {
  return callIdempotentRpc("record_stock_entry", {
    p_product_id: productId,
    p_location_id: locationId,
    p_quantity: Number(quantity),
    p_expiration_date: expirationDate || null,
    p_effective_date: effectiveDate || null,
    p_annotation: annotation || null,
    p_movement_type: movementType,
  }, actionId)
}

export function recordStockExit({
  actionId = null,
  productId,
  locationId,
  quantity,
  annotation = null,
}) {
  return callIdempotentRpc("record_stock_exit", {
    p_product_id: productId,
    p_location_id: locationId,
    p_quantity: Number(quantity),
    p_annotation: annotation || null,
  }, actionId)
}

export function recordStockExits({
  actionId = null,
  locationId,
  exits,
  annotation = "Sortie de stock",
}) {
  return callIdempotentRpc("record_stock_exits", {
    p_location_id: locationId,
    p_exits: exits,
    p_annotation: annotation,
  }, actionId)
}

export function adjustStockLevel({
  actionId = null,
  productId,
  locationId,
  targetQuantity,
  annotation = "Correction manuelle stock",
}) {
  return callIdempotentRpc("adjust_stock_level", {
    p_product_id: productId,
    p_location_id: locationId,
    p_target_quantity: Number(targetQuantity),
    p_annotation: annotation,
  }, actionId)
}

export function adjustStockLevels({
  actionId = null,
  adjustments,
  annotation = "Correction manuelle depuis le stock global",
}) {
  return callIdempotentRpc("adjust_stock_levels", {
    p_adjustments: adjustments,
    p_annotation: annotation,
  }, actionId)
}

export function adjustStockBatch({
  actionId = null,
  batchId,
  targetQuantity,
  annotation = "Correction manuelle lot DLC",
}) {
  return callIdempotentRpc("adjust_stock_batch", {
    p_batch_id: batchId,
    p_target_quantity: Number(targetQuantity),
    p_annotation: annotation,
  }, actionId)
}

export function reconcileStockBatches({
  actionId = null,
  locationId,
  batchTargets = [],
  newBatch = null,
}) {
  return callIdempotentRpc("reconcile_stock_batches", {
    p_location_id: locationId,
    p_batch_targets: batchTargets,
    p_new_batch: newBatch,
  }, actionId)
}

export function transferStock({
  actionId = null,
  productId,
  sourceLocationId,
  destinationLocationId,
  quantity,
  annotation = null,
}) {
  return callIdempotentRpc("transfer_stock", {
    p_product_id: productId,
    p_source_location_id: sourceLocationId,
    p_destination_location_id: destinationLocationId,
    p_quantity: Number(quantity),
    p_annotation: annotation || null,
  }, actionId)
}

export function createOrderAtomic({
  actionId = null,
  destinationLocationId,
  items,
}) {
  return callIdempotentRpc("create_order_atomic", {
    p_destination_location_id: destinationLocationId,
    p_items: items,
  }, actionId)
}

export function submitPoleInventoryAndOrders({
  actionId = null,
  locationId,
  adjustments = [],
  orderGroups = [],
}) {
  return callIdempotentRpc("submit_pole_inventory_and_orders", {
    p_location_id: locationId,
    p_adjustments: adjustments,
    p_order_groups: orderGroups,
  }, actionId)
}

export function setOrderItemPrepared({ itemId, isPrepared, deliveredQuantity }) {
  return callRpc("set_order_item_prepared", {
    p_item_id: itemId,
    p_is_prepared: isPrepared,
    p_quantity_delivered: Number(deliveredQuantity),
  })
}

export function deliverOrderAtomic({
  actionId = null,
  orderId,
  deliveries,
}) {
  return callIdempotentRpc("deliver_order_atomic", {
    p_order_id: orderId,
    p_deliveries: deliveries,
  }, actionId)
}

export function reopenDeliveredOrderAtomic({
  actionId = null,
  orderId,
}) {
  return callIdempotentRpc("reopen_delivered_order_atomic", {
    p_order_id: orderId,
  }, actionId)
}
