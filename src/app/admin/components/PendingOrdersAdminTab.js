"use client"

import { useEffect, useState } from "react"
import { getAllPendingOrders } from "@/lib/services/ordersService"

export default function PendingOrdersAdminTab() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOrders()
  }, [])

  async function fetchOrders() {
    try {
      setLoading(true)
      const data = await getAllPendingOrders()
      setOrders(data)
    } catch (err) {
      console.error(err)
      setOrders([])
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <div className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-semibold text-slate-900">
          Commandes en cours
        </h2>

        <div className="text-sm text-slate-500">
          {orders.length} commande{orders.length > 1 ? "s" : ""}
        </div>
      </div>

      {orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
          Aucune commande en cours
        </div>
      ) : (
        <div className="space-y-4">
          {orders.map((order) => (
            <div
              key={order.id}
              className="bg-white border border-slate-200 rounded-2xl p-5 shadow-sm space-y-4"
            >
              <div className="flex justify-between gap-4 flex-wrap">
                <div>
                  <h3 className="font-semibold text-slate-900">
                    {order.locations?.name || "Pôle inconnu"}
                  </h3>
                  <div className="text-xs text-slate-500">
                    Envoyée le{" "}
                    {new Date(order.created_at).toLocaleString("fr-FR")}
                  </div>
                </div>

                <span className="text-xs bg-orange-100 text-orange-700 px-3 py-1 rounded-full h-fit">
                  En attente
                </span>
              </div>

              <div className="space-y-2">
                {order.order_items?.map((item) => (
                  <div
                    key={item.id}
                    className="flex justify-between text-sm border-t border-slate-100 pt-2"
                  >
                    <div>
                      <span className="font-medium text-slate-800">
                        {item.products?.name || "Produit"}
                      </span>

                      {item.products?.packaging && (
                        <div className="text-xs text-slate-400">
                          {item.products.packaging}
                        </div>
                      )}
                    </div>

                    <span className="font-semibold text-slate-900">
                      x{item.quantity_ordered}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}