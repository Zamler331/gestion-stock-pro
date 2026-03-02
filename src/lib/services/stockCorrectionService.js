import { supabase } from "@/lib/supabase"

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

  // 1️⃣ Récupérer stock actuel
  const { data: stock, error } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .single()

  if (error || !stock) {
    throw new Error("Stock introuvable")
  }

  const difference = newQuantity - stock.quantity

  // 2️⃣ Mettre à jour
  await supabase
    .from("stocks")
    .update({ quantity: newQuantity })
    .eq("id", stock.id)

  // 3️⃣ Enregistrer mouvement
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from("movements").insert([{
    product_id: productId,
    type: "correction",
    quantity: difference,
    source_location_id: locationId,
    user_id: user.id,
    annotation: `Correction : ${reason}`
  }])
}