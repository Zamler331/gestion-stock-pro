"use client"

import { useState, useEffect } from "react"
import { supabase } from "@/lib/supabase"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

export default function OrderCard({ order, onValidated }) {

  const [deliveryQuantities, setDeliveryQuantities] = useState(
    Object.fromEntries(
      order.order_items.map(item => [
        item.id,
        item.quantity_ordered
      ])
    )
  )

  const [selectedReserves, setSelectedReserves] = useState({})
  const [reserves, setReserves] = useState([])
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [error, setError] = useState("")

  /* ========================= */
  /* FETCH RESERVES */
  /* ========================= */

  useEffect(() => {
    fetchReserves()
  }, [])

  async function fetchReserves() {
    const { data } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "reserve")
      .order("name")

    setReserves(data || [])
  }

  /* ========================= */
  /* HANDLERS */
  /* ========================= */

  function handleQuantityChange(itemId, value) {
    setDeliveryQuantities(prev => ({
      ...prev,
      [itemId]: parseInt(value) || 0
    }))
  }

  function handleReserveChange(itemId, reserveId) {
    setSelectedReserves(prev => ({
      ...prev,
      [itemId]: reserveId
    }))
  }

  /* ========================= */
  /* VALIDATION */
  /* ========================= */

  async function validateOrder() {

    try {
      setIsSubmitting(true)
      setError("")

      const { data: { user } } = await supabase.auth.getUser()
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
              quantity: reserveStock.quantity - deliveredQty
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
              quantity: poleStock.quantity + deliveredQty
            })
            .eq("id", poleStock.id)

          await supabase.from("movements").insert({
            product_id: item.product_id,
            type: "livraison",
            quantity: deliveredQty,
            source_location_id: reserveId,
            destination_location_id: order.destination_location_id,
            user_id: user.id,
            annotation: `Livraison commande ${order.id}`
          })
        }

        // Mise à jour ligne
        await supabase
          .from("order_items")
          .update({
            quantity_delivered: deliveredQty,
            status:
              deliveredQty === 0
                ? "cancelled"
                : deliveredQty < item.quantity_ordered
                ? "partial"
                : "delivered"
          })
          .eq("id", item.id)

        // Collecter partiels
        if (deliveredQty < item.quantity_ordered) {
          partialItems.push({
            name: item.products.name,
            ordered: item.quantity_ordered,
            delivered: deliveredQty
          })
        }
      }

      // Message unique si partiel
      if (partialItems.length > 0) {

        const messageContent = `
Livraison partielle pour la commande ${order.id} :

${partialItems
  .map(p => `• ${p.name} : ${p.delivered}/${p.ordered}`)
  .join("\n")}
`

        await supabase.from("messages").insert({
          sender_id: user.id,
          receiver_role: "pole",
          location_id: order.destination_location_id,
          content: messageContent,
          type: "system"
        })
      }

      await supabase
        .from("orders")
        .update({
          status: "delivered",
          validated_at: new Date(),
          validated_by: user.id
        })
        .eq("id", order.id)

      // 🔥 SUPPRESSION LOCALE IMMÉDIATE
      if (onValidated) onValidated()

    } catch (err) {
      console.error(err)
      setError(err.message)
    } finally {
      setIsSubmitting(false)
    }
  }

  /* ========================= */
  /* UI */
  /* ========================= */

 return (
  <Card className="p-6 space-y-6">

    {/* HEADER */}
    <div className="space-y-1">
      <h3 className="font-semibold text-lg text-slate-900">
        {order.locations?.name}
      </h3>
      <p className="text-sm text-slate-500">
        Envoyée le {new Date(order.created_at).toLocaleString("fr-FR")}
      </p>
    </div>

    {/* ITEMS */}
    <div className="space-y-4">
      {order.order_items.map(item => {

        const deliveredQty = deliveryQuantities[item.id] || 0
        const isPartial = deliveredQty < item.quantity_ordered

        return (
          <div
            key={item.id}
            className="border border-slate-200 rounded-xl p-4 space-y-4 bg-white"
          >

            <div className="flex justify-between items-start">

              <div className="space-y-1">
                <div className="font-medium text-slate-800">
                  {item.products.name}
                </div>

                <div className="text-sm text-slate-500">
                  Demandé : {item.quantity_ordered}
                </div>

                {isPartial && (
                  <Badge variant="warning">
                    Livraison partielle
                  </Badge>
                )}
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
              {reserves.map(reserve => (
                <option key={reserve.id} value={reserve.id}>
                  {reserve.name}
                </option>
              ))}
            </select>

          </div>
        )
      })}
    </div>

    {/* ACTION */}
    <Button
      variant="primary"
      onClick={validateOrder}
      disabled={isSubmitting}
      className="w-full"
    >
      {isSubmitting ? "Validation..." : "Valider la commande"}
    </Button>

    {/* ERROR */}
    {error && (
      <div className="text-red-600 text-sm">
        {error}
      </div>
    )}

  </Card>
)
}