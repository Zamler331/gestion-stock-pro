"use client"

import { useEffect, useState } from "react"
import { getGlobalStockView } from "@/lib/services/stocksService"
import GlobalStockTable from "@/components/stock/GlobalStockTable"

export default function StockGlobalTab() {
  const [loading, setLoading] = useState(true)
  const [alerts, setAlerts] = useState({
    out: [],
    low: [],
  })

  useEffect(() => {
    fetchAlerts()
  }, [])

  async function fetchAlerts() {
    try {
      setLoading(true)

      const data = await getGlobalStockView()
      const products = data?.products || []

      const outProducts = []
      const lowProducts = []

      products.forEach((product) => {
        const locationValues = Object.values(product.locations || {})

        const total = locationValues.reduce(
          (sum, loc) => sum + Number(loc?.quantity || 0),
          0
        )

        const thresholds = locationValues.map((loc) =>
          Number(loc?.threshold ?? 5)
        )

        const globalThreshold =
          thresholds.length > 0
            ? Math.round(
                thresholds.reduce((a, b) => a + b, 0) / thresholds.length
              )
            : 5

        const item = {
          product_id: product.product_id,
          name: product.name,
          total,
          globalThreshold,
          isOut: total === 0,
          isLow: total > 0 && total <= globalThreshold,
        }

        if (item.isOut) outProducts.push(item)
        else if (item.isLow) lowProducts.push(item)
      })

      setAlerts({
        out: outProducts,
        low: lowProducts,
      })
    } catch (err) {
      console.error("Erreur fetchAlerts:", err)
      setAlerts({
        out: [],
        low: [],
      })
    } finally {
      setLoading(false)
    }
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <div className="space-y-12">
      <div className="grid md:grid-cols-2 gap-6">
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
            {alerts.out.slice(0, 5).map((p) => (
              <div key={p.product_id} className="text-red-600">
                • {p.name}
              </div>
            ))}

            {alerts.out.length > 5 && (
              <div className="text-xs text-red-500 pt-2">
                + {alerts.out.length - 5} autres...
              </div>
            )}
          </div>
        </div>

        <div className="bg-white border border-orange-200 rounded-2xl p-6 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h3 className="text-base font-semibold text-orange-600">
              Sous seuil global
            </h3>
            <span className="text-2xl font-semibold text-orange-600">
              {alerts.low.length}
            </span>
          </div>

          <div className="space-y-2 text-sm">
            {alerts.low.slice(0, 5).map((p) => (
              <div key={p.product_id} className="text-orange-600">
                • {p.name}
              </div>
            ))}

            {alerts.low.length > 5 && (
              <div className="text-xs text-orange-500 pt-2">
                + {alerts.low.length - 5} autres...
              </div>
            )}
          </div>
        </div>
      </div>

      <GlobalStockTable editable={true} editableTypes={["pole", "reserve"]} />
    </div>
  )
}