"use client"

import { useEffect, useState } from "react"
import ValidatedOrderHistoryCard from "@/components/orders/ValidatedOrderHistoryCard"
import { reopenDeliveredOrderAtomic } from "@/lib/services/atomicStockService"
import { getValidatedOrders } from "@/lib/services/orderHistoryService"

const HISTORY_PAGE_SIZE = 25

export default function DeliveryHistoryTab({ onOrderReopened = null }) {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)
  const [loadingMore, setLoadingMore] = useState(false)
  const [hasMore, setHasMore] = useState(false)
  const [error, setError] = useState("")
  const [reopeningOrderId, setReopeningOrderId] = useState("")

  useEffect(() => {
    let cancelled = false

    async function loadHistory() {
      try {
        const result = await getValidatedOrders({ limit: HISTORY_PAGE_SIZE })
        if (!cancelled) {
          setOrders(result.orders)
          setHasMore(result.hasMore)
        }
      } catch (err) {
        console.error(err)
        if (!cancelled) {
          setError(err.message || "Impossible de charger l'historique")
        }
      } finally {
        if (!cancelled) setLoading(false)
      }
    }

    loadHistory()

    return () => {
      cancelled = true
    }
  }, [])

  async function loadMore() {
    try {
      setLoadingMore(true)
      setError("")
      const result = await getValidatedOrders({
        limit: HISTORY_PAGE_SIZE,
        offset: orders.length,
      })
      setOrders((currentOrders) => [...currentOrders, ...result.orders])
      setHasMore(result.hasMore)
    } catch (err) {
      console.error(err)
      setError(err.message || "Impossible de charger la suite de l'historique")
    } finally {
      setLoadingMore(false)
    }
  }

  async function reopenOrder(order) {
    const confirmed = window.confirm(
      `Annuler la validation de la commande pour ${
        order.locations?.name || "ce pôle"
      } ? Les stocks seront compensés et la commande repassera en attente.`
    )

    if (!confirmed) return

    try {
      setError("")
      setReopeningOrderId(order.id)
      await reopenDeliveredOrderAtomic({ orderId: order.id })
      setOrders((currentOrders) =>
        currentOrders.filter((currentOrder) => currentOrder.id !== order.id)
      )

      if (onOrderReopened) {
        onOrderReopened(order.id)
      }
    } catch (err) {
      console.error(err)
      setError(err.message || "Impossible d'annuler cette validation")
    } finally {
      setReopeningOrderId("")
    }
  }

  return (
    <section className="space-y-6">
      <div className="flex flex-col gap-2 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h2 className="text-xl font-semibold text-slate-900">
            Historique des commandes validées
          </h2>
          <p className="mt-1 text-sm text-slate-500">
            Consultez les quantités réellement livrées ou rouvrez une commande
            pour les corriger.
          </p>
        </div>

        {!loading && (
          <span className="text-sm text-slate-500">
            {orders.length} commande{orders.length > 1 ? "s" : ""}
          </span>
        )}
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
          Aucune commande validée
        </div>
      ) : (
        <div className="space-y-5">
          {orders.map((order) => (
            <ValidatedOrderHistoryCard
              key={order.id}
              order={order}
              actionLabel="Annuler et modifier"
              actionPending={reopeningOrderId === order.id}
              onAction={reopenOrder}
            />
          ))}

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
