"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { addToQueue } from "@/lib/offline/offlineQueue"

export default function OrdersTab() {

  const [stocks, setStocks] = useState([])
  const [orderDraft, setOrderDraft] = useState({})
  const [stockDraft, setStockDraft] = useState({})
  const [search, setSearch] = useState("")
  const [alertFilter, setAlertFilter] = useState("all")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [myLocationId, setMyLocationId] = useState(null)

  useEffect(() => {
    fetchMyLocation()
  }, [])

  async function fetchMyLocation() {
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) return

    const { data } = await supabase
      .from("profiles")
      .select("location_id")
      .eq("id", user.id)
      .single()

    if (data) setMyLocationId(data.location_id)
  }

  useEffect(() => {
    if (myLocationId) fetchStocks()
  }, [myLocationId])

  async function fetchStocks() {

    const now = new Date()

    /* VISIBILITÉ */
    const { data: visibility } = await supabase
      .from("product_location_settings")
      .select("product_id")
      .eq("location_id", myLocationId)

    const productIds = visibility?.map(v => v.product_id) || []

    if (productIds.length === 0) {
      setStocks([])
      return
    }

    /* PRODUITS */
    const { data: productsData } = await supabase
      .from("products")
      .select(`id, name, packaging, categories(name)`)
      .in("id", productIds)

    const productMap = {}
    productsData?.forEach(p => {
      productMap[p.id] = p
    })

    /* BATCHES */
    const { data: batches } = await supabase
      .from("stock_batches")
      .select("*")
      .eq("location_id", myLocationId)
      .in("product_id", productIds)

    /* MOVEMENTS (effective_date) */
    const { data: movements } = await supabase
      .from("movements")
      .select("id, effective_date")

    const movementMap = {}
    movements?.forEach(m => {
      movementMap[m.id] = m.effective_date
    })

    /* FILTRAGE */
    const validBatches = (batches || []).filter(b => {

      const notExpired =
        !b.expiration_date ||
        new Date(b.expiration_date) > now

      const effectiveDate = movementMap[b.source_movement_id]

      const isActive =
        !effectiveDate ||
        new Date(effectiveDate) <= now

      return notExpired && isActive
    })

    /* AGRÉGATION */
    const formatted = productIds.map(productId => {

      const batchesForProduct =
        validBatches.filter(b => b.product_id === productId)

      const totalQty = batchesForProduct.reduce(
        (sum, b) => sum + b.quantity,
        0
      )

      const productInfo = productMap[productId]

      return {
        product_id: productId,
        quantity: totalQty,
        products: productInfo,
      }
    })

    /* THRESHOLDS */
    const { data: thresholds } = await supabase
      .from("product_location_settings")
      .select("product_id, low_stock_threshold")
      .eq("location_id", myLocationId)

    const thresholdMap = {}
    thresholds?.forEach(t => {
      thresholdMap[t.product_id] = t.low_stock_threshold
    })

    const finalData = formatted.map(p => {

      const threshold = thresholdMap[p.product_id] ?? 5

      return {
        ...p,
        low_stock_threshold: threshold,
        isLow: p.quantity > 0 && p.quantity <= threshold,
        isOut: p.quantity === 0
      }
    })

    setStocks(finalData)

    const draft = {}
    finalData.forEach(p => {
      draft[p.product_id] = p.quantity
    })

    setStockDraft(draft)
  }

  function updateStock(productId, value) {
    setStockDraft(prev => ({
      ...prev,
      [productId]: parseInt(value) || 0
    }))
  }

  function updateOrder(productId, value) {
    setOrderDraft(prev => ({
      ...prev,
      [productId]: parseInt(value) || 0
    }))
  }

  const filtered = useMemo(() => {
    return stocks
      .filter(item =>
        item.products?.name?.toLowerCase().includes(search.toLowerCase())
      )
      .filter(item => {
        if (alertFilter === "low") return item.isLow
        if (alertFilter === "out") return item.isOut
        return true
      })
  }, [stocks, search, alertFilter])

  const grouped = useMemo(() => {
    return filtered.reduce((acc, item) => {
      const cat = item.products?.categories?.name || "Sans catégorie"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(item)
      return acc
    }, {})
  }, [filtered])

  async function handleValidate() {

    try {

      setIsSubmitting(true)
      setMessage("")

      const { data: { user } } = await supabase.auth.getUser()

      for (const stock of stocks) {

        const newQty = stockDraft[stock.product_id]
        const oldQty = stock.quantity

        if (newQty === oldQty) continue

        const diff = newQty - oldQty

        /* CREATE MOVEMENT */
        const { data: movement } = await supabase
          .from("movements")
          .insert({
            product_id: stock.product_id,
            quantity: Math.abs(diff),
            type: diff < 0 ? "sortie" : "correction",
            source_location_id: myLocationId,
            user_id: user.id
          })
          .select()
          .single()

        /* ========================= */
        /* FIFO SORTIE 🔥 */
        /* ========================= */

        if (diff < 0) {

          const qtyToRemove = Math.abs(diff)

          const { data: batches } = await supabase
            .from("stock_batches")
            .select("*")
            .eq("product_id", stock.product_id)
            .eq("location_id", myLocationId)
            .order("created_at", { ascending: true })

          let remaining = qtyToRemove

          const now = new Date()

          const validBatches = (batches || []).filter(b =>
            !b.expiration_date ||
            new Date(b.expiration_date) > now
          )

          const totalAvailable = validBatches.reduce(
            (sum, b) => sum + b.quantity,
            0
          )

          if (totalAvailable < qtyToRemove) {
            console.error("Stock insuffisant FIFO")
            continue
          }

          for (const batch of validBatches) {

            if (remaining <= 0) break

            if (batch.quantity <= remaining) {

              await supabase
                .from("stock_batches")
                .delete()
                .eq("id", batch.id)

              remaining -= batch.quantity

            } else {

              await supabase
                .from("stock_batches")
                .update({
                  quantity: batch.quantity - remaining
                })
                .eq("id", batch.id)

              remaining = 0
            }
          }
        }

        /* ========================= */
        /* ENTRÉE → BATCH */
        /* ========================= */

        if (diff > 0) {

          await supabase
            .from("stock_batches")
            .insert({
              product_id: stock.product_id,
              location_id: myLocationId,
              quantity: diff,
              source_movement_id: movement.id
            })
        }
      }

      /* COMMANDES */

      const items = Object.entries(orderDraft)
        .filter(([_, q]) => q > 0)
        .map(([productId, q]) => ({
          product_id: productId,
          quantity_ordered: q
        }))

      if (items.length > 0) {

        if (!navigator.onLine) {

          await addToQueue({
            type: "order",
            destination_location_id: myLocationId,
            items
          })

        } else {

          const { data: order } = await supabase
            .from("orders")
            .insert({
              destination_location_id: myLocationId
            })
            .select()
            .single()

          const itemsWithOrder = items.map(i => ({
            ...i,
            order_id: order.id
          }))

          await supabase
            .from("order_items")
            .insert(itemsWithOrder)
        }
      }

      setMessage("Mise à jour + commande OK ✅")
      fetchStocks()
      setOrderDraft({})

    } catch (err) {

      console.error(err)
      setMessage("Erreur")

    } finally {

      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">

      <h2 className="text-xl font-semibold">
        Stock & Commande
      </h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher..."
        className="border px-4 py-2 rounded-lg w-full"
      />

      {Object.entries(grouped).map(([cat, items]) => (

        <div key={cat} className="space-y-3">

          <h3 className="font-semibold">{cat}</h3>

          <div className="space-y-3">

            {items.map(item => {

              const currentStock = stockDraft[item.product_id] ?? 0

              const isOut = currentStock === 0
              const isLow =
                currentStock > 0 &&
                currentStock <= item.low_stock_threshold

              const suggestedOrder = Math.max(
                item.low_stock_threshold - currentStock,
                0
              )

              return (
                <div key={item.product_id} className="bg-white p-4 rounded-xl shadow space-y-2">

                  <div className="font-medium flex items-center gap-2">
                    {item.products?.name || "Produit"}

                    {isOut && (
                      <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                        Rupture
                      </span>
                    )}

                    {!isOut && isLow && (
                      <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                        Sous seuil
                      </span>
                    )}
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>Stock</span>
                    <input
                      type="number"
                      value={currentStock}
                      onChange={(e) =>
                        updateStock(item.product_id, e.target.value)
                      }
                      className="w-20 border rounded text-center"
                    />
                  </div>

                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Seuil</span>
                    <span>{item.low_stock_threshold}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>Commander</span>
                    <input
                      type="number"
                      value={
                        orderDraft[item.product_id] ??
                        suggestedOrder
                      }
                      onChange={(e) =>
                        updateOrder(item.product_id, e.target.value)
                      }
                      className="w-20 border rounded text-center"
                    />
                  </div>

                </div>
              )
            })}

          </div>

        </div>

      ))}

      <button
        onClick={handleValidate}
        disabled={isSubmitting}
        className="bg-slate-900 text-white px-6 py-2 rounded-lg"
      >
        {isSubmitting ? "Enregistrement..." : "Valider"}
      </button>

      {message && <div>{message}</div>}

    </div>
  )
}