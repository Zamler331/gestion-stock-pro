import { recordStockEntry } from "@/lib/services/atomicStockService"

export async function executeSupplierEntry({
  productId,
  locationId,
  quantity,
  annotation = "",
  expirationDate = null,
}) {
  if (!productId) {
    throw new Error("Produit requis")
  }

  if (!locationId) {
    throw new Error("Réserve requise")
  }

  if (!quantity || Number(quantity) <= 0) {
    throw new Error("Quantité invalide")
  }

  await recordStockEntry({
    productId,
    locationId,
    quantity,
    expirationDate,
    annotation: annotation || "Entrée fournisseur",
  })

  return true
}
