"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"

export default function CommonStocksTab({ locationId }) {

  const [commonStocks, setCommonStocks] = useState([])
  const [poles, setPoles] = useState([])
  const [search, setSearch] = useState("")
  const [selectedCategory, setSelectedCategory] = useState("all")

  /* ========================= */
  /* FETCH DATA */
  /* ========================= */

  useEffect(() => {
    if (locationId) fetchCommonStocks()
  }, [locationId])

  async function fetchCommonStocks() {

    // 1️⃣ Récupérer tous les pôles
    const { data: polesData } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "pole")
      .order("name")

    setPoles(polesData || [])

    // 2️⃣ Produits visibles pour ce pôle
    const { data: visibility } = await supabase
      .from("product_location_visibility")
      .select("product_id")
      .eq("location_id", locationId)

    const productIds = visibility?.map(v => v.product_id) || []

    if (productIds.length === 0) {
      setCommonStocks([])
      return
    }

    // 3️⃣ Tous les stocks pour ces produits
    const { data: stocksData } = await supabase
      .from("stocks")
      .select(`
        quantity,
        location_id,
        product_id,
        locations (
          id,
          name,
          type
        ),
        products (
          id,
          name,
          categories ( name )
        )
      `)
      .in("product_id", productIds)

    // 4️⃣ Seuil spécifique pôle
    const { data: thresholds } = await supabase
      .from("product_location_settings")
      .select("product_id, low_stock_threshold")
      .eq("location_id", locationId)

    const thresholdMap = {}
    thresholds?.forEach(t => {
      thresholdMap[t.product_id] = t.low_stock_threshold
    })

    // 5️⃣ Transformation pivot
    const formatted = []

    productIds.forEach(productId => {

      const productStocks =
        stocksData?.filter(s => s.product_id === productId) || []

      const productInfo = productStocks[0]?.products

      const row = {
        product_id: productId,
        name: productInfo?.name,
        category: productInfo?.categories?.name || "Sans catégorie",
        threshold: thresholdMap[productId] ?? 5,
        myStock: 0,
        reserveStock: 0,
        otherPoles: {}
      }

      productStocks.forEach(stock => {

        if (stock.location_id === locationId) {
          row.myStock = stock.quantity
        }

        else if (stock.locations.type === "reserve") {
          row.reserveStock = stock.quantity
        }

        else if (stock.locations.type === "pole") {
          row.otherPoles[stock.location_id] = stock.quantity
        }

      })

      formatted.push(row)
    })

    setCommonStocks(formatted)
  }

  /* ========================= */
  /* FILTERING */
  /* ========================= */

  const categories = useMemo(() => {

    return [
      "all",
      ...Array.from(
        new Set(commonStocks.map(item => item.category))
      )
    ]

  }, [commonStocks])

  const filteredStocks = useMemo(() => {

    return commonStocks
      .filter(item =>
        item.name.toLowerCase()
          .includes(search.toLowerCase())
      )
      .filter(item =>
        selectedCategory === "all" ||
        item.category === selectedCategory
      )

  }, [commonStocks, search, selectedCategory])

  const groupedStocks = useMemo(() => {

    return filteredStocks.reduce((acc, item) => {

      if (!acc[item.category]) acc[item.category] = []
      acc[item.category].push(item)

      return acc

    }, {})

  }, [filteredStocks])

  const otherPoles =
    poles.filter(p => p.id !== locationId)

  /* ========================= */
  /* UI */
  /* ========================= */

  return (
    <div className="space-y-8">

      <h2 className="text-2xl font-bold">
        Stocks communs
      </h2>

      {/* FILTERS */}
      <div className="flex gap-4 flex-wrap items-center">

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="border px-4 py-2 rounded-lg w-72"
        />

        <select
          value={selectedCategory}
          onChange={(e) =>
            setSelectedCategory(e.target.value)
          }
          className="border px-4 py-2 rounded-lg"
        >
          {categories.map(cat => (
            <option key={cat} value={cat}>
              {cat === "all"
                ? "Toutes catégories"
                : cat}
            </option>
          ))}
        </select>

      </div>

      {/* TABLES */}
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
                  <th className="px-5 py-4 text-center">Seuil</th>

                  {otherPoles.map(pole => (
                    <th
                      key={pole.id}
                      className="px-5 py-4 text-center"
                    >
                      {pole.name}
                    </th>
                  ))}

                  <th className="px-5 py-4 text-center">
                    Réserve
                  </th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">

                {items.map((item, index) => {

                  const isLow =
                    item.myStock <= item.threshold
                  const isOut =
                    item.myStock === 0

                  return (
                    <tr
                      key={item.product_id}
                      className={`${
                        index % 2 === 0
                          ? "bg-white"
                          : "bg-slate-50"
                      }`}
                    >

                      <td className="px-5 py-4 font-medium">
                        {item.name}
                      </td>

                      <td className={`px-5 py-4 text-center font-semibold ${
                        isOut
                          ? "text-red-700"
                          : isLow
                          ? "text-orange-600"
                          : ""
                      }`}>
                        {item.myStock}
                      </td>

                      <td className="px-5 py-4 text-center text-slate-400">
                        {item.threshold}
                      </td>

                      {otherPoles.map(pole => (
                        <td
                          key={pole.id}
                          className="px-5 py-4 text-center"
                        >
                          {item.otherPoles[pole.id] || 0}
                        </td>
                      ))}

                      <td className="px-5 py-4 text-center font-medium">
                        {item.reserveStock}
                      </td>

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