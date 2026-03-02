"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function StockTab({ locationId }) {

  const [stocks, setStocks] = useState([])

  useEffect(() => {
    if (locationId) fetchStocks()
  }, [locationId])

  async function fetchStocks() {

    const { data } = await supabase
      .from("stocks")
      .select(`
        quantity,
        products (
          name
        )
      `)
      .eq("location_id", locationId)

    setStocks(data || [])
  }

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6">

      <h2 className="text-xl font-semibold mb-4">
        Stock actuel
      </h2>

      {stocks.map((item, index) => (
        <div
          key={index}
          className="flex justify-between border-b py-2 text-sm"
        >
          <span>{item.products.name}</span>
          <span className="font-semibold">{item.quantity}</span>
        </div>
      ))}

    </div>
  )
}