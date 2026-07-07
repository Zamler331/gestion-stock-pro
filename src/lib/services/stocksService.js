import { supabase } from "@/lib/supabase"
import { getDB } from "@/lib/offline/offlineDB"

export async function getGlobalStockView() {
  try {
    if (!navigator.onLine) {
      const db = await getDB()

      const cachedProducts = await db.getAll("stocks")
      const cachedLocations = await db.getAll("locations")

      return {
        products: cachedProducts || [],
        locations: cachedLocations || [],
      }
    }

    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("*")
      .order("name")

    if (locationsError) {
      console.error("Erreur locations:", locationsError)
      return { products: [], locations: [] }
    }

    const { data: visibility, error: visibilityError } = await supabase
      .from("product_location_settings")
      .select("product_id, location_id")

    if (visibilityError) {
      console.error("Erreur visibilité:", visibilityError)
      return { products: [], locations: locations || [] }
    }

    const visibleMap = {}

    visibility?.forEach((v) => {
      if (!visibleMap[v.product_id]) {
        visibleMap[v.product_id] = []
      }

      visibleMap[v.product_id].push(v.location_id)
    })

    const visibleProductIds = Object.keys(visibleMap)

    if (visibleProductIds.length === 0) {
      return {
        products: [],
        locations: locations || [],
      }
    }

    const { data: productsData, error: productsError } = await supabase
      .from("products")
      .select(`
        id,
        name,
        packaging,
        categories ( name )
      `)
      .in("id", visibleProductIds)

    if (productsError) {
      console.error("Erreur products:", productsError)
      return { products: [], locations: locations || [] }
    }

    const productInfoMap = {}

    productsData?.forEach((product) => {
      productInfoMap[product.id] = product
    })

    const { data: batches, error: batchesError } = await supabase
      .from("stock_batches")
      .select(`
        id,
        quantity,
        location_id,
        product_id,
        expiration_date,
        source_movement_id,
        created_at
      `)
      .in("product_id", visibleProductIds)

    if (batchesError) {
      console.error("Erreur batches:", batchesError)
      return { products: [], locations: locations || [] }
    }

    const now = new Date()

    const validBatches = (batches || []).filter((batch) => {
      const quantity = Number(batch.quantity || 0)

      const notExpired =
        !batch.expiration_date || new Date(batch.expiration_date) > now

      return quantity > 0 && notExpired
    })

    const productsMap = {}

    visibleProductIds.forEach((productId) => {
      const info = productInfoMap[productId]

      productsMap[productId] = {
        product_id: productId,
        name: info?.name || "Produit",
        packaging: info?.packaging || null,
        category: info?.categories?.name || "Sans catégorie",
        locations: {},
      }
    })

    locations?.forEach((location) => {
      Object.values(productsMap).forEach((product) => {
        product.locations[location.id] = {
          quantity: 0,
        }
      })
    })

    validBatches.forEach((batch) => {
      const product = productsMap[batch.product_id]

      if (!product) return

      if (!product.locations[batch.location_id]) {
        product.locations[batch.location_id] = {
          quantity: 0,
        }
      }

      product.locations[batch.location_id].quantity += Number(batch.quantity || 0)
    })

    const products = Object.values(productsMap)

    const db = await getDB()

    const tx1 = db.transaction("stocks", "readwrite")
    products.forEach((product) => tx1.store.put(product))
    await tx1.done

    const tx2 = db.transaction("locations", "readwrite")
    locations?.forEach((location) => tx2.store.put(location))
    await tx2.done

    return {
      products,
      locations: locations || [],
    }
  } catch (err) {
    console.error("Erreur getGlobalStockView:", err)

    return {
      products: [],
      locations: [],
    }
  }
}

export async function adjustStockAtLocation({
  productId,
  locationId,
  newQuantity,
}) {
  if (!productId) {
    throw new Error("Produit requis")
  }

  if (!locationId) {
    throw new Error("Lieu requis")
  }

  if (
    newQuantity === undefined ||
    newQuantity === null ||
    Number(newQuantity) < 0
  ) {
    throw new Error("Quantité invalide")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error("Utilisateur non connecté")

  const targetQty = Number(newQuantity)

  const { data: batches, error: batchesError } = await supabase
    .from("stock_batches")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: true })

  if (batchesError) throw new Error(batchesError.message)

  const now = new Date()

  const validBatches = (batches || []).filter((batch) => {
    const quantity = Number(batch.quantity || 0)

    const notExpired =
      !batch.expiration_date || new Date(batch.expiration_date) > now

    return quantity > 0 && notExpired
  })

  const currentQty = validBatches.reduce(
    (sum, batch) => sum + Number(batch.quantity || 0),
    0
  )

  const diff = targetQty - currentQty

  if (diff === 0) return true

  if (diff < 0) {
    const qtyToRemove = Math.abs(diff)

    const { error: movementError } = await supabase
      .from("movements")
      .insert({
        product_id: productId,
        quantity: qtyToRemove,
        type: "sortie",
        source_location_id: locationId,
        user_id: user.id,
        annotation: "Correction manuelle stock",
      })

    if (movementError) throw new Error(movementError.message)

    let remaining = qtyToRemove

    for (const batch of validBatches) {
      if (remaining <= 0) break

      const batchQty = Number(batch.quantity || 0)

      if (batchQty <= remaining) {
        const { error: deleteError } = await supabase
          .from("stock_batches")
          .delete()
          .eq("id", batch.id)

        if (deleteError) throw new Error(deleteError.message)

        remaining -= batchQty
      } else {
        const { error: updateError } = await supabase
          .from("stock_batches")
          .update({
            quantity: batchQty - remaining,
          })
          .eq("id", batch.id)

        if (updateError) throw new Error(updateError.message)

        remaining = 0
      }
    }
  }

  if (diff > 0) {
    const { data: movement, error: movementError } = await supabase
      .from("movements")
      .insert({
        product_id: productId,
        quantity: diff,
        type: "correction",
        destination_location_id: locationId,
        user_id: user.id,
        annotation: "Correction manuelle stock",
      })
      .select()
      .single()

    if (movementError) throw new Error(movementError.message)
    if (!movement) throw new Error("Impossible de créer le mouvement")

    const { error: batchInsertError } = await supabase
      .from("stock_batches")
      .insert({
        product_id: productId,
        location_id: locationId,
        quantity: diff,
        source_movement_id: movement.id,
      })

    if (batchInsertError) throw new Error(batchInsertError.message)
  }

  return true
}
