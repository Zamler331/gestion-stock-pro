import { supabase } from "@/lib/supabase"

export async function executeSupplierEntry({
  productId,
  locationId,
  quantity,
  annotation = ""
}) {

  if (!quantity || quantity <= 0) {
    throw new Error("Quantité invalide")
  }

  // 1️⃣ Récupérer stock existant
  const { data: stock, error } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", productId)
    .eq("location_id", locationId)
    .single()

  if (error || !stock) {
    throw new Error("Stock introuvable")
  }

  // 2️⃣ Mettre à jour stock
  await supabase
    .from("stocks")
    .update({ quantity: stock.quantity + quantity })
    .eq("id", stock.id)

  // 3️⃣ Créer mouvement
  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from("movements").insert([{
    product_id: productId,
    type: "entry",
    quantity,
    destination_location_id: locationId,
    user_id: user.id,
    annotation
  }])
}