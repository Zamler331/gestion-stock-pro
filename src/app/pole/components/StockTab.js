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

    try {

      setLoading(true)

      const { data: reserves, error: reserveError } = await supabase
        .from("locations")
        .select("id")
        .eq("type", "reserve")

      if (reserveError) {
        console.error("Erreur reserves :", reserveError)
        return
      }

      const reserveIds = reserves?.map(r => r.id) || []
      const reserveSet = new Set(reserveIds)

      const { data, error } = await supabase
        .from("stocks")
        .select(`
          product_id,
          quantity,
          location_id,
          products:product_id (
            name,
            packaging
          )
        `)
        .in("location_id", [locationId, ...reserveIds])

      if (error) {
        console.error("Erreur stocks :", error)
        setRows([])
        return
      }

      const merged = {}

      data.forEach(item => {

        if (!merged[item.product_id]) {
          merged[item.product_id] = {
            name: item.products?.name,
            packaging: item.products?.packaging,
            poleStock: 0,
            reserveStock: 0
          }
        }

        if (item.location_id === locationId) {
          merged[item.product_id].poleStock = item.quantity
        }

        if (reserveSet.has(item.location_id)) {
          merged[item.product_id].reserveStock += item.quantity
        }

      })

      setRows(Object.values(merged))

    } catch (err) {

      console.error("Erreur fetchStocks :", err)

    } finally {

      setLoading(false)

    }
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
                <th className="px-6 py-4 text-center">Stock Réserves</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">

              {rows.map((row, index) => (

                <tr
                  key={index}
                  className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                >

                  <td className="px-6 py-4 text-slate-900">

                    <div className="font-medium">
                      {row.name}
                    </div>

                    {row.packaging && (
                      <div className="text-xs text-slate-400 mt-1">
                        {row.packaging}
                      </div>
                    )}

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