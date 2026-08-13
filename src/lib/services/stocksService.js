import { supabase } from "@/lib/supabase"
import { getDB } from "@/lib/offline/offlineDB"
import {
  adjustStockLevel,
  adjustStockLevels,
} from "@/lib/services/atomicStockService"

const PAGE_SIZE = 500

async function fetchAllPages(createQuery) {
  const rows = []
  let from = 0

  while (true) {
    const { data, error } = await createQuery().range(
      from,
      from + PAGE_SIZE - 1
    )

    if (error) throw error

    const page = data || []
    rows.push(...page)

    if (page.length < PAGE_SIZE) break
    from += PAGE_SIZE
  }

  return rows
}

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

    const [locations, visibility] = await Promise.all([
      fetchAllPages(() =>
        supabase
          .from("locations")
          .select("*")
          .order("id", { ascending: true })
      ),
      fetchAllPages(() =>
        supabase
          .from("product_location_settings")
          .select("product_id, location_id")
          .order("product_id", { ascending: true })
          .order("location_id", { ascending: true })
      ),
    ])

    locations.sort((a, b) => a.name.localeCompare(b.name, "fr"))

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

    const [allProductsData, allLevels] = await Promise.all([
      fetchAllPages(() =>
        supabase
          .from("products")
          .select(`
            id,
            name,
            packaging,
            categories ( name )
          `)
          .order("id", { ascending: true })
      ),
      fetchAllPages(() =>
        supabase
          .from("current_stock_levels")
          .select("product_id, location_id, quantity")
          .order("product_id", { ascending: true })
          .order("location_id", { ascending: true })
      ),
    ])

    const visibleProductIdSet = new Set(visibleProductIds)
    const productsData = allProductsData.filter((product) =>
      visibleProductIdSet.has(product.id)
    )

    const productInfoMap = {}

    productsData?.forEach((product) => {
      productInfoMap[product.id] = product
    })

    const levels = allLevels.filter((level) =>
      visibleProductIdSet.has(level.product_id)
    )

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

export async function adjustStocksAtLocations(adjustments) {
  if (!Array.isArray(adjustments) || adjustments.length === 0) {
    throw new Error("Aucune correction à enregistrer")
  }

  const normalizedAdjustments = adjustments.map((adjustment) => {
    const targetQuantity = Number(adjustment.newQuantity)

    if (
      !adjustment.productId ||
      !adjustment.locationId ||
      !Number.isInteger(targetQuantity) ||
      targetQuantity < 0
    ) {
      throw new Error("Correction de stock invalide")
    }

    return {
      product_id: adjustment.productId,
      location_id: adjustment.locationId,
      target_quantity: targetQuantity,
    }
  })

  await adjustStockLevels({ adjustments: normalizedAdjustments })
  return true
}
