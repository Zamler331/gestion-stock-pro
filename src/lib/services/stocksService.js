import { supabase } from "@/lib/supabase"
import { getDB } from "@/lib/offline/offlineDB"

export async function getGlobalStockView() {
  try {
    /* ========================= */
    /* OFFLINE MODE */
    /* ========================= */

    if (!navigator.onLine) {
      const db = await getDB()

      const cachedProducts = await db.getAll("stocks")
      const cachedLocations = await db.getAll("locations")

      return {
        products: cachedProducts || [],
        locations: cachedLocations || [],
      }
    }

    /* ========================= */
    /* LOCATIONS */
    /* ========================= */

    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("*")
      .order("name")

    if (locationsError) {
      console.error("Erreur locations:", locationsError)
      return { products: [], locations: [] }
    }

    /* ========================= */
    /* VISIBILITÉ */
    /* ========================= */

    const { data: visibility, error: visibilityError } = await supabase
      .from("product_location_settings")
      .select("product_id, location_id, low_stock_threshold")

    if (visibilityError) {
      console.error("Erreur visibilité:", visibilityError)
      return { products: [], locations: locations || [] }
    }

    const visibleMap = {}
    const thresholdMap = {}

    visibility?.forEach((v) => {
      if (!visibleMap[v.product_id]) {
        visibleMap[v.product_id] = []
      }

      visibleMap[v.product_id].push(v.location_id)

      thresholdMap[`${v.product_id}-${v.location_id}`] =
        v.low_stock_threshold
    })

    const visibleProductIds = Object.keys(visibleMap)

    if (visibleProductIds.length === 0) {
      return {
        products: [],
        locations: locations || [],
      }
    }

    /* ========================= */
    /* PRODUITS (SOURCE DE VÉRITÉ) */
    /* ========================= */

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

    productsData?.forEach((p) => {
      productInfoMap[p.id] = p
    })

    /* ========================= */
    /* BATCHES */
    /* ========================= */

    const { data: batches, error: batchesError } = await supabase
      .from("stock_batches")
      .select(`
        quantity,
        location_id,
        product_id,
        expiration_date,
        source_movement_id
      `)
      .in("product_id", visibleProductIds)

    if (batchesError) {
      console.error("Erreur batches:", batchesError)
      return { products: [], locations: locations || [] }
    }

    /* ========================= */
    /* MOVEMENTS */
    /* ========================= */

    const sourceMovementIds = [
      ...new Set((batches || []).map((b) => b.source_movement_id).filter(Boolean)),
    ]

    let movementMap = {}

    if (sourceMovementIds.length > 0) {
      const { data: movements, error: movementsError } = await supabase
        .from("movements")
        .select("id, effective_date")
        .in("id", sourceMovementIds)

      if (movementsError) {
        console.error("Erreur movements:", movementsError)
        return { products: [], locations: locations || [] }
      }

      movements?.forEach((m) => {
        movementMap[m.id] = m.effective_date
      })
    }

    /* ========================= */
    /* FILTRAGE */
    /* ========================= */

    const now = new Date()

    const validBatches = (batches || []).filter((b) => {
      const notExpired =
        !b.expiration_date || new Date(b.expiration_date) > now

      const effectiveDate = movementMap[b.source_movement_id]

      const isActive =
        !effectiveDate || new Date(effectiveDate) <= now

      return notExpired && isActive && Number(b.quantity || 0) > 0
    })

    /* ========================= */
    /* INIT PRODUITS */
    /* ========================= */

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

    /* ========================= */
    /* AGRÉGATION BATCHES */
    /* ========================= */

    validBatches.forEach((batch) => {
      const product = productsMap[batch.product_id]

      if (!product) return

      if (!product.locations[batch.location_id]) {
        product.locations[batch.location_id] = {
          quantity: 0,
          threshold:
            thresholdMap[`${batch.product_id}-${batch.location_id}`] ?? 5,
        }
      }

      product.locations[batch.location_id].quantity += Number(batch.quantity || 0)
    })

    /* ========================= */
    /* AJOUT DES ZÉROS */
    /* ========================= */

    locations?.forEach((loc) => {
      Object.values(productsMap).forEach((product) => {
        if (!product.locations[loc.id]) {
          product.locations[loc.id] = {
            quantity: 0,
            threshold:
              thresholdMap[`${product.product_id}-${loc.id}`] ?? 5,
          }
        }
      })
    })

    const products = Object.values(productsMap)

    /* ========================= */
    /* CACHE OFFLINE */
    /* ========================= */

    const db = await getDB()

    const tx1 = db.transaction("stocks", "readwrite")
    products.forEach((p) => tx1.store.put(p))
    await tx1.done

    const tx2 = db.transaction("locations", "readwrite")
    locations?.forEach((l) => tx2.store.put(l))
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

  if (newQuantity === undefined || newQuantity === null || Number(newQuantity) < 0) {
    throw new Error("Quantité invalide")
  }

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) throw new Error("Utilisateur non connecté")

  const targetQty = Number(newQuantity)

  /* ========================= */
  /* BATCHES DU LIEU */
  /* ========================= */

  const { data: batches, error: batchesError } = await supabase
    .from("stock_batches")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .order("created_at", { ascending: true })

  if (batchesError) throw new Error(batchesError.message)

  const sourceMovementIds = [
    ...new Set((batches || []).map((b) => b.source_movement_id).filter(Boolean)),
  ]

  let movementMap = {}

  if (sourceMovementIds.length > 0) {
    const { data: movements, error: movementsError } = await supabase
      .from("movements")
      .select("id, effective_date")
      .in("id", sourceMovementIds)

    if (movementsError) throw new Error(movementsError.message)

    movements?.forEach((m) => {
      movementMap[m.id] = m.effective_date
    })
  }

  const now = new Date()

  const validBatches = (batches || []).filter((b) => {
    const notExpired =
      !b.expiration_date || new Date(b.expiration_date) > now

    const effectiveDate = movementMap[b.source_movement_id]
    const isActive =
      !effectiveDate || new Date(effectiveDate) <= now

    return notExpired && isActive && Number(b.quantity || 0) > 0
  })

  const currentQty = validBatches.reduce(
    (sum, b) => sum + Number(b.quantity || 0),
    0
  )

  const diff = targetQty - currentQty

  if (diff === 0) return true

  /* ========================= */
  /* SORTIE FIFO */
  /* ========================= */

  if (diff < 0) {
    const qtyToRemove = Math.abs(diff)

    if (currentQty < qtyToRemove) {
      throw new Error("Stock insuffisant")
    }

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

  /* ========================= */
  /* AJOUT / CORRECTION POSITIVE */
  /* ========================= */

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