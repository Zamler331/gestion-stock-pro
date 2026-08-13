"use client"

import { useEffect, useState } from "react"
import { getGlobalStockView } from "@/lib/services/stocksService"
import GlobalStockTable from "@/components/stock/GlobalStockTable"

export default function StockGlobalTab() {
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState({
    out: [],
  })

  useEffect(() => {
    let cancelled = false

    getGlobalStockView()
      .then((data) => {
        if (cancelled) return
        const products = data?.products || []
        const outProducts = products.filter((product) => {
          const total = Object.values(product.locations || {}).reduce(
            (sum, loc) => sum + Number(loc?.quantity || 0),
            0
          )
          return total === 0
        })

        setAlerts({
          out: outProducts.map((product) => ({
            product_id: product.product_id,
            name: product.name,
          })),
        })
      })
      .catch((err) => {
        if (cancelled) return
        console.error("Erreur fetchAlerts:", err)
        setAlerts({ out: [] })
      })
      .finally(() => {
        if (!cancelled) setLoading(false)
      })

    return () => {
      cancelled = true
    }
  }, [])

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <div className="space-y-12">
      <div className="rounded-2xl border border-blue-200 bg-blue-50 p-5 text-sm text-blue-900">
        <div className="font-semibold">Correction manuelle des stocks</div>
        <p className="mt-1 text-blue-800">
          Modifiez directement une quantité, notamment dans les colonnes des
          réserves, puis validez la ligne. Toutes les modifications de la ligne
          sont enregistrées ensemble ou annulées ensemble en cas d&apos;erreur.
        </p>
      </div>

      <div className="grid md:grid-cols-1 gap-6">
        <div className="bg-white border border-red-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-red-700">
              Ruptures globales
            </h3>
            <span className="text-2xl font-semibold text-red-700">
              {alerts.out.length}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            {alerts.out.length === 0 ? (
              <div className="text-slate-500">
                Aucun produit en rupture globale.
              </div>
            ) : (
              alerts.out.slice(0, 5).map((p) => (
                <div key={p.product_id} className="text-red-600">
                  • {p.name}
                </div>
              ))
            )}

            {alerts.out.length > 5 && (
              <div className="text-xs text-red-500 pt-2">
                + {alerts.out.length - 5} autres...
              </div>
            )}
          </div>
        </div>
      </div>

      <GlobalStockTable editable={true} editableTypes={["pole", "reserve"]} />
    </div>
  )
}
