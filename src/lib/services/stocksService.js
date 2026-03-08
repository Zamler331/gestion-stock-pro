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

    if (stocksError) {
      console.error("Erreur stocks:", stocksError)
      return { products: [], locations }
    }

    /* ========================= */
    /* THRESHOLDS */
    /* ========================= */

    const { data: thresholds, error: thresholdError } = await supabase
      .from("product_location_settings")
      .select("*")

    if (thresholdError) {
      console.error("Erreur thresholds:", thresholdError)
    }

    const thresholdMap = {}

    thresholds?.forEach(t => {
      thresholdMap[`${t.product_id}-${t.location_id}`] =
        t.low_stock_threshold
    })

    /* ========================= */
    /* PIVOT PRODUCTS */
    /* ========================= */

    const productsMap = {}

    stocks?.forEach(stock => {

      if (!productsMap[stock.product_id]) {

        productsMap[stock.product_id] = {
          product_id: stock.product_id,
          name: stock.products?.name,
          packaging: stock.products?.packaging || null,
          category: stock.products?.categories?.name || "Sans catégorie",
          locations: {}
        }

      }

      const key = `${stock.product_id}-${stock.location_id}`

      productsMap[stock.product_id].locations[stock.location_id] = {
        quantity: stock.quantity,
        threshold: thresholdMap[key] ?? 5
      }

    })

    const products = Object.values(productsMap)

    /* ========================= */
    /* SAVE CACHE */
    /* ========================= */

    const db = await getDB()

    const tx1 = db.transaction("stocks", "readwrite")
    products.forEach(p => tx1.store.put(p))
    await tx1.done

    const tx2 = db.transaction("locations", "readwrite")
    locations.forEach(l => tx2.store.put(l))
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