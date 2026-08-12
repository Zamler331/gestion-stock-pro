import { adjustStockLevel } from "@/lib/services/atomicStockService"

export async function executeStockCorrection({
  productId,
  locationId,
  newQuantity,
  reason
}) {

  if (!reason) {
    throw new Error("Motif obligatoire")
  }

  if (newQuantity < 0) {
    throw new Error("Quantité invalide")
  }

  await adjustStockLevel({
    productId,
    locationId,
    targetQuantity: newQuantity,
    annotation: `Correction : ${reason}`,
  })
}
