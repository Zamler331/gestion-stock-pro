"use client"

import { useEffect, useState } from "react"
import { getGlobalStockView } from "@/lib/services/stocksService"

export default function GlobalStockTable() {

  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const data = await getGlobalStockView()
    setProducts(data.products || [])
    setLocations(data.locations || [])
  }

  const categories = [
    "all",
    ...Array.from(new Set(products.map(p => p.category)))
  ]

  const filtered = products
    .filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    )
    .filter(p =>
      selectedCategory === "all" ||
      p.category === selectedCategory
    )

  return (
    <div className="space-y-6">

      <div className="flex gap-4 items-center">
        <input
          placeholder="Rechercher produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="border px-3 py-2 rounded-lg"
        />

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="border px-3 py-2 rounded-lg"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === "all" ? "Toutes catégories" : cat}
            </option>
          ))}
        </select>
      </div>

      <div className="overflow-x-auto bg-white rounded-2xl shadow">
        <table className="min-w-full text-sm">

          <thead className="bg-slate-100 uppercase text-xs text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Produit</th>
              <th className="px-4 py-3 text-left">Catégorie</th>

              {locations.map(loc => (
                <th key={loc.id} className="px-4 py-3 text-center">
                  {loc.name}
                </th>
              ))}
            </tr>
          </thead>

          <tbody className="divide-y">

            {filtered.map(product => (
              <tr key={product.product_id} className="hover:bg-slate-50">

                <td className="px-4 py-3 font-medium">
                  {product.name}
                </td>

                <td className="px-4 py-3 text-slate-500">
                  {product.category}
                </td>

                {locations.map(loc => {

                  const data = product.locations[loc.id]
                  const qty = data?.quantity ?? 0
                  const threshold = data?.threshold ?? 5

                  const isOut = qty === 0
                  const isLow = qty > 0 && qty <= threshold

                  return (
                    <td
                      key={loc.id}
                      className={`px-4 py-3 text-center font-semibold ${
                        isOut
                          ? "text-red-700"
                          : isLow
                          ? "text-orange-600"
                          : ""
                      }`}
                    >
                      {qty}
                    </td>
                  )
                })}

              </tr>
            ))}

          </tbody>
        </table>
      </div>

    </div>
  )
}