import { transferStock } from "@/lib/services/atomicStockService"

export async function executeTransfer({
  productId,
  sourceLocationId,
  destinationLocationId,
  quantity,
  annotation = ""
}) {

  if (sourceLocationId === destinationLocationId) {
    throw new Error("La source et la destination doivent être différentes")
  }

  if (!quantity || quantity <= 0) {
    throw new Error("Quantité invalide")
  }

  await transferStock({
    productId,
    sourceLocationId,
    destinationLocationId,
    quantity,
    annotation,
  })
}
