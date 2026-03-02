import { supabase } from "@/lib/supabase"

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

  // 1️⃣ Récupérer stock source
  const { data: sourceStock, error: sourceError } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", sourceLocationId)
    .single()

  if (sourceError || !sourceStock) {
    throw new Error("Stock source introuvable")
  }

  if (sourceStock.quantity < quantity) {
    throw new Error("Stock insuffisant")
  }

  // 2️⃣ Récupérer stock destination
  const { data: destStock, error: destError } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", destinationLocationId)
    .single()

  if (destError || !destStock) {
    throw new Error("Stock destination introuvable")
  }

  // 3️⃣ Mise à jour stock source
  await supabase
    .from("stocks")
    .update({ quantity: sourceStock.quantity - quantity })
    .eq("id", sourceStock.id)

  // 4️⃣ Mise à jour stock destination
  await supabase
    .from("stocks")
    .update({ quantity: destStock.quantity + quantity })
    .eq("id", destStock.id)

  // 5️⃣ Mouvement
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from("movements").insert([{
    product_id: productId,
    type: "transfert",
    quantity,
    source_location_id: sourceLocationId,
    destination_location_id: destinationLocationId,
    user_id: user.id,
    annotation
  }])
}