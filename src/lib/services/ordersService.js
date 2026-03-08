import { supabase } from "@/lib/supabase"

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
      products (
        id,
        name,
        packaging
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
/* 📦 Valider une commande complète */
/* ============================= */

export async function validateFullOrder(
  order,
  reserveId,
  deliveryQuantities
) {

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    throw new Error("Utilisateur non authentifié")
  }

  if (!reserveId) {
    throw new Error("Réserve non sélectionnée")
  }

  for (const item of order.order_items) {

    const deliveredQty = deliveryQuantities[item.id] || 0

    /* ============================= */
    /* Stock réserve */
    /* ============================= */

    const { data: reserveStock, error: reserveError } = await supabase
      .from("stocks")
      .select("*")
      .eq("product_id", item.product_id)
      .eq("location_id", reserveId)
      .single()

    if (reserveError || !reserveStock) {
      throw new Error(`Stock réserve introuvable pour ${item.products?.name || "produit"}`)
    }

    if (reserveStock.quantity < deliveredQty) {
      throw new Error(`Stock insuffisant pour ${item.products?.name || "produit"}`)
    }

    await supabase
      .from("stocks")
      .update({
        quantity: reserveStock.quantity - deliveredQty
      })
      .eq("id", reserveStock.id)

    /* ============================= */
    /* Stock pôle */
    /* ============================= */

    const { data: poleStock, error: poleError } = await supabase
      .from("stocks")
      .select("*")
      .eq("product_id", item.product_id)
      .eq("location_id", order.destination_location_id)
      .single()

    if (poleError || !poleStock) {
      throw new Error(`Stock pôle introuvable pour ${item.products?.name || "produit"}`)
    }

    await supabase
      .from("stocks")
      .update({
        quantity: poleStock.quantity + deliveredQty
      })
      .eq("id", poleStock.id)

    /* ============================= */
    /* Mouvement de stock */
    /* ============================= */

    await supabase.from("movements").insert({
      product_id: item.product_id,
      type: "livraison",
      quantity: deliveredQty,
      source_location_id: reserveId,
      destination_location_id: order.destination_location_id,
      user_id: user.id,
      annotation: `Livraison commande ${order.id}`
    })

    /* ============================= */
    /* Mise à jour ligne commande */
    /* ============================= */

    await supabase
      .from("order_items")
      .update({
        quantity_delivered: deliveredQty,
        status:
          deliveredQty === 0
            ? "cancelled"
            : deliveredQty < item.quantity_ordered
            ? "partial"
            : "delivered"
      })
      .eq("id", item.id)

    /* ============================= */
    /* Notification livraison partielle */
    /* ============================= */

    if (deliveredQty < item.quantity_ordered) {

      await supabase.from("notifications").insert({
        location_id: order.destination_location_id,
        product_id: item.product_id,
        message: `Livraison partielle : ${deliveredQty}/${item.quantity_ordered} pour ${item.products?.name || "produit"}`,
        read: false
      })

    }
  }

  /* ============================= */
  /* Commande terminée */
  /* ============================= */

  await supabase
    .from("orders")
    .update({
      status: "delivered",
      validated_at: new Date(),
      validated_by: user.id
    })
    .eq("id", order.id)

  return true
}