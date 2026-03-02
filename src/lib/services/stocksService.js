import { supabase } from "@/lib/supabase"

export async function getGlobalStockView() {

  // 1️⃣ Tous les lieux
  const { data: locations } = await supabase
    .from("locations")
    .select("*")
    .order("name")

  // 2️⃣ Tous les stocks
  const { data: stocks } = await supabase
    .from("stocks")
    .select(`
      quantity,
      location_id,
      product_id,
      products (
        id,
        name,
        category_id,
        categories (
          name
        )
      )
    `)

  // 3️⃣ Seuils personnalisés
  const { data: thresholds } = await supabase
    .from("product_location_settings")
    .select("*")

  const thresholdMap = {}
  thresholds?.forEach(t => {
    thresholdMap[`${t.product_id}-${t.location_id}`] = t.low_stock_threshold
  })

  // 4️⃣ Transformation pivot
  const formatted = []

  const productsMap = {}

  stocks?.forEach(stock => {

    if (!productsMap[stock.product_id]) {
      productsMap[stock.product_id] = {
        product_id: stock.product_id,
        name: stock.products?.name,
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

  return {
    products: Object.values(productsMap),
    locations
  }
}