"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"

export default function OrdersTab() {

  const [stocks, setStocks] = useState([])
  const [orderDraft, setOrderDraft] = useState({})
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

    if (data) {
      setMyLocationId(data.location_id)
    }
  }

  /* ========================= */
  /* FETCH STOCK */
  /* ========================= */

  useEffect(() => {
    if (myLocationId) fetchStocks()
  }, [myLocationId])

  async function fetchStocks() {

    const { data: stockData, error } = await supabase
      .from("stocks")
      .select(`
        id,
        quantity,
        product_id,
        products:product_id (
          id,
          name,
          packaging,
          categories (
            name
          )
        )
      `)
      .eq("location_id", myLocationId)

    if (error) {
      console.error("Erreur stocks :", error)
      setStocks([])
      return
    }

    const { data: thresholds } = await supabase
      .from("product_location_settings")
      .select("product_id, low_stock_threshold")
      .eq("location_id", myLocationId)

    const thresholdMap =
      thresholds?.reduce((acc, t) => {
        acc[t.product_id] = t.low_stock_threshold
        return acc
      }, {}) || {}

    const merged = stockData.map(stock => {

      const threshold = thresholdMap[stock.product_id] ?? 5

      const isOut = stock.quantity === 0
      const isLow =
        stock.quantity > 0 &&
        stock.quantity <= threshold

      return {
        ...stock,
        low_stock_threshold: threshold,
        isOut,
        isLow
      }
    })

    setStocks(merged)
  }

  /* ========================= */
  /* FILTERING */
  /* ========================= */

  const filteredStocks = useMemo(() => {

    return stocks
      .filter(item =>
        item.products.name
          .toLowerCase()
          .includes(search.toLowerCase())
      )
      .filter(item => {
        if (alertFilter === "low") return item.isLow
        if (alertFilter === "out") return item.isOut
        return true
      })

  }, [stocks, search, alertFilter])

  const lowStockCount = stocks.filter(s => s.isLow).length
  const outOfStockCount = stocks.filter(s => s.isOut).length

  /* ========================= */
  /* GROUP BY CATEGORY */
  /* ========================= */

  const groupedStocks = useMemo(() => {

    return filteredStocks.reduce((acc, item) => {

      const category =
        item.products.categories?.name ||
        "Sans catégorie"

      if (!acc[category]) acc[category] = []
      acc[category].push(item)

      return acc

    }, {})

  }, [filteredStocks])

  /* ========================= */
  /* ORDER HANDLING */
  /* ========================= */

  function updateOrder(productId, value) {

    setOrderDraft(prev => ({
      ...prev,
      [productId]: parseInt(value) || 0
    }))
  }

  async function handleBulkOrder() {

    try {

      if (!myLocationId) {
        setMessage("Erreur : localisation inconnue")
        return
      }

      setIsSubmitting(true)
      setMessage("")

      const itemsToOrder = Object.entries(orderDraft)
        .filter(([_, qty]) => parseInt(qty) > 0)
        .map(([productId, qty]) => ({
          product_id: productId,
          quantity_ordered: parseInt(qty)
        }))

      if (itemsToOrder.length === 0) {
        setMessage("Aucun produit sélectionné")
        return
      }

      const { data: order, error: orderError } = await supabase
        .from("orders")
        .insert({
          destination_location_id: myLocationId
        })
        .select()
        .single()

      if (orderError) throw orderError

      const itemsPayload = itemsToOrder.map(item => ({
        order_id: order.id,
        product_id: item.product_id,
        quantity_ordered: item.quantity_ordered
      }))

      const { error: itemsError } = await supabase
        .from("order_items")
        .insert(itemsPayload)

      if (itemsError) throw itemsError

      setOrderDraft({})
      setMessage("Commande envoyée avec succès")

      await fetchStocks()

    } catch (error) {

      console.error(error)
      setMessage("Erreur lors de l'envoi")

    } finally {

      setIsSubmitting(false)

    }
  }

  function FilterButton({ label, active, onClick, type }) {

  const base =
    "px-4 py-2 rounded-lg text-sm font-medium transition-colors"

  const styles = {
    default: active
      ? "bg-slate-900 text-white"
      : "bg-white border border-slate-300 text-slate-700 hover:bg-slate-100",

    warning: active
      ? "bg-orange-600 text-white"
      : "bg-orange-50 text-orange-700 border border-orange-200 hover:bg-orange-100",

    danger: active
      ? "bg-red-600 text-white"
      : "bg-red-50 text-red-700 border border-red-200 hover:bg-red-100"
  }

  return (
    <button
      onClick={onClick}
      className={`${base} ${styles[type || "default"]}`}
    >
      {label}
    </button>
  )
}

  /* ========================= */
  /* UI */
  /* ========================= */

  return (
    <div className="space-y-10">

      <h2 className="text-2xl font-semibold text-slate-900">
        Commander des produits
      </h2>

      <div className="flex gap-3 flex-wrap">

        <FilterButton
          label="Tous"
          active={alertFilter === "all"}
          onClick={() => setAlertFilter("all")}
        />

        {lowStockCount > 0 && (
          <FilterButton
            label={`${lowStockCount} sous seuil`}
            active={alertFilter === "low"}
            onClick={() => setAlertFilter("low")}
            type="warning"
          />
        )}

        {outOfStockCount > 0 && (
          <FilterButton
            label={`${outOfStockCount} rupture`}
            active={alertFilter === "out"}
            onClick={() => setAlertFilter("out")}
            type="danger"
          />
        )}

      </div>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit..."
        className="border border-slate-300 px-4 py-2 rounded-lg w-80 text-sm"
      />

      {Object.entries(groupedStocks || {}).map(([category, items]) => (

        <div key={category} className="space-y-4">

          <h3 className="font-semibold text-lg text-slate-800">
            {category}
          </h3>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

            <table className="min-w-full text-sm">

              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-6 py-4 text-left">Produit</th>
                  <th className="px-6 py-4 text-center">Stock</th>
                  <th className="px-6 py-4 text-center">Seuil</th>
                  <th className="px-6 py-4 text-center">Commander</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">

                {items.map((item, index) => (

                  <tr
                    key={item.product_id}
                    className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                  >

                    <td className="px-6 py-4 font-medium text-slate-900">

                      {item.products.name}

                      {item.products.packaging && (
                        <div className="text-xs text-slate-400 mt-1">
                          {item.products.packaging}
                        </div>
                      )}

                    </td>

                    <td className="px-6 py-4 text-center font-semibold">
                      {item.quantity}
                    </td>

                    <td className="px-6 py-4 text-center text-slate-400">
                      {item.low_stock_threshold}
                    </td>

                    <td className="px-6 py-4 text-center">

                      <input
                        type="number"
                        min="0"
                        value={orderDraft[item.product_id] || ""}
                        onChange={(e) =>
                          updateOrder(item.product_id, e.target.value)
                        }
                        className="w-20 border border-slate-300 rounded-lg p-2 text-center text-sm"
                      />

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </div>

      ))}

      <button
        onClick={handleBulkOrder}
        disabled={isSubmitting}
        className="bg-slate-900 text-white px-6 py-2 rounded-lg"
      >
        {isSubmitting ? "Envoi..." : "Valider la commande"}
      </button>

      {message && (
        <p className="text-sm text-slate-600">
          {message}
        </p>
      )}

    </div>
  )
}