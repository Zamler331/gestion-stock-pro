"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function ThresholdsTab() {

  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [poles, setPoles] = useState([])
  const [thresholds, setThresholds] = useState({})
  const [saving, setSaving] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {

    setLoading(true)

    const { data: productData } = await supabase
      .from("products")
      .select("id, name")
      .order("name")

    const { data: poleData } = await supabase
      .from("locations")
      .select("id, name")
      .eq("type", "pole")
      .order("name")

    const { data: thresholdsData } = await supabase
      .from("product_location_settings")
      .select("*")

    const map = {}

    thresholdsData?.forEach(t => {
      if (!map[t.product_id]) {
        map[t.product_id] = {}
      }
      map[t.product_id][t.location_id] = t.low_stock_threshold
    })

    setProducts(productData || [])
    setPoles(poleData || [])
    setThresholds(map)
    setLoading(false)
  }

  function updateThreshold(productId, locationId, value) {

    setThresholds(prev => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [locationId]: parseInt(value) || 0
      }
    }))
  }

  async function saveThreshold(productId, locationId) {

    if (saving) return
    setSaving(true)

    const value = thresholds[productId]?.[locationId] || 0

    const { data: existing } = await supabase
      .from("product_location_settings")
      .select("*")
      .eq("product_id", productId)
      .eq("location_id", locationId)
      .single()

    if (existing) {
      await supabase
        .from("product_location_settings")
        .update({ low_stock_threshold: value })
        .eq("id", existing.id)
    } else {
      await supabase
        .from("product_location_settings")
        .insert([{
          product_id: productId,
          location_id: locationId,
          low_stock_threshold: value
        }])
    }

    setSaving(false)
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
  <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">

    <table className="min-w-full text-sm">

      <thead className="bg-slate-100 text-xs uppercase text-slate-600 tracking-wide">
        <tr>
          <th className="px-4 py-3 text-left">Produit</th>

          {poles.map(pole => (
            <th key={pole.id} className="px-4 py-3 text-center">
              {pole.name}
            </th>
          ))}

        </tr>
      </thead>

      <tbody className="divide-y divide-slate-100">

        {products.map(product => (

          <tr
            key={product.id}
            className="hover:bg-slate-50 transition-colors"
          >

            <td className="px-4 py-3 font-medium text-slate-800">
              {product.name}
            </td>

            {poles.map(pole => (

              <td
                key={pole.id}
                className="px-4 py-3 text-center"
              >

                <input
                  type="number"
                  min="0"
                  value={
                    thresholds[product.id]?.[pole.id] ?? ""
                  }
                  onChange={(e) =>
                    updateThreshold(
                      product.id,
                      pole.id,
                      e.target.value
                    )
                  }
                  onBlur={() =>
                    saveThreshold(product.id, pole.id)
                  }
                  className="
                    w-20
                    border border-slate-300
                    rounded-lg
                    px-2 py-1.5
                    text-center
                    text-sm
                    focus:outline-none
                    focus:ring-2
                    focus:ring-slate-400
                  "
                />

              </td>

            ))}

          </tr>
        ))}

      </tbody>

    </table>

  </div>
)
}