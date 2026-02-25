import { db } from "./localDB"
import { supabase } from "@/lib/supabase"

let isSyncing = false
const MAX_RETRY = 3

/* ========================= */
/* SYNC STATUS LISTENERS */
/* ========================= */

let listeners = []

export function subscribeSync(callback) {
  listeners.push(callback)
}

function notifySync(status) {
  listeners.forEach(cb => cb(status))
}

/* ========================= */
/* MAIN SYNC FUNCTION */
/* ========================= */

export async function syncPendingActions() {

  if (!navigator.onLine) {
    notifySync(false)
    return
  }

  // 🔒 Empêcher double lancement
  if (isSyncing) return
  isSyncing = true
  notifySync(true)

  const actions = await db.pendingActions
  .filter(a => a.synced === false && !a.processing)
  .toArray()

// Supprimer les actions invalides
for (const action of actions) {
  if (!action.actionId || !action.type || !action.payload) {
    await db.pendingActions.delete(action.id)
  }
}

  if (!navigator.onLine) {
  isSyncing = false
  notifySync(false)
  return
}

  // Débloquer les actions bloquées
await db.pendingActions
  .filter(action => action.processing === true)
  .modify(action => {
    action.processing = false
  })

  try {

    const actions = await db.pendingActions
  .filter(a => a.synced === false && !a.processing && !a.failed)
  .toArray()

    for (const action of actions) {

      if (action.retryCount >= MAX_RETRY) {
  console.warn("Action marquée en échec définitif", action)

  await db.pendingActions.update(action.id, {
    failed: true,
    processing: false
  })

  continue
}

      try {

        await processAction(action)

        // ✅ Suppression après succès
        await db.pendingActions.delete(action.id)

      } catch (error) {

        console.error("Erreur sync :", error)

        await db.pendingActions.update(action.id, {
          processing: false,
          retryCount: (action.retryCount || 0) + 1,
          lastError: error.message,
          lastAttemptAt: new Date()
        })
      }
    }

  } finally {
    isSyncing = false
    notifySync(false)
  }
}

/* ========================= */
/* PROCESS ACTION */
/* ========================= */

