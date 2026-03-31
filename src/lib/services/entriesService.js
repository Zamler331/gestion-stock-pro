import { supabase } from "@/lib/supabase"

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

  const {
    data: { user },
    error: userError,
  } = await supabase.auth.getUser()

  if (userError) throw userError
  if (!user) {
    throw new Error("Utilisateur non authentifié")
  }

  const qty = Number(quantity)

  /* 1️⃣ Créer mouvement */
  const { data: movement, error: movementError } = await supabase
    .from("movements")
    .insert({
      product_id: productId,
      type: "entry",
      quantity: qty,
      destination_location_id: locationId,
      user_id: user.id,
      annotation: annotation || "Entrée fournisseur",
    })
    .select()
    .single()

  if (movementError) {
    throw new Error(movementError.message)
  }

  if (!movement) {
    throw new Error("Impossible de créer le mouvement")
  }

  /* 2️⃣ Créer batch */
  const { error: batchError } = await supabase
    .from("stock_batches")
    .insert({
      product_id: productId,
      location_id: locationId,
      quantity: qty,
      expiration_date: expirationDate || null,
      source_movement_id: movement.id,
    })

  if (batchError) {
    throw new Error(batchError.message)
  }

  return true
}