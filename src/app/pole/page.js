"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { db } from "@/lib/localDB"
import { useSyncRefresh } from "@/hooks/useSyncRefresh"

export default function PolePage() {
  const router = useRouter()

  const [stocks, setStocks] = useState([])
  const [locationId, setLocationId] = useState(null)
  const [orderDraft, setOrderDraft] = useState({})
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    initialize()
  }, [])

  async function initialize() {
  const { data: { user } } = await supabase.auth.getUser()

  if (!user) {
    router.push("/login")
    return
  }

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, location_id")
    .eq("id", user.id)
    .single()

  console.log("PROFILE :", profile) // ✔ ici

  if (!profile || profile.role !== "pole") {
    router.push("/login")
    return
  }

  setLocationId(profile.location_id)
}

  useSyncRefresh(fetchStocks)

  async function initialize() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role, location_id")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "pole") {
      router.push("/login")
      return
    }

    setLocationId(profile.location_id)
    console.log("LocationId défini :", profile.location_id)
  }

  useEffect(() => {
    if (locationId) fetchStocks()
  }, [locationId])

  async function fetchStocks() {
  if (!locationId) return

  console.log("Fetch stocks avec locationId :", locationId)

  // 1️⃣ Récupérer les stocks du pôle
  const { data: stocksData, error: stocksError } = await supabase
  .from("stocks")
  .select(`
    id,
    quantity,
    product_id,
    products (
      id,
      name,
      category_id,
      categories (
        id,
        name
      )
    )
  `)
  .eq("location_id", locationId)

  if (stocksError && stocksError.message) {
  console.error("Erreur fetch stocks :", stocksError)
  return
}

  // 2️⃣ Récupérer les seuils pour ce pôle
  const { data: thresholdsData, error: thresholdsError } = await supabase
    .from("product_location_settings")
    .select("product_id, low_stock_threshold")
    .eq("location_id", locationId)

  if (thresholdsError && thresholdsError.message) {
  console.error("Erreur fetch thresholds :", thresholdsError)
  return
}

  // 3️⃣ Transformer les seuils en map
  const thresholdMap = {}
  thresholdsData.forEach(t => {
    thresholdMap[t.product_id] = t.low_stock_threshold
  })

  // 4️⃣ Fusionner
  const merged = stocksData.map(stock => ({
    ...stock,
    low_stock_threshold:
      thresholdMap[stock.product_id] ?? 5
  }))

  console.log("Stocks finaux :", merged)

  setStocks(merged)
}

  function updateOrder(productId, value) {
    setOrderDraft(prev => ({
      ...prev,
      [productId]: parseInt(value) || 0
    }))
  }

  async function handleBulkOrder() {
    if (isSubmitting) return

    const entries = Object.entries(orderDraft)
      .filter(([_, qty]) => qty > 0)

    if (entries.length === 0) return

    setIsSubmitting(true)

    try {
      for (const [productId, qty] of entries) {

        if (!navigator.onLine) {
          await db.pendingActions.add({
            type: "create_order",
            actionId: crypto.randomUUID(),
            payload: {
              product_id: productId,
              quantity: qty,
              destination_location_id: locationId
            },
            synced: false,
            processing: false,
            retryCount: 0,
            createdAt: new Date()
          })
        } else {
          await supabase.from("orders").insert([{
            product_id: productId,
            quantity: qty,
            destination_location_id: locationId,
            status: "En attente"
          }])
        }
      }

      setOrderDraft({})
      setMessage("Commande envoyée ✅")

    } finally {
      setIsSubmitting(false)
    }
  }

  const groupedStocks = stocks.reduce((acc, item) => {
  const categoryName =
    item.products?.categories?.name || "Sans catégorie"

  if (!acc[categoryName]) acc[categoryName] = []
  acc[categoryName].push(item)

  return acc
}, {})

  return (
    <div className="p-8">
      <h1 className="text-3xl font-bold mb-6">Espace Pôle</h1>

      <button
  onClick={() => router.push("/stocks")}
  className="bg-slate-700 text-white px-4 py-2 rounded"
>
  Vue globale des stocks
</button>

      {Object.entries(groupedStocks).map(([categoryId, items]) => (
        <div key={categoryId} className="mb-8">
          <h2 className="text-xl font-semibold mb-3 capitalize">
           {categoryId}
           </h2>

          <div className="space-y-2">
            {items.map(item => {

              const threshold = item.low_stock_threshold

              const isOut = item.quantity === 0
              const isLow = item.quantity <= threshold

              return (
                <div
                  key={item.product_id}
                  className={`flex justify-between items-center p-3 border rounded ${
                    isOut
                      ? "bg-red-100"
                      : isLow
                      ? "bg-orange-100"
                      : ""
                  }`}
                >
                  <div>
                    <p className="font-medium">
                      {item.products.name}
                    </p>
                    <p className="text-sm text-gray-600">
                      Stock : {item.quantity} | Seuil : {threshold}
                    </p>
                  </div>

                  <input
                    type="number"
                    min="0"
                    value={orderDraft[item.product_id] || ""}
                    onChange={(e) =>
                      updateOrder(item.product_id, e.target.value)
                    }
                    className="w-20 border rounded p-1"
                  />
                </div>
              )
            })}
          </div>
        </div>
      ))}

      <button
        onClick={handleBulkOrder}
        disabled={isSubmitting}
        className={`bg-blue-600 text-white px-4 py-2 rounded ${
          isSubmitting ? "opacity-50 cursor-not-allowed" : ""
        }`}
      >
        {isSubmitting ? "Envoi..." : "Valider la commande"}
      </button>

      {message && <p className="mt-4">{message}</p>}
    </div>
  )
}