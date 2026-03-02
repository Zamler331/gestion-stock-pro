import { supabase } from "@/lib/supabase"

/* ============================= */
/* 📦 Récupérer commandes en attente */
/* ============================= */

export async function getPendingOrders() {

  // 1️⃣ Récupérer commandes pending
  const { data: orders, error: ordersError } = await supabase
    .from("orders")
    .select("*")
    .eq("status", "pending")
    .order("created_at", { ascending: false })

  if (ordersError) {
    console.error("Orders error:", ordersError)
    throw new Error(ordersError.message)
  }

  if (!orders || orders.length === 0) return []

  // 2️⃣ Récupérer order_items
  const orderIds = orders.map(o => o.id)

  const { data: items, error: itemsError } = await supabase
    .from("order_items")
    .select("*")
    .in("order_id", orderIds)

  if (itemsError) {
    console.error("Items error:", itemsError)
    throw new Error(itemsError.message)
  }

  // 3️⃣ Récupérer produits
  const productIds = [...new Set(items.map(i => i.product_id))]

  const { data: products, error: prodError } = await supabase
    .from("products")
    .select("*")
    .in("id", productIds)

  if (prodError) {
    console.error("Products error:", prodError)
    throw new Error(prodError.message)
  }

  // 4️⃣ Récupérer locations
  const locationIds = [...new Set(orders.map(o => o.destination_location_id))]

  const { data: locations, error: locError } = await supabase
    .from("locations")
    .select("*")
    .in("id", locationIds)

  if (locError) {
    console.error("Locations error:", locError)
    throw new Error(locError.message)
  }

  // 5️⃣ Recomposer manuellement
  const result = orders.map(order => ({
    ...order,
    destination: locations.find(l => l.id === order.destination_location_id),
    order_items: items
      .filter(i => i.order_id === order.id)
      .map(i => ({
        ...i,
        products: products.find(p => p.id === i.product_id)
      }))
  }))

  return result
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

    const { data: reserveStock, error: reserveError } = await supabase
      .from("stocks")
      .select("*")
      .eq("product_id", item.product_id)
      .eq("location_id", reserveId)
      .single()

    if (reserveError || !reserveStock) {
      throw new Error(`Stock réserve introuvable pour ${item.products.name}`)
    }

    if (reserveStock.quantity < deliveredQty) {
      throw new Error(`Stock insuffisant pour ${item.products.name}`)
    }

    await supabase
      .from("stocks")
      .update({
        quantity: reserveStock.quantity - deliveredQty
      })
      .eq("id", reserveStock.id)

    const { data: poleStock } = await supabase
      .from("stocks")
      .select("*")
      .eq("product_id", item.product_id)
      .eq("location_id", order.destination_location_id)
      .single()

    await supabase
      .from("stocks")
      .update({
        quantity: poleStock.quantity + deliveredQty
      })
      .eq("id", poleStock.id)

    await supabase.from("movements").insert({
      product_id: item.product_id,
      type: "livraison",
      quantity: deliveredQty,
      source_location_id: reserveId,
      destination_location_id: order.destination_location_id,
      user_id: user.id,
      annotation: `Livraison commande ${order.id}`
    })

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

    if (deliveredQty < item.quantity_ordered) {
      await supabase.from("notifications").insert({
        location_id: order.destination_location_id,
        product_id: item.product_id,
        message: `Livraison partielle : ${deliveredQty}/${item.quantity_ordered} pour ${item.products.name}`,
        read: false
      })
    }
  }

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