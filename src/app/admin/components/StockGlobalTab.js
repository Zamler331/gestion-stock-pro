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
    fetchAlerts()
  }, [])

  async function fetchAlerts() {
    try {
      setLoading(true)

      const data = await getGlobalStockView()
      const products = data?.products || []

      const outProducts = []

      products.forEach((product) => {
        const locationValues = Object.values(product.locations || {})

        const total = locationValues.reduce(
          (sum, loc) => sum + Number(loc?.quantity || 0),
          0
        )

        const item = {
          product_id: product.product_id,
          name: product.name,
          total,
          isOut: total === 0,
        }

        if (item.isOut) outProducts.push(item)
      })

      setAlerts({
        out: outProducts,
      })
    } catch (err) {
      console.error("Erreur fetchAlerts:", err)
      setAlerts({
        out: [],
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