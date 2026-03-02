"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function StockTab({ locationId }) {

  const [rows, setRows] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    if (locationId) fetchStocks()
  }, [locationId])

  async function fetchStocks() {

    setLoading(true)

    // 1️⃣ Récupérer l’ID de la réserve
    const { data: reserve } = await supabase
      .from("locations")
      .select("id")
      .eq("type", "reserve")
      .limit(1)
      .single()

    const reserveId = reserve?.id

    // 2️⃣ Récupérer tous les stocks pôle + réserve
    const { data } = await supabase
      .from("stocks")
      .select(`
        product_id,
        quantity,
        location_id,
        products (
          name
        )
      `)
      .in("location_id", [locationId, reserveId])

    if (!data) {
      setRows([])
      setLoading(false)
      return
    }

    // 3️⃣ Fusion par produit
    const merged = {}

    data.forEach(item => {

      if (!merged[item.product_id]) {
        merged[item.product_id] = {
          name: item.products?.name,
          poleStock: 0,
          reserveStock: 0
        }
      }

      if (item.location_id === locationId) {
        merged[item.product_id].poleStock = item.quantity
      }

      if (item.location_id === reserveId) {
        merged[item.product_id].reserveStock = item.quantity
      }

    })

    setRows(Object.values(merged))
    setLoading(false)
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">

      <h2 className="text-xl font-semibold mb-6">
        Stock détaillé
      </h2>

      {loading && (
        <div className="text-sm text-slate-500">
          Chargement...
        </div>
      )}

      {!loading && rows.length === 0 && (
        <div className="text-sm text-slate-500">
          Aucun stock disponible.
        </div>
      )}

      {!loading && rows.length > 0 && (
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">

            <thead className="bg-slate-100 text-xs uppercase text-slate-600">
              <tr>
                <th className="px-6 py-4 text-left">Produit</th>
                <th className="px-6 py-4 text-center">Stock Pôle</th>
                <th className="px-6 py-4 text-center">Stock Réserve</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">

              {rows.map((row, index) => (

                <tr
                  key={index}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >

                  <td className="px-6 py-4 font-medium text-slate-900">
                    {row.name}
                  </td>

                  <td className="px-6 py-4 text-center font-semibold">
                    {row.poleStock}
                  </td>

                  <td className="px-6 py-4 text-center font-semibold text-slate-500">
                    {row.reserveStock}
                  </td>

                </tr>

              ))}

            </tbody>

          </table>
        </div>
      )}

    </div>
  )
}