import { supabase } from "@/lib/supabase"

export async function createStockEntry({
  product_id,
  location_id,
  quantity,
  expiration_date = null,
  effective_date = null
}) {

  const { data: { user } } = await supabase.auth.getUser()

  if (!user) throw new Error("Utilisateur non authentifié")

  const effectiveDate =
    effective_date || new Date().toISOString()

  /* mouvement */

  const { data: movement, error: movementError } =
    await supabase
      .from("movements")
      .insert({
        product_id,
        quantity,
        type: "entry",
        destination_location_id: location_id,
        user_id: user.id,
        effective_date: effectiveDate
      })
      .select()
      .single()

  if (movementError) throw movementError

  /* batch */

  const { error: batchError } = await supabase
    .from("stock_batches")
    .insert({
      product_id,
      location_id,
      quantity,
      expiration_date,
      source_movement_id: movement.id
    })

  if (batchError) throw batchError

  return true
}