async function processAction(action) {

  const type = action.type
  const payload = action.payload
  const actionId = action.actionId

  if (!actionId) {
    throw new Error("actionId manquant — action invalide")
  }

  switch (type) {

    /* ========================= */
    /* VALIDATION COMMANDE */
    /* ========================= */

    case "validate_order": {

  const { order_id, source_location_id } = payload

  // 🔐 Vérifier si mouvement déjà créé
  const { data: existingMovement } = await supabase
    .from("movements")
    .select("id")
    .eq("action_id", actionId ?? "")
    .maybeSingle()

  if (existingMovement) {
    console.warn("Action déjà traitée — skip")
    return
  }

  const { data: order } = await supabase
    .from("orders")
    .select("*")
    .eq("id", order_id)
    .single()

  if (!order) return

  if (order.status === "Livré") {
    console.warn("Commande déjà livrée — skip")
    return
  }

  const qty = parseInt(order.quantity)

  const { data: reserveStock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", order.product_id)
    .eq("location_id", source_location_id)
    .single()

  if (!reserveStock || reserveStock.quantity < qty)
    throw new Error("Stock insuffisant")

  // Décrémenter réserve
  await supabase
    .from("stocks")
    .update({ quantity: reserveStock.quantity - qty })
    .eq("id", reserveStock.id)

  const { data: poleStock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", order.product_id)
    .eq("location_id", order.destination_location_id)
    .single()

  // Incrémenter pôle
  await supabase
    .from("stocks")
    .update({ quantity: poleStock.quantity + qty })
    .eq("id", poleStock.id)

  // 🔐 INSERT sécurisé avec action_id
  await supabase.from("movements").insert([{
    product_id: order.product_id,
    type: "livraison",
    quantity: qty,
    source_location_id,
    destination_location_id: order.destination_location_id,
    action_id: actionId
  }])

  await supabase
    .from("orders")
    .update({
      status: "Livré",
      source_location_id
    })
    .eq("id", order_id)

  break
}
    /* ========================= */
    /* ENTRÉE FOURNISSEUR */
    /* ========================= */

   case "supplier_entry": {

  const { product_id, location_id, quantity, annotation } = payload

  // 🔐 Vérifier si déjà traité
  const { data: existingMovement } = await supabase
    .from("movements")
    .select("id")
    .eq("action_id", actionId ?? "")
    .maybeSingle()

  if (existingMovement) {
    console.warn("supplier_entry déjà traité — skip")
    return
  }

  const { data: stock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", product_id)
    .eq("location_id", location_id)
    .single()

  if (!stock)
    throw new Error("Stock introuvable")

  // Incrémenter stock
  await supabase
    .from("stocks")
    .update({ quantity: stock.quantity + quantity })
    .eq("id", stock.id)

  // 🔐 Insert sécurisé
  await supabase.from("movements").insert([{
    product_id,
    type: "entry",
    quantity,
    destination_location_id: location_id,
    annotation,
    action_id: actionId
  }])

  break
}

    /* ========================= */
    /* TRANSFERT */
    /* ========================= */

    case "transfer": {

  const {
    product_id,
    quantity,
    source_location_id,
    destination_location_id,
    annotation
  } = payload

  // 🔐 Vérifier si déjà traité
  const { data: existingMovement } = await supabase
    .from("movements")
    .select("id")
    .eq("action_id", actionId ?? "")
    .maybeSingle()

  if (existingMovement) {
    console.warn("transfer déjà traité — skip")
    return
  }

  const { data: sourceStock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", product_id)
    .eq("location_id", source_location_id)
    .single()

  if (!sourceStock || sourceStock.quantity < quantity)
    throw new Error("Stock insuffisant")

  // Décrémenter source
  await supabase
    .from("stocks")
    .update({ quantity: sourceStock.quantity - quantity })
    .eq("id", sourceStock.id)

  const { data: destStock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", product_id)
    .eq("location_id", destination_location_id)
    .single()

  if (!destStock)
    throw new Error("Stock destination introuvable")

  // Incrémenter destination
  await supabase
    .from("stocks")
    .update({ quantity: destStock.quantity + quantity })
    .eq("id", destStock.id)

  // 🔐 Insert sécurisé
  await supabase.from("movements").insert([{
    product_id,
    type: "transfert",
    quantity,
    source_location_id,
    destination_location_id,
    annotation,
    action_id: actionId
  }])

  break
}

    /* ========================= */
    /* SORTIE PÔLE */
    /* ========================= */

    case "pole_exit": {

  const {
    product_id,
    location_id,
    quantity,
    annotation
  } = payload

  // 🔐 Vérifier si déjà traité
  const { data: existingMovement } = await supabase
    .from("movements")
    .select("id")
    .eq("action_id", actionId ?? "")
    .maybeSingle()

  if (existingMovement) {
    console.warn("pole_exit déjà traité — skip")
    return
  }

  const { data: stock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", product_id)
    .eq("location_id", location_id)
    .single()

  if (!stock || stock.quantity < quantity)
    throw new Error("Stock insuffisant")

  // Décrémenter stock
  await supabase
    .from("stocks")
    .update({ quantity: stock.quantity - quantity })
    .eq("id", stock.id)

  // 🔐 Insert sécurisé
  await supabase.from("movements").insert([{
    product_id,
    type: "sortie",
    quantity,
    source_location_id: location_id,
    destination_location_id: null,
    annotation,
    action_id: actionId
  }])

  break
}

    /* ========================= */
    /* CREATION COMMANDE */
    /* ========================= */

case "create_order": {
  const { product_id, quantity, destination_location_id, annotation } = payload

  // Vérification idempotence
  const { data: existing } = await supabase
    .from("orders")
    .select("id")
    .eq("action_id", actionId ?? "")
    .maybeSingle()

  if (existing) break

  const { error } = await supabase.from("orders").insert([{
    product_id,
    quantity,
    destination_location_id,
    source_location_id: null,
    status: "En attente",
    annotation,
    action_id: actionId
  }])

  if (error) throw error

  break
}

    default:
      console.warn("Type non géré :", type)
  }
}