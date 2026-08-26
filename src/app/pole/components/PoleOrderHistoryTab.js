"use client"

import { useEffect, useState } from "react"
import PendingOrderHistoryCard from "@/components/orders/PendingOrderHistoryCard"
import ValidatedOrderHistoryCard from "@/components/orders/ValidatedOrderHistoryCard"
import { updatePendingOrderAtomic } from "@/lib/services/atomicStockService"
import {
  getPendingOrderHistory,
  getValidatedOrders,
} from "@/lib/services/orderHistoryService"

const HISTORY_PAGE_SIZE = 25

const HISTORY_VIEWS = [
  { id: "pending", label: "En cours" },
  { id: "delivered", label: "Livrées" },
]

function historyFetcher(view) {
  return view === "pending" ? getPendingOrderHistory : getValidatedOrders
}

export default function PoleOrderHistoryTab({ locationId }) {
  const [activeView, setActiveView] = useState("pending")
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState("")

  useEffect(() => {
    if (!locationId) return undefined

    let cancelled = false

    async function loadHistory() {
      try {
        const result = await historyFetcher(activeView)({
          destinationLocationId: locationId,
          limit: HISTORY_PAGE_SIZE,
        })

        if (!cancelled) {
          setOrders(result.orders)
          setHasMore(result.hasMore)
        }
      } catch (loadError) {
        console.error(loadError)
        if (!cancelled) {
          setError(loadError.message || "Impossible de charger l'historique")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [activeView, locationId])

  function selectView(view) {
    if (view === activeView) return

    setActiveView(view)
    setOrders([])
    setHasMore(false)
    setError("")
    setLoading(true)
  }

  async function loadMore() {
    try {
      setLoadingMore(true)
      setError("")
      const result = await historyFetcher(activeView)({
        destinationLocationId: locationId,
        limit: HISTORY_PAGE_SIZE,
        offset: orders.length,
      })

      setOrders((current) => [...current, ...result.orders])
      setHasMore(result.hasMore)
    } catch (loadError) {
      console.error(loadError)
      setError(loadError.message || "Impossible de charger la suite")
    } finally {
      setLoadingMore(false)
    }
  }

  async function savePendingOrder(order, items) {
    if (!navigator.onLine) {
      throw new Error("Connexion requise pour modifier une commande")
    }

    await updatePendingOrderAtomic({ orderId: order.id, items })

    const quantitiesByItem = Object.fromEntries(
      items.map((item) => [item.item_id, item.quantity_ordered])
    )

    setOrders((current) =>
      current.map((currentOrder) =>
        currentOrder.id === order.id
          ? {
              ...currentOrder,
              order_items: currentOrder.order_items.map((item) => ({
                ...item,
                quantity_ordered: quantitiesByItem[item.id],
                quantity_delivered: 0,
              })),
            }
          : currentOrder
      )
    )

    window.dispatchEvent(new Event("ordersSynced"))
  }

  return (
    <section className="space-y-6">
      <div>
        <h2 className="text-xl font-semibold text-slate-900">
          Historique des commandes
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Les commandes en cours restent modifiables jusqu&apos;au début de leur
          préparation. Les commandes livrées sont conservées en lecture seule.
        </p>
      </div>

      <div className="flex gap-2 border-b border-slate-300 pb-2">
        {HISTORY_VIEWS.map((view) => (
          <button
            key={view.id}
            type="button"
            onClick={() => selectView(view.id)}
            className={`rounded-xl px-4 py-2 text-sm font-medium transition-all ${
              activeView === view.id
                ? "bg-blue-800 text-white shadow-sm"
                : "bg-white text-slate-600 hover:bg-slate-50"
            }`}
          >
            {view.label}
          </button>
        ))}
      </div>

      {error && (
        <div
          role="alert"
          className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700"
        >
          {error}
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          Chargement de l&apos;historique...
        </div>
      ) : orders.length === 0 ? (
        <div className="rounded-2xl border border-slate-200 bg-white p-8 text-center text-slate-500">
          {activeView === "pending"
            ? "Aucune commande en cours"
            : "Aucune commande livrée"}
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) =>
            activeView === "pending" ? (
              <PendingOrderHistoryCard
                key={order.id}
                order={order}
                onSave={savePendingOrder}
              />
            ) : (
              <ValidatedOrderHistoryCard key={order.id} order={order} />
            )
          )}

          {hasMore && (
            <div className="flex justify-center pt-2">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-sm font-semibold text-slate-700 transition-colors hover:bg-slate-50 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {loadingMore ? "Chargement..." : "Afficher plus"}
              </button>
            </div>
          )}
        </div>
      )}
    </section>
  )
}
