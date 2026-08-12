import { supabase } from "@/lib/supabase"
import { getDB } from "@/lib/offline/offlineDB"
import { adjustStockLevel } from "@/lib/services/atomicStockService"

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

    const { data: levels, error: levelsError } = await supabase
      .from("current_stock_levels")
      .select("product_id, location_id, quantity")
      .in("product_id", visibleProductIds)

    if (levelsError) {
      console.error("Erreur niveaux de stock:", levelsError)
      return { products: [], locations: locations || [] }
    }

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

    ;(levels || []).forEach((level) => {
      const product = productsMap[level.product_id]

      if (!product) return

      if (!product.locations[level.location_id]) {
        product.locations[level.location_id] = {
          quantity: 0,
        }
      }

      product.locations[level.location_id].quantity = Number(level.quantity || 0)
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

  await adjustStockLevel({
    productId,
    locationId,
    targetQuantity: Number(newQuantity),
  })

  return true
}
