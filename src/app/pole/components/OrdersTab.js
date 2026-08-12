"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { addToQueue } from "@/lib/offline/offlineQueue"
import { submitPoleInventoryAndOrders } from "@/lib/services/atomicStockService"

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
  const [pendingQuantities, setPendingQuantities] = useState({})

  useEffect(() => {
    fetchMyLocation()
  }, [])

  useEffect(() => {
  if (myLocationId) {
    fetchStocks()
    fetchPendingQuantities()
  }
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

  async function fetchPendingQuantities() {
  const { data, error } = await supabase
    .from("orders")
    .select(`
      id,
      order_items (
        product_id,
        quantity_ordered
      )
    `)
    .eq("destination_location_id", myLocationId)
    .eq("status", "pending")

  if (error) {
    console.error("Erreur commandes en cours :", error)
    setPendingQuantities({})
    return
  }

  const map = {}

  data?.forEach((order) => {
    order.order_items?.forEach((item) => {
      map[item.product_id] =
        (map[item.product_id] || 0) + Number(item.quantity_ordered || 0)
    })
  })

  setPendingQuantities(map)
}

  async function fetchStocks() {
    try {
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

      const { data: levels, error: levelsError } = await supabase
        .from("current_stock_levels")
        .select("product_id, quantity")
        .eq("location_id", myLocationId)
        .in("product_id", filteredProductIds)

      if (levelsError) throw levelsError
      const levelMap = Object.fromEntries(
        (levels || []).map((level) => [level.product_id, Number(level.quantity || 0)])
      )

      const finalData = filteredProductIds.map((productId) => {
        const totalQty = levelMap[productId] || 0

        return {
          product_id: productId,
          quantity: totalQty,
          products: productMap[productId],
          isOut: totalQty === 0,
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

  function getOrdersByCategory() {
    const ordersByCategory = {}

    stocks.forEach((stock) => {
      const quantity = Number(orderDraft[stock.product_id] ?? 0)
      if (quantity <= 0) return

      const category =
        stock.products?.categories?.name || "Sans catégorie"

      if (!ordersByCategory[category]) {
        ordersByCategory[category] = []
      }

      ordersByCategory[category].push({
        product_id: stock.product_id,
        quantity_ordered: quantity,
      })
    })

    return ordersByCategory
  }

  function getStockAdjustments() {
    return stocks.flatMap((stock) => {
      const newQty = Number(stockDraft[stock.product_id] ?? 0)
      const oldQty = Number(stock.quantity ?? 0)

      if (newQty === oldQty) return []

      if (newQty < 0) {
        throw new Error(
          `Le stock ne peut pas être négatif pour ${
            stock.products?.name || "un produit"
          }`
        )
      }

      return [{ product_id: stock.product_id, target_quantity: newQty }]
    })
  }

  async function handleValidate() {
    try {
      setIsSubmitting(true)
      setMessage("")

      const adjustments = getStockAdjustments()
      const orderGroups = Object.values(getOrdersByCategory())

      if (adjustments.length === 0 && orderGroups.length === 0) {
        setMessage("Aucune modification à valider")
        return
      }

      let updatedCount = adjustments.length
      let ordersCount = orderGroups.length

      if (!navigator.onLine) {
        if (adjustments.length > 0) {
          throw new Error("Connexion requise pour valider un inventaire")
        }
        for (const items of orderGroups) {
          await addToQueue({
            type: "order",
            destination_location_id: myLocationId,
            items,
          })
        }
      } else {
        const result = await submitPoleInventoryAndOrders({
          locationId: myLocationId,
          adjustments,
          orderGroups,
        })
        updatedCount = Number(result?.updated_count || 0)
        ordersCount = Number(result?.orders_count || 0)
      }

      setMessage(
        `${updatedCount > 0 ? "Stock mis à jour" : "Aucun stock modifié"} + ${
          ordersCount > 0
            ? `${ordersCount} commande${ordersCount > 1 ? "s" : ""} créée${
                ordersCount > 1 ? "s" : ""
              }`
            : "aucune commande créée"
        } ✅`
      )

      setOrderDraft({})
      await fetchStocks()
      await fetchPendingQuantities()
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
                    const pendingQty = pendingQuantities[item.product_id] || 0

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
                        <span>En commande</span>
                        <span>{pendingQty}</span>
                        </div>

                        <div className="flex justify-between items-center text-sm gap-4">
                          <span>Commander</span>
                          <input
                            type="number"
                            min="0"
                            value={orderDraft[item.product_id] ?? 0}
                            onChange={(e) =>
                              updateOrder(item.product_id, e.target.value)
                            }
                            className="w-20 border rounded text-center"
                          />
                        </div>
                      </div>
                    )
                  })}

                  <button
                    type="button"
                    onClick={handleValidate}
                    disabled={isSubmitting}
                    className="w-full bg-slate-900 text-white px-4 py-2 rounded-lg text-sm"
                  >
                    {isSubmitting
                      ? "Validation..."
                      : "Valider les commandes remplies"}
                  </button>
                </div>
              )}
            </div>
          )
        })
      )}

      {message && <div>{message}</div>}
    </div>
  )
}
