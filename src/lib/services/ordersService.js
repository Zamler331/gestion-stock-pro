import { supabase } from "@/lib/supabase"
import { deliverOrderAtomic } from "@/lib/services/atomicStockService"

/* ============================= */
/* 📦 Récupérer commandes en attente */
/* ============================= */

export async function getPendingOrders(locationId) {
  if (!locationId) {
    console.warn("locationId manquant, skip fetchOrders")
    return []
  }

  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(`
      id,
      created_at,
      destination_location_id,
      locations (
        id,
        name
      ),
      order_items (
  id,
  product_id,
  quantity_ordered,
  quantity_delivered,
  is_prepared,
  products:product_id (
    id,
    name,
    packaging,
    categories(name)
  )
)
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  console.log("ORDERS FETCHED:", orders)

  if (ordersError) {
    console.error("Orders error:", ordersError)
    throw new Error(ordersError.message)
  }

  return orders || []
}

/* ============================= */
/* 📦 Récupérer toutes les commandes en attente - Admin */
/* ============================= */

export async function getAllPendingOrders() {
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select(`
      id,
      created_at,
      destination_location_id,
      locations (
        id,
        name
      ),
      order_items (
        id,
        product_id,
        quantity_ordered,
        products:product_id (
          id,
          name,
          packaging,
          categories(name)
        )
      )
    `)
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (ordersError) {
    console.error("Orders admin error:", ordersError)
    throw new Error(ordersError.message)
  }

  return orders || []
}

/* ============================= */
/* 📦 Valider une commande complète */
/* ============================= */

export async function validateFullOrder(
  order,
  reserveId,
  deliveryQuantities
) {
  if (!reserveId) {
    throw new Error("Réserve non sélectionnée")
  }
  const deliveries = order.order_items.map((item) => ({
    item_id: item.id,
    reserve_id: reserveId,
    quantity: Number(deliveryQuantities[item.id] || 0),
  }))

  await deliverOrderAtomic({ orderId: order.id, deliveries })

  return true
}
