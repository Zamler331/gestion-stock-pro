"use client"

import { useEffect, useMemo, useState } from "react"
import { getGlobalStockView } from "@/lib/services/stocksService"

export default function CommonStocksTab({ locationId }) {
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  async function fetchCommonStocks() {
    const data = await getGlobalStockView()

    setProducts(data?.products || [])
    setLocations(data?.locations || [])
  }

  useEffect(() => {
    if (!locationId) return

    const timeoutId = window.setTimeout(() => {
      fetchCommonStocks()
    }, 0)

    return () => window.clearTimeout(timeoutId)
  }, [locationId])

  const poles = useMemo(
    () => locations.filter((location) => location.type === "pole"),
    [locations]
  )

  const reserves = useMemo(
    () => locations.filter((location) => location.type === "reserve"),
    [locations]
  )

  const otherPoles = useMemo(
    () => poles.filter((pole) => pole.id !== locationId),
    [poles, locationId]
  )

  const visibleProducts = useMemo(() => {
    return products.filter((product) =>
      product.visible_location_ids?.includes(locationId)
    )
  }, [products, locationId])

  const categories = useMemo(() => {
    return [
      "all",
      ...Array.from(
        new Set(
          visibleProducts.map(
            (product) => product.category || "Sans catégorie"
          )
        )
      ),
    ]
  }, [visibleProducts])

  const filteredStocks = useMemo(() => {
    return visibleProducts
      .filter((product) =>
        (product.name || "").toLowerCase().includes(search.toLowerCase())
      )
      .filter(
        (product) =>
          selectedCategory === "all" ||
          product.category === selectedCategory
      )
  }, [visibleProducts, search, selectedCategory])

  const groupedStocks = useMemo(() => {
    const grouped = filteredStocks.reduce((acc, product) => {
      const category = product.category || "Sans catégorie"

      if (!acc[category]) acc[category] = []
      acc[category].push(product)

      return acc
    }, {})

    return Object.fromEntries(
      Object.entries(grouped)
        .sort(([categoryA], [categoryB]) =>
          categoryA.localeCompare(categoryB, "fr", {
            sensitivity: "base",
            numeric: true,
          })
        )
        .map(([category, items]) => [
          category,
          items.sort((a, b) =>
            (a.name || "").localeCompare(b.name || "", "fr", {
              sensitivity: "base",
              numeric: true,
            })
          ),
        ])
    )
  }, [filteredStocks])

  return (
    <div className="space-y-8">
      <h2 className="text-2xl font-bold">
        Stocks communs
      </h2>

      <div className="flex gap-4 flex-wrap items-center">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="border px-4 py-2 rounded-lg w-72"
        />

        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="border px-4 py-2 rounded-lg"
        >
          {categories.map((cat) => (
            <option key={cat} value={cat}>
              {cat === "all" ? "Toutes catégories" : cat}
            </option>
          ))}
        </select>
      </div>

      {Object.entries(groupedStocks).map(([category, items]) => (
        <div key={category} className="space-y-3">
          <h3 className="font-semibold text-lg">
            {category}
          </h3>

          <div className="bg-white rounded-2xl shadow overflow-x-auto">
            <table className="min-w-full text-sm">
              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-5 py-4 text-left">Produit</th>
                  <th className="px-5 py-4 text-center">Mon Pôle</th>

                  {otherPoles.map((pole) => (
                    <th key={pole.id} className="px-5 py-4 text-center">
                      {pole.name}
                    </th>
                  ))}

                  {reserves.map((reserve) => (
                    <th key={reserve.id} className="px-5 py-4 text-center">
                      {reserve.name}
                    </th>
                  ))}
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">
                {items.map((item, index) => {
                  const myStock = Number(
                    item.locations?.[locationId]?.quantity || 0
                  )

                  const isOut = myStock === 0

                  return (
                    <tr
                      key={item.product_id}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    >
                      <td className="px-5 py-4 font-medium">
                        {item.name}
                      </td>

                      <td
                        className={`px-5 py-4 text-center font-semibold ${
                          isOut ? "text-red-700" : "text-slate-800"
                        }`}
                      >
                        {myStock}
                      </td>

                      {otherPoles.map((pole) => (
                        <td key={pole.id} className="px-5 py-4 text-center">
                          {item.locations?.[pole.id]?.quantity || 0}
                        </td>
                      ))}

                      {reserves.map((reserve) => (
                        <td
                          key={reserve.id}
                          className="px-5 py-4 text-center font-medium text-slate-500"
                        >
                          {item.locations?.[reserve.id]?.quantity || 0}
                        </td>
                      ))}
                    </tr>
                  )
                })}
              </tbody>
            </table>
          </div>
        </div>
      ))}
    </div>
  )
}
