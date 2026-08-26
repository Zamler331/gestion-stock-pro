"use client"

import { useMemo, useState } from "react"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"

function formatDate(value) {
  if (!value) return "Date inconnue"

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

function quantitiesFromOrder(order) {
  return Object.fromEntries(
    (order.order_items || []).map((item) => [
      item.id,
      String(item.quantity_ordered || 1),
    ])
  )
}

export default function PendingOrderHistoryCard({ order, onSave }) {
  const [quantities, setQuantities] = useState(() => quantitiesFromOrder(order))
  const [savedQuantities, setSavedQuantities] = useState(() =>
    quantitiesFromOrder(order)
  )
  const [saving, setSaving] = useState(false)
  const [message, setMessage] = useState("")

  const sortedItems = useMemo(
    () => [...(order.order_items || [])].sort((a, b) =>
      (a.products?.name || "").localeCompare(
        b.products?.name || "",
        "fr",
        { sensitivity: "base", numeric: true }
      )
    ),
    [order.order_items]
  )

  const preparationStarted = order.order_items?.some(
    (item) => item.is_prepared
  )
  const hasChanges = sortedItems.some(
    (item) => quantities[item.id] !== savedQuantities[item.id]
  )
  const hasInvalidQuantity = sortedItems.some((item) => {
    const quantity = Number(quantities[item.id])
    return !Number.isInteger(quantity) || quantity <= 0
  })

  function changeQuantity(itemId, value) {
    setQuantities((current) => ({ ...current, [itemId]: value }))
    setMessage("")
  }

  async function saveOrder() {
    if (hasInvalidQuantity || !hasChanges || preparationStarted) return

    try {
      setSaving(true)
      setMessage("")
      const items = sortedItems.map((item) => ({
        item_id: item.id,
        quantity_ordered: Number(quantities[item.id]),
      }))

      await onSave(order, items)
      setSavedQuantities({ ...quantities })
      setMessage("Commande mise à jour ✅")
    } catch (error) {
      console.error(error)
      setMessage(error.message || "Impossible de modifier la commande")
    } finally {
      setSaving(false)
    }
  }

  return (
    <Card className="space-y-5 p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">
            Commande du {formatDate(order.created_at)}
          </h3>
          <p className="text-sm text-slate-500">
            Modifiez les quantités tant que la préparation n&apos;a pas commencé.
          </p>
        </div>

        <span className="w-fit rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-800">
          {preparationStarted ? "En préparation" : "En cours"}
        </span>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="grid grid-cols-[minmax(0,1fr)_6rem] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
          <span>Produit</span>
          <span className="text-center">Quantité</span>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedItems.map((item) => (
            <div
              key={item.id}
              className="grid grid-cols-[minmax(0,1fr)_6rem] items-center gap-3 px-4 py-3"
            >
              <span className="truncate text-sm font-medium text-slate-800">
                {item.products?.name || "Produit inconnu"}
              </span>
              <input
                type="number"
                min="1"
                step="1"
                value={quantities[item.id] ?? ""}
                onChange={(event) => changeQuantity(item.id, event.target.value)}
                disabled={saving || preparationStarted}
                aria-label={`Quantité de ${item.products?.name || "ce produit"}`}
                className="w-full rounded-lg border border-slate-300 px-2 py-2 text-center text-slate-800 focus:outline-none focus:ring-2 focus:ring-blue-800 disabled:bg-slate-100"
              />
            </div>
          ))}
        </div>
      </div>

      {hasInvalidQuantity && (
        <p className="text-sm text-red-600">
          Chaque quantité doit être un nombre entier supérieur à zéro.
        </p>
      )}

      {preparationStarted && (
        <p className="text-sm text-amber-700">
          Le livreur a commencé la préparation : cette commande ne peut plus
          être modifiée.
        </p>
      )}

      <Button
        type="button"
        onClick={saveOrder}
        disabled={
          saving || preparationStarted || hasInvalidQuantity || !hasChanges
        }
        className="w-full sm:w-auto"
      >
        {saving ? "Enregistrement..." : "Enregistrer les modifications"}
      </Button>

      {message && (
        <p
          className={`text-sm ${
            message.includes("✅") ? "text-emerald-700" : "text-red-600"
          }`}
        >
          {message}
        </p>
      )}
    </Card>
  )
}
