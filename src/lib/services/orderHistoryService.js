import { supabase } from "@/lib/supabase"

const DEFAULT_HISTORY_LIMIT = 25
const MAX_HISTORY_LIMIT = 100

async function getOrdersByStatus({
  status,
  destinationLocationId = null,
  limit = DEFAULT_HISTORY_LIMIT,
  offset = 0,
}) {
  const safeLimit = Math.min(
    Math.max(Number.parseInt(limit, 10) || DEFAULT_HISTORY_LIMIT, 1),
    MAX_HISTORY_LIMIT
  )

  const safeOffset = Math.max(Number.parseInt(offset, 10) || 0, 0)

  let query = supabase
    .from("orders")
    .select(`
      id,
      created_at,
      validated_at,
      validated_by,
      destination_location_id,
      locations:destination_location_id (
        id,
        name
      ),
      order_items (
        id,
        product_id,
        quantity_ordered,
        quantity_delivered,
        status,
        is_prepared,
        products:product_id (
          id,
          name,
          packaging,
          categories(name)
        )
      )
    `)
    .eq("status", status)
    .order(status === "delivered" ? "validated_at" : "created_at", {
      ascending: false,
    })
    .range(safeOffset, safeOffset + safeLimit)

  if (status === "delivered") {
    query = query.not("validated_at", "is", null)
  }

  if (destinationLocationId) {
    query = query.eq("destination_location_id", destinationLocationId)
  }

  const { data, error } = await query

  if (error) {
    throw new Error(error.message || "Impossible de charger l'historique")
  }

  const rows = data || []

  return {
    orders: rows.slice(0, safeLimit),
    hasMore: rows.length > safeLimit,
  }
}

export function getValidatedOrders(options = {}) {
  return getOrdersByStatus({ ...options, status: "delivered" })
}

export function getPendingOrderHistory(options = {}) {
  return getOrdersByStatus({ ...options, status: "pending" })
}
