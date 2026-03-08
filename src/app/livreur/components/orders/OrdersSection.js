"use client"

import { useOrders } from "@/hooks/useOrders"
import OrderCard from "./OrderCard"

export default function OrdersSection({ locationId }) {

  const { orders, loading, refresh } = useOrders(locationId)

  if (loading) {
    return <p>Chargement...</p>
  }

  return (
    <div className="space-y-6">

      {/* HEADER SECTION */}
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900">
          Commandes en attente
        </h2>

        <div className="text-sm text-slate-500">
          {orders.length} commande(s)
        </div>
      </div>

      {/* LISTE */}
      {orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
          Aucune commande en attente
        </div>
      ) : (
        <div className="space-y-6">
          {orders.map(order => (
            <div
              key={order.id}
              className="transition-all duration-200 hover:-translate-y-0.5"
            >
              <OrderCard
                order={order}
                onValidated={refresh}
              />
            </div>
          ))}
        </div>
      )}

    </div>
  )
}