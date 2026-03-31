"use client"

import { useState, useEffect, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

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

function compareCategories(catA, catB) {
  const a = catA || "Sans catégorie"
  const b = catB || "Sans catégorie"

  const indexA = CATEGORY_ORDER.indexOf(a)
  const indexB = CATEGORY_ORDER.indexOf(b)

  const aKnown = indexA !== -1
  const bKnown = indexB !== -1

  if (aKnown && bKnown) return indexA - indexB
  if (aKnown) return -1
  if (bKnown) return 1

  return a.localeCompare(b, "fr")
}

export default function OrderCard({ order, onValidated }) {
  const [deliveryQuantities, setDeliveryQuantities] = useState(
    Object.fromEntries(
      order.order_items.map((item) => [item.id, item.quantity_ordered])
    )
  )

  const [selectedReserves, setSelectedReserves] = useState({})
  const [checkedItems, setCheckedItems] = useState({})
  const [openCategories, setOpenCategories] = useState({})
  const [reserves, setReserves] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  const groupedItems = useMemo(() => {
    const grouped = order.order_items.reduce((acc, item) => {
      const category = item.products?.categories?.name || "Sans catégorie"

      if (!acc[category]) acc[category] = []
      acc[category].push(item)

      return acc
    }, {})

    return Object.entries(grouped)
      .sort(([catA], [catB]) => compareCategories(catA, catB))
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) =>
          (a.products?.name || "").localeCompare(b.products?.name || "", "fr")
        ),
      }))
  }, [order.order_items])

  useEffect(() => {
    fetchReserves()
  }, [])

  useEffect(() => {
    const isDesktop =
      typeof window !== "undefined" ? window.innerWidth >= 768 : true

    setOpenCategories((prev) => {
      const next = { ...prev }

      groupedItems.forEach(({ category }) => {
        if (next[category] === undefined) {
          next[category] = isDesktop
        }
      })

      return next
    })
  }, [groupedItems])

  async function fetchReserves() {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "reserve")
      .order("name")

    setReserves(data || [])
  }

  function handleQuantityChange(itemId, value) {
    setDeliveryQuantities((prev) => ({
      ...prev,
      [itemId]: parseInt(value, 10) || 0,
    }))
  }

  function handleReserveChange(itemId, reserveId) {
    setSelectedReserves((prev) => ({
      ...prev,
      [itemId]: reserveId,
    }))
  }

  function toggleCheckedItem(itemId) {
    setCheckedItems((prev) => ({
      ...prev,
      [itemId]: !prev[itemId],
    }))
  }

  function toggleCategory(categoryName) {
    setOpenCategories((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
    }))
  }

  async function validateOrder() {
    try {
      setIsSubmitting(true)
      setError("")

      const {
        data: { user },
      } = await supabase.auth.getUser()

      if (!user) throw new Error("Utilisateur non authentifié")

      const partialItems = []

      for (const item of order.order_items) {
        const deliveredQty = deliveryQuantities[item.id] || 0
        const reserveId = selectedReserves[item.id]

        if (deliveredQty > 0 && !reserveId) {
          throw new Error(`Sélectionnez une réserve pour ${item.products.name}`)
        }

        if (deliveredQty > 0) {
          const { data: reserveStock, error: reserveError } = await supabase
            .from("stocks")
            .select("*")
            .eq("product_id", item.product_id)
            .eq("location_id", reserveId)
            .single()

          if (reserveError || !reserveStock) {
            throw new Error(`Stock introuvable pour ${item.products.name}`)
          }

          if (reserveStock.quantity < deliveredQty) {
            throw new Error(`Stock insuffisant pour ${item.products.name}`)
          }

          await supabase
            .from("stocks")
            .update({
              quantity: reserveStock.quantity - deliveredQty,
            })
            .eq("id", reserveStock.id)

          const { data: poleStock } = await supabase
            .from("stocks")
            .select("*")
            .eq("product_id", item.product_id)
            .eq("location_id", order.destination_location_id)
            .single()

          await supabase
            .from("stocks")
            .update({
              quantity: poleStock.quantity + deliveredQty,
            })
            .eq("id", poleStock.id)

          await supabase.from("movements").insert({
            product_id: item.product_id,
            type: "livraison",
            quantity: deliveredQty,
            source_location_id: reserveId,
            destination_location_id: order.destination_location_id,
            user_id: user.id,
            annotation: `Livraison commande ${order.id}`,
          })
        }

        await supabase
          .from("order_items")
          .update({
            quantity_delivered: deliveredQty,
            status:
              deliveredQty === 0
                ? "cancelled"
                : deliveredQty < item.quantity_ordered
                  ? "partial"
                  : "delivered",
          })
          .eq("id", item.id)

        if (deliveredQty < item.quantity_ordered) {
          partialItems.push({
            name: item.products.name,
            ordered: item.quantity_ordered,
            delivered: deliveredQty,
          })
        }
      }

      if (partialItems.length > 0) {
        const messageContent = `
Livraison partielle pour la commande ${order.id} :

${partialItems.map((p) => `• ${p.name} : ${p.delivered}/${p.ordered}`).join("\n")}
`

        await supabase.from("messages").insert({
          sender_id: user.id,
          receiver_role: "pole",
          location_id: order.destination_location_id,
          content: messageContent,
          type: "system",
        })
      }

      await supabase
        .from("orders")
        .update({
          status: "delivered",
          validated_at: new Date(),
          validated_by: user.id,
        })
        .eq("id", order.id)

      if (onValidated) onValidated()
    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-1">
        <h3 className="font-semibold text-lg text-slate-900">
          {order.locations?.name}
        </h3>
        <p className="text-sm text-slate-500">
          Envoyée le {new Date(order.created_at).toLocaleString("fr-FR")}
        </p>
      </div>

      <div className="space-y-4">
        {groupedItems.map(({ category, items }) => {
          const isOpen = openCategories[category] ?? true

          return (
            <div key={category} className="space-y-3">
              <button
                type="button"
                onClick={() => toggleCategory(category)}
                className="w-full flex items-center justify-between bg-slate-50 px-4 py-3 rounded-xl border border-slate-200 text-left"
              >
                <div className="flex items-center gap-3">
                  <h4 className="font-semibold text-slate-800">{category}</h4>
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
                <div className="space-y-4">
                  {items.map((item) => {
                    const deliveredQty = deliveryQuantities[item.id] || 0
                    const isPartial = deliveredQty < item.quantity_ordered
                    const isChecked = !!checkedItems[item.id]

                    return (
                      <div
                        key={item.id}
                        className={`
                          border rounded-xl p-4 space-y-4 transition-all
                          ${
                            isChecked
                              ? "bg-slate-100 border-slate-300 opacity-70"
                              : "bg-white border-slate-200"
                          }
                        `}
                      >
                        <div className="flex justify-between items-start gap-4">
                          <div className="space-y-2">
                            <div className="font-medium text-slate-800">
                              {item.products.name}
                            </div>

                            <div className="text-sm text-slate-500">
                              Demandé : {item.quantity_ordered}
                            </div>

                            <div className="flex gap-2 flex-wrap">
                              {isPartial && (
                                <Badge variant="warning">
                                  Livraison partielle
                                </Badge>
                              )}

                              {isChecked && (
                                <Badge variant="success">
                                  Traité
                                </Badge>
                              )}
                            </div>
                          </div>

                          <input
                            type="number"
                            min="0"
                            max={item.quantity_ordered}
                            value={deliveredQty}
                            onChange={(e) =>
                              handleQuantityChange(item.id, e.target.value)
                            }
                            className="
                              w-20
                              border border-slate-300
                              rounded-lg
                              p-2
                              text-center
                              text-slate-800
                              focus:outline-none
                              focus:ring-2
                              focus:ring-blue-800
                            "
                          />
                        </div>

                        <select
                          value={selectedReserves[item.id] || ""}
                          onChange={(e) =>
                            handleReserveChange(item.id, e.target.value)
                          }
                          className="
                            border border-slate-300
                            px-3 py-2
                            rounded-lg
                            w-full
                            text-slate-700
                            focus:outline-none
                            focus:ring-2
                            focus:ring-blue-800
                          "
                        >
                          <option value="">Choisir une réserve</option>
                          {reserves.map((reserve) => (
                            <option key={reserve.id} value={reserve.id}>
                              {reserve.name}
                            </option>
                          ))}
                        </select>

                        <button
                          type="button"
                          onClick={() => toggleCheckedItem(item.id)}
                          className={`
                            text-sm font-medium px-3 py-2 rounded-lg border transition-colors
                            ${
                              isChecked
                                ? "bg-slate-800 text-white border-slate-800"
                                : "bg-white text-slate-700 border-slate-300 hover:bg-slate-50"
                            }
                          `}
                        >
                          {isChecked ? "Marqué comme traité" : "Marquer comme traité"}
                        </button>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>

      <Button
        variant="primary"
        onClick={validateOrder}
        disabled={isSubmitting}
        className="w-full"
      >
        {isSubmitting ? "Validation..." : "Valider la commande"}
      </Button>

      {error && <div className="text-red-600 text-sm">{error}</div>}
    </Card>
  )
}