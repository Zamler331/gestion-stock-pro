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
        locations: cachedLocations || []
      }

    }

    /* ========================= */
    /* LOCATIONS */
    /* ========================= */

    const { data: locations } = await supabase
      .from("locations")
      .select("*")
      .order("name")

    /* ========================= */
    /* VISIBILITÉ */
    /* ========================= */

    const { data: visibility } = await supabase
      .from("product_location_settings")
      .select("product_id, location_id, low_stock_threshold")

    const visibleMap = {}
    const thresholdMap = {}

    visibility?.forEach(v => {

      if (!visibleMap[v.product_id]) {
        visibleMap[v.product_id] = []
      }

      visibleMap[v.product_id].push(v.location_id)

      thresholdMap[`${v.product_id}-${v.location_id}`] =
        v.low_stock_threshold
    })

    const visibleProductIds = Object.keys(visibleMap)

    /* ========================= */
    /* PRODUITS (SOURCE DE VÉRITÉ) */
    /* ========================= */

    const { data: productsData } = await supabase
      .from("products")
      .select(`
        id,
        name,
        packaging,
        categories ( name )
      `)
      .in("id", visibleProductIds)

    const productInfoMap = {}

    productsData?.forEach(p => {
      productInfoMap[p.id] = p
    })

    /* ========================= */
    /* BATCHES */
    /* ========================= */

    const { data: batches, error } = await supabase
      .from("stock_batches")
      .select(`
        quantity,
        location_id,
        product_id,
        expiration_date,
        source_movement_id
      `)
      .in("product_id", visibleProductIds)

    if (error) {
      console.error("Erreur batches:", error)
      return { products: [], locations }
    }

    /* ========================= */
    /* MOVEMENTS */
    /* ========================= */

    const { data: movements } = await supabase
      .from("movements")
      .select("id, effective_date")

    const movementMap = {}

    movements?.forEach(m => {
      movementMap[m.id] = m.effective_date
    })

    /* ========================= */
    /* FILTRAGE */
    /* ========================= */

    const now = new Date()

    const validBatches = (batches || []).filter(b => {

      const notExpired =
        !b.expiration_date ||
        new Date(b.expiration_date) > now

      const effectiveDate = movementMap[b.source_movement_id]

      const isActive =
        !effectiveDate ||
        new Date(effectiveDate) <= now

      return notExpired && isActive
    })

    /* ========================= */
    /* INIT PRODUITS (IMPORTANT) */
    /* ========================= */

    const productsMap = {}

    visibleProductIds.forEach(productId => {

      const info = productInfoMap[productId]

      productsMap[productId] = {
        product_id: productId,
        name: info?.name || "Produit",
        packaging: info?.packaging || null,
        category: info?.categories?.name || "Sans catégorie",
        locations: {}
      }

    })

    /* ========================= */
    /* AGRÉGATION BATCHES */
    /* ========================= */

    validBatches.forEach(batch => {

      const product = productsMap[batch.product_id]

      if (!product) return

      if (!product.locations[batch.location_id]) {
        product.locations[batch.location_id] = {
          quantity: 0,
          threshold:
            thresholdMap[`${batch.product_id}-${batch.location_id}`] ?? 5
        }
      }

      product.locations[batch.location_id].quantity += batch.quantity

    })

    /* ========================= */
    /* AJOUT DES ZÉROS */
    /* ========================= */

    locations.forEach(loc => {

      Object.values(productsMap).forEach(product => {

        if (!product.locations[loc.id]) {
          product.locations[loc.id] = {
            quantity: 0,
            threshold:
              thresholdMap[`${product.product_id}-${loc.id}`] ?? 5
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
    products.forEach(p => tx1.store.put(p))
    await tx1.done

    const tx2 = db.transaction("locations", "readwrite")
    locations.forEach(l => tx2.store.put(l))
    await tx2.done

    return {
      products,
      locations
    }

  } catch (err) {

    console.error("Erreur getGlobalStockView:", err)

    return {
      products: [],
      locations: []
    }

  }
}