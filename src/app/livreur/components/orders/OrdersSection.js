"use client"

import { useEffect, useMemo, useState } from "react"
import { useOrders } from "@/hooks/useOrders"
import OrderCard from "./OrderCard"

export default function OrdersSection({ locationId }) {
  const POLE_ORDER = [
  "Taverne",
  "Aquatico",
  "Bar Expo",
  "Café du Théâtre",
  "Sandwicherie",
  "Bataille d’eau",
]
  const { orders, loading, refresh } = useOrders(locationId)
  const [activePole, setActivePole] = useState("")

  const groupedOrders = useMemo(() => {
    return orders.reduce((acc, order) => {
      const poleName = order.locations?.name || "Sans pôle"

      if (!acc[poleName]) acc[poleName] = []
      acc[poleName].push(order)

      return acc
    }, {})
  }, [orders])

  const poleNames = useMemo(() => {
  const names = Object.keys(groupedOrders)

  return names.sort((a, b) => {
    const indexA = POLE_ORDER.indexOf(a)
    const indexB = POLE_ORDER.indexOf(b)

    const aKnown = indexA !== -1
    const bKnown = indexB !== -1

    if (aKnown && bKnown) return indexA - indexB
    if (aKnown) return -1
    if (bKnown) return 1

    return a.localeCompare(b, "fr")
  })
}, [groupedOrders])

  useEffect(() => {
    if (!activePole && poleNames.length > 0) {
      setActivePole(poleNames[0])
      return
    }

    if (activePole && !poleNames.includes(activePole)) {
      setActivePole(poleNames[0] || "")
    }
  }, [poleNames, activePole])

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

      {orders.length === 0 ? (
        <div className="bg-white border border-slate-200 rounded-2xl p-8 text-center text-slate-500">
          Aucune commande en attente
        </div>
      ) : (
        <>
          {/* ONGLETS PÔLES */}
          <div className="border-b border-slate-300">
            <div className="flex gap-3 flex-wrap">
              {poleNames.map((poleName) => {
                const isActive = activePole === poleName
                const count = groupedOrders[poleName]?.length || 0

                return (
                  <button
                    key={poleName}
                    type="button"
                    onClick={() => setActivePole(poleName)}
                    className={`
                      px-4 py-2 text-sm font-medium rounded-xl transition-all
                      ${
                        isActive
                          ? "bg-blue-800 text-white shadow-sm"
                          : "text-slate-600 bg-white hover:bg-slate-50 border border-slate-200"
                      }
                    `}
                  >
                    {poleName} ({count})
                  </button>
                )
              })}
            </div>
          </div>

          {/* CONTENU ONGLET ACTIF */}
          <div className="space-y-6">
            {(groupedOrders[activePole] || []).map((order) => (
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
        </>
      )}
    </div>
  )
}