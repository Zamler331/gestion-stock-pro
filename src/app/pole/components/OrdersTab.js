"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { addToQueue } from "@/lib/offline/offlineQueue"

const CATEGORY_ORDER = [
  "Epicerie",
  "Paninis",
  "Frais",
  "Surgelé",
  "Boissons",
  "Boissons (NICO)",
  "Glaces (cônes)",
  "Glaces (boules)",
  "Granités/Frozzen",
  "Confiseries",
  "Matériel",
  "Sans catégorie",
]

export default function OrdersTab() {
  const [stocks, setStocks] = useState([])
  const [orderDraft, setOrderDraft] = useState({})
  const [stockDraft, setStockDraft] = useState({})
  const [search, setSearch] = useState("")
  const [alertFilter, setAlertFilter] = useState("all")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")
  const [myLocationId, setMyLocationId] = useState(null)
  const [openCategories, setOpenCategories] = useState({})

  useEffect(() => {
    fetchMyLocation()
  }, [])

  useEffect(() => {
    if (myLocationId) fetchStocks()
  }, [myLocationId])

  async function fetchMyLocation() {
    const {
      data: { user },
      error,
    } = await supabase.auth.getUser()

    if (error) {
      console.error("Erreur récupération user :", error)
      return
    }

    if (!user) return

    const { data, error: profileError } = await supabase
      .from("profiles")
      .select("location_id")
      .eq("id", user.id)
      .single()

    if (profileError) {
      console.error("Erreur récupération profil :", profileError)
      return
    }

    if (data) setMyLocationId(data.location_id)
  }

  async function fetchStocks() {
    try {
      const now = new Date()

      const { data: visibility, error: visibilityError } = await supabase
        .from("product_location_settings")
        .select("product_id")
        .eq("location_id", myLocationId)

      if (visibilityError) throw visibilityError

      const productIds = visibility?.map((v) => v.product_id) || []

      if (productIds.length === 0) {
        setStocks([])
        setStockDraft({})
        setOrderDraft({})
        setOpenCategories({})
        return
      }

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, packaging, has_expiration, categories(name)")
        .in("id", productIds)
        .eq("has_expiration", false)

      if (productsError) throw productsError

      const filteredProductIds = productsData?.map((p) => p.id) || []

      if (filteredProductIds.length === 0) {
        setStocks([])
        setStockDraft({})
        setOrderDraft({})
        setOpenCategories({})
        return
      }

      const productMap = {}
      productsData?.forEach((p) => {
        productMap[p.id] = p
      })

      const { data: batches, error: batchesError } = await supabase
        .from("stock_batches")
        .select("*")
        .eq("location_id", myLocationId)
        .in("product_id", filteredProductIds)

      if (batchesError) throw batchesError

      const sourceMovementIds = [
        ...new Set(
          (batches || [])
            .map((b) => b.source_movement_id)
            .filter(Boolean)
        ),
      ]

      let movementMap = {}

      if (sourceMovementIds.length > 0) {
        const { data: movements, error: movementsError } = await supabase
          .from("movements")
          .select("id, effective_date")
          .in("id", sourceMovementIds)

        if (movementsError) throw movementsError

        movements?.forEach((m) => {
          movementMap[m.id] = m.effective_date
        })
      }

      const validBatches = (batches || []).filter((b) => {
        const notExpired =
          !b.expiration_date || new Date(b.expiration_date) > now

        const effectiveDate = movementMap[b.source_movement_id]

        const isActive =
          !effectiveDate || new Date(effectiveDate) <= now

        return notExpired && isActive && Number(b.quantity || 0) > 0
      })

      const formatted = filteredProductIds.map((productId) => {
        const batchesForProduct = validBatches.filter(
          (b) => b.product_id === productId
        )

        const totalQty = batchesForProduct.reduce(
          (sum, b) => sum + Number(b.quantity || 0),
          0
        )

        const productInfo = productMap[productId]

        return {
          product_id: productId,
          quantity: totalQty,
          products: productInfo,
        }
      })

      const { data: thresholds, error: thresholdsError } = await supabase
        .from("product_location_settings")
        .select("product_id, low_stock_threshold")
        .eq("location_id", myLocationId)

      if (thresholdsError) throw thresholdsError

      const thresholdMap = {}
      thresholds?.forEach((t) => {
        thresholdMap[t.product_id] = t.low_stock_threshold
      })

      const finalData = formatted.map((p) => {
        const threshold = thresholdMap[p.product_id] ?? 5

        return {
          ...p,
          low_stock_threshold: threshold,
          isLow: p.quantity > 0 && p.quantity <= threshold,
          isOut: p.quantity === 0,
        }
      })

      setStocks(finalData)

      const newStockDraft = {}
      finalData.forEach((p) => {
        newStockDraft[p.product_id] = p.quantity
      })
      setStockDraft(newStockDraft)

      setOrderDraft((prev) => {
        const next = { ...prev }

        finalData.forEach((p) => {
          if (next[p.product_id] === undefined) {
            next[p.product_id] = 0
          }
        })

        return next
      })

      const categoryNames = [
        ...new Set(
          finalData.map(
            (item) => item.products?.categories?.name || "Sans catégorie"
          )
        ),
      ]

      const isDesktop =
        typeof window !== "undefined" ? window.innerWidth >= 768 : true

      setOpenCategories((prev) => {
        const next = { ...prev }

        categoryNames.forEach((cat) => {
          if (next[cat] === undefined) {
            next[cat] = isDesktop
          }
        })

        return next
      })
    } catch (err) {
      console.error(err)
      setMessage("Erreur lors du chargement des stocks")
    }
  }

  function updateStock(productId, value) {
    const parsed = parseInt(value, 10)
    setStockDraft((prev) => ({
      ...prev,
      [productId]: Number.isNaN(parsed) ? 0 : parsed,
    }))
  }

  function updateOrder(productId, value) {
    const parsed = parseInt(value, 10)
    setOrderDraft((prev) => ({
      ...prev,
      [productId]: Number.isNaN(parsed) ? 0 : parsed,
    }))
  }

  function toggleCategory(categoryName) {
    setOpenCategories((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }))
  }

  const filtered = useMemo(() => {
    return stocks
      .filter((item) =>
        item.products?.name?.toLowerCase().includes(search.toLowerCase())
      )
      .filter((item) => {
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

  const orderedGroupedEntries = useMemo(() => {
    const entries = Object.entries(grouped)

    return entries.sort(([catA], [catB]) => {
      const indexA = CATEGORY_ORDER.indexOf(catA)
      const indexB = CATEGORY_ORDER.indexOf(catB)

      const aKnown = indexA !== -1
      const bKnown = indexB !== -1

      if (aKnown && bKnown) return indexA - indexB
      if (aKnown) return -1
      if (bKnown) return 1

      return catA.localeCompare(catB, "fr")
    })
  }, [grouped])

  async function handleValidate() {
    try {
      setIsSubmitting(true)
      setMessage("")

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) throw new Error("Utilisateur non connecté")

      for (const stock of stocks) {
        const newQty = Number(stockDraft[stock.product_id] ?? 0)
        const oldQty = Number(stock.quantity ?? 0)

        if (newQty === oldQty) continue

        if (newQty < 0) {
          throw new Error(
            `Le stock ne peut pas être négatif pour ${
              stock.products?.name || "un produit"
            }`
          )
        }

        const diff = newQty - oldQty

        if (diff < 0) {
          const qtyToRemove = Math.abs(diff)

          const { data: batches, error: batchesError } = await supabase
            .from("stock_batches")
            .select("*")
            .eq("product_id", stock.product_id)
            .eq("location_id", myLocationId)
            .order("created_at", { ascending: true })

          if (batchesError) throw batchesError

          const sourceMovementIds = [
            ...new Set(
              (batches || [])
                .map((b) => b.source_movement_id)
                .filter(Boolean)
            ),
          ]

          let movementMap = {}

          if (sourceMovementIds.length > 0) {
            const { data: movements, error: movementsError } = await supabase
              .from("movements")
              .select("id, effective_date")
              .in("id", sourceMovementIds)

            if (movementsError) throw movementsError

            movements?.forEach((m) => {
              movementMap[m.id] = m.effective_date
            })
          }

          const now = new Date()

          const validBatches = (batches || []).filter((b) => {
            const notExpired =
              !b.expiration_date || new Date(b.expiration_date) > now

            const effectiveDate = movementMap[b.source_movement_id]
            const isActive =
              !effectiveDate || new Date(effectiveDate) <= now

            return notExpired && isActive && Number(b.quantity || 0) > 0
          })

          const totalAvailable = validBatches.reduce(
            (sum, b) => sum + Number(b.quantity || 0),
            0
          )

          if (totalAvailable < qtyToRemove) {
            throw new Error(
              `Stock insuffisant pour ${
                stock.products?.name || "ce produit"
              } (disponible : ${totalAvailable}, demandé : ${qtyToRemove})`
            )
          }

          const { data: movement, error: movementError } = await supabase
            .from("movements")
            .insert({
              product_id: stock.product_id,
              quantity: qtyToRemove,
              type: "sortie",
              source_location_id: myLocationId,
              user_id: user.id,
            })
            .select()
            .single()

          if (movementError) throw movementError

          let remaining = qtyToRemove

          for (const batch of validBatches) {
            if (remaining <= 0) break

            if (Number(batch.quantity) <= remaining) {
              const { error: deleteError } = await supabase
                .from("stock_batches")
                .delete()
                .eq("id", batch.id)

              if (deleteError) throw deleteError

              remaining -= Number(batch.quantity)
            } else {
              const { error: updateError } = await supabase
                .from("stock_batches")
                .update({
                  quantity: Number(batch.quantity) - remaining,
                })
                .eq("id", batch.id)

              if (updateError) throw updateError

              remaining = 0
            }
          }
        }

        if (diff > 0) {
          const { data: movement, error: movementError } = await supabase
            .from("movements")
            .insert({
              product_id: stock.product_id,
              quantity: diff,
              type: "correction",
              source_location_id: myLocationId,
              user_id: user.id,
            })
            .select()
            .single()

          if (movementError) throw movementError

          const { error: batchInsertError } = await supabase
            .from("stock_batches")
            .insert({
              product_id: stock.product_id,
              location_id: myLocationId,
              quantity: diff,
              source_movement_id: movement.id,
            })

          if (batchInsertError) throw batchInsertError
        }
      }

      const items = stocks
        .map((stock) => ({
          product_id: stock.product_id,
          quantity_ordered: Number(orderDraft[stock.product_id] ?? 0),
        }))
        .filter((item) => item.quantity_ordered > 0)

      if (items.length > 0) {
        if (!navigator.onLine) {
          await addToQueue({
            type: "order",
            destination_location_id: myLocationId,
            items,
          })
        } else {
          const { data: order, error: orderError } = await supabase
            .from("orders")
            .insert({
              destination_location_id: myLocationId,
            })
            .select()
            .single()

          if (orderError) throw orderError
          if (!order) throw new Error("Impossible de créer la commande")

          const itemsWithOrder = items.map((i) => ({
            ...i,
            order_id: order.id,
          }))

          const { error: itemsError } = await supabase
            .from("order_items")
            .insert(itemsWithOrder)

          if (itemsError) throw itemsError
        }
      }

      setMessage("Mise à jour + commande OK ✅")
      setOrderDraft({})
      await fetchStocks()
    } catch (err) {
      console.error(err)
      setMessage(err.message || "Erreur")
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Stock & Commande</h2>

      <div className="space-y-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="border px-4 py-2 rounded-lg w-full"
        />

        <select
          value={alertFilter}
          onChange={(e) => setAlertFilter(e.target.value)}
          className="border px-4 py-2 rounded-lg w-full md:w-60"
        >
          <option value="all">Tous les produits</option>
          <option value="low">Sous seuil</option>
          <option value="out">Rupture</option>
        </select>
      </div>

      {orderedGroupedEntries.length === 0 ? (
        <div className="text-sm text-slate-500">
          Aucun produit à afficher.
        </div>
      ) : (
        orderedGroupedEntries.map(([cat, items]) => {
          const isOpen = openCategories[cat] ?? true

          return (
            <div key={cat} className="space-y-3">
              <button
                type="button"
                onClick={() => toggleCategory(cat)}
                className="w-full flex items-center justify-between bg-white px-4 py-3 rounded-xl shadow text-left"
              >
                <div className="flex items-center gap-3">
                  <h3 className="font-semibold">{cat}</h3>
                  <span className="text-xs text-slate-500">
                    {items.length} produit{items.length > 1 ? "s" : ""}
                  </span>
                </div>

                <span
                  className={`text-slate-500 transition-transform duration-200 ${
                    isOpen ? "rotate-180" : ""
                  }`}
                >
                  ▼
                </span>
              </button>

              {isOpen && (
                <div className="space-y-3">
                  {items.map((item) => {
                    const currentStock = stockDraft[item.product_id] ?? 0

                    const isOut = currentStock === 0
                    const isLow =
                      currentStock > 0 &&
                      currentStock <= item.low_stock_threshold

                    const suggestedOrder = 0

                    return (
                      <div
                        key={item.product_id}
                        className="bg-white p-4 rounded-xl shadow space-y-2"
                      >
                        <div className="font-medium flex items-center gap-2 flex-wrap">
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

                        <div className="flex justify-between items-center text-sm gap-4">
                          <span>Stock</span>
                          <input
                            type="number"
                            min="0"
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

                        <div className="flex justify-between items-center text-sm gap-4">
                          <span>Commander</span>
                          <input
                            type="number"
                            min="0"
                            value={orderDraft[item.product_id] ?? suggestedOrder}
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
              )}
            </div>
          )
        })
      )}

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