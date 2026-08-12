import { recordStockEntry } from "@/lib/services/atomicStockService"

export async function createStockEntry({
  product_id,
  location_id,
  quantity,
  expiration_date = null,
  effective_date = null
}) {

  await recordStockEntry({
    productId: product_id,
    locationId: location_id,
    quantity,
    expirationDate: expiration_date,
    effectiveDate: effective_date || new Date().toISOString(),
  })

  return true
}
