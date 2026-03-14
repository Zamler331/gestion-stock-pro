import { supabase } from "@/lib/supabase"
import { getDB } from "@/lib/offline/offlineDB"

export async function getGlobalStockView() {

  try {

    /* ========================= */
    /* OFFLINE MODE */
    /* ========================= */

    if (!navigator.onLine) {

      console.log("Mode hors connexion → lecture cache")

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

    const { data: locations, error: locationsError } = await supabase
      .from("locations")
      .select("*")
      .order("name")

    if (locationsError) {
      console.error("Erreur locations:", locationsError)
      return { products: [], locations: [] }
    }

    /* ========================= */
    /* VISIBILITÉ PRODUITS */
    /* ========================= */

    const { data: visibility, error: visError } = await supabase
      .from("product_location_settings")
      .select("product_id")

    if (visError) {
      console.error("Erreur visibilité:", visError)
      return { products: [], locations }
    }

    const visibleProductIds = visibility?.map(v => v.product_id) || []


    /* ========================= */
    /* STOCKS */
    /* ========================= */

    const { data: stocks, error: stocksError } = await supabase
      .from("stocks")
      .select(`
        quantity,
        location_id,
        product_id,
        products:product_id (
          id,
          name,
          packaging,
          category_id,
          categories (
            name
          )
        )
      `)
      .in("product_id", visibleProductIds)

    if (stocksError) {
      console.error("Erreur stocks:", stocksError)
      return { products: [], locations }
    }

    /* ========================= */
    /* THRESHOLD MAP */
    /* ========================= */

    const thresholdMap = {}

    visibility?.forEach(v => {
      thresholdMap[`${v.product_id}-${v.location_id}`] =
        v.low_stock_threshold
    })

    /* ========================= */
    /* PIVOT PRODUCTS */
    /* ========================= */

    const productsMap = {}

    stocks?.forEach(stock => {

      if (!stock.products) return

      if (!productsMap[stock.product_id]) {

        productsMap[stock.product_id] = {
          product_id: stock.product_id,
          name: stock.products.name,
          packaging: stock.products.packaging || null,
          category: stock.products?.categories?.name || "Sans catégorie",
          locations: {}
        }

      }

      const key = `${stock.product_id}-${stock.location_id}`

      productsMap[stock.product_id].locations[stock.location_id] = {
        quantity: stock.quantity,
        threshold: thresholdMap[key] ?? null
      }

    })

    const products = Object.values(productsMap)

    /* ========================= */
    /* SAVE CACHE OFFLINE */
    /* ========================= */

    const db = await getDB()

    const tx1 = db.transaction("stocks", "readwrite")

    products.forEach(product => {
      tx1.store.put(product)
    })

    await tx1.done

    const tx2 = db.transaction("locations", "readwrite")

    locations.forEach(location => {
      tx2.store.put(location)
    })

    await tx2.done

    console.log("Cache offline mis à jour")

    /* ========================= */
    /* RETURN ONLINE DATA */
    /* ========================= */

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
