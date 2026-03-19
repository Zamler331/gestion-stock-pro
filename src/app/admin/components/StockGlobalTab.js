"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function StockGlobalTab() {

  const [loading, setLoading] = useState(true)
  const [locations, setLocations] = useState([])
  const [groupedData, setGroupedData] = useState({})
  const [alerts, setAlerts] = useState({
  out: [],
  low: []
})

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {

    setLoading(true)

    // 1️⃣ Locations
    const { data: locationData } = await supabase
      .from("locations")
      .select("*")
      .order("type", { ascending: false })

    // 2️⃣ Produits + catégories
    const { data: productsData } = await supabase
      .from("products")
      .select(`
        id,
        name,
        categories (
          name
        )
      `)

    /* ========================= */
/* STOCK BATCHES */
/* ========================= */

const { data: batchesData, error: batchesError } = await supabase
  .from("stock_batches")
  .select(`
    quantity,
    location_id,
    product_id,
    expiration_date,
    source_movement_id
  `)

if (batchesError) {
  console.error("Erreur batches:", batchesError)
  return
}

/* ========================= */
/* FILTRAGE */
/* ========================= */

const now = new Date()

const validBatches = batchesData.filter(b => {

  const notExpired =
    !b.expiration_date ||
    new Date(b.expiration_date) > now

  const isActive =
    !b.movements?.effective_date ||
    new Date(b.movements.effective_date) <= now

  return notExpired && isActive
})

/* ========================= */
/* AGRÉGATION */
/* ========================= */

const stockMap = {}

validBatches.forEach(batch => {

  const key = `${batch.product_id}-${batch.location_id}`

  if (!stockMap[key]) {
    stockMap[key] = 0
  }

  stockMap[key] += batch.quantity
})

    // 4️⃣ Seuils
    const { data: thresholdsData } = await supabase
      .from("product_location_settings")
      .select("*")

    const thresholdMap = {}

    thresholdsData?.forEach(t => {
      if (!thresholdMap[t.product_id]) {
        thresholdMap[t.product_id] = []
      }
      thresholdMap[t.product_id].push(t.low_stock_threshold)
    })

    const pivot = {}

    productsData?.forEach(product => {

      const category =
        product.categories?.name || "Sans catégorie"

      if (!pivot[category]) {
        pivot[category] = []
      }

      const row = {
        product_id: product.id,
        name: product.name,
        category,
        quantities: {},
        total: 0,
        globalThreshold: 5,
        isLow: false,
        isOut: false
      }

      locationData?.forEach(loc => {
        const key = `${product.id}-${loc.id}`
        const qty = stockMap[key] || 0

        row.quantities[loc.id] = qty
        row.total += qty
      })

      // seuil global = moyenne des seuils si existants
      if (thresholdMap[product.id]) {
        const avg =
          thresholdMap[product.id].reduce((a, b) => a + b, 0) /
          thresholdMap[product.id].length

        row.globalThreshold = Math.round(avg)
      }

      row.isOut = row.total === 0
      row.isLow =
        row.total > 0 &&
        row.total <= row.globalThreshold

      pivot[category].push(row)
    })
    const outProducts = []
const lowProducts = []

Object.values(pivot).forEach(categoryItems => {
  categoryItems.forEach(item => {
    if (item.isOut) outProducts.push(item)
    else if (item.isLow) lowProducts.push(item)
  })
})

setAlerts({
  out: outProducts,
  low: lowProducts
})

    setLocations(locationData || [])
    setGroupedData(pivot)
    setLoading(false)
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <div className="space-y-12">

  {/* ================= ALERTES GLOBALES ================= */}

  <div className="grid md:grid-cols-2 gap-6">

    {/* Ruptures */}

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
        {alerts.out.slice(0, 5).map(p => (
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


    {/* Sous seuil */}

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
        {alerts.low.slice(0, 5).map(p => (
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


  {/* ================= TABLEAUX PAR CATEGORIE ================= */}

  {Object.entries(groupedData).map(([category, items]) => (

    <div key={category} className="space-y-4">

      <h2 className="text-lg font-semibold text-slate-900">
        {category}
      </h2>

      <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">

        <table className="min-w-full text-sm">

          <thead className="bg-slate-100 text-xs uppercase text-slate-600 tracking-wide">
            <tr>
              <th className="px-4 py-3 text-left">Produit</th>

              {locations.map(loc => (
                <th key={loc.id} className="px-4 py-3 text-center">
                  {loc.name}
                </th>
              ))}

              <th className="px-4 py-3 text-center">Total</th>
              <th className="px-4 py-3 text-center">Seuil Global</th>
            </tr>
          </thead>

          <tbody className="divide-y divide-slate-100">

            {items.map((item) => (

              <tr
                key={item.product_id}
                className="hover:bg-slate-50 transition-colors"
              >

                <td className="px-4 py-3 font-medium text-slate-800 flex items-center gap-2">

                  {item.name}

                  {item.isOut && (
                    <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
                      Rupture
                    </span>
                  )}

                  {!item.isOut && item.isLow && (
                    <span className="text-xs bg-orange-100 text-orange-600 px-2 py-0.5 rounded-full">
                      Sous seuil
                    </span>
                  )}

                </td>

                {locations.map(loc => (
                  <td key={loc.id} className="px-4 py-3 text-center text-slate-700">
                    {item.quantities[loc.id] || 0}
                  </td>
                ))}

                <td className={`px-4 py-3 text-center font-semibold ${
                  item.isOut
                    ? "text-red-700"
                    : item.isLow
                    ? "text-orange-600"
                    : "text-slate-900"
                }`}>
                  {item.total}
                </td>

                <td className="px-4 py-3 text-center text-slate-400">
                  {item.globalThreshold}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>

  ))}

</div>
  )
}