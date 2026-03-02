"use client"

import { useEffect, useState, useMemo } from "react"
import { getGlobalStockView } from "@/lib/services/stocksService"

export default function GlobalStockTable({ highlightLocationId = null }) {

  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const data = await getGlobalStockView()
    setProducts(data.products || [])
    setLocations(data.locations || [])
  }

  /* ========================= */
  /* FILTERING */
  /* ========================= */

  const filtered = useMemo(() => {
    return products.filter(p =>
      p.name.toLowerCase().includes(search.toLowerCase())
    )
  }, [products, search])

  /* ========================= */
  /* GROUP BY CATEGORY */
  /* ========================= */

  const grouped = useMemo(() => {
    return filtered.reduce((acc, product) => {
      const cat = product.category || "Sans catégorie"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(product)
      return acc
    }, {})
  }, [filtered])

  return (
    <div className="space-y-10">

      {/* SEARCH */}
      <div className="flex justify-between items-center flex-wrap gap-4">
        <input
          placeholder="Rechercher produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="
            w-full sm:w-72
            border border-slate-300
            px-4 py-2
            rounded-lg
            text-sm
            focus:outline-none
            focus:ring-2
            focus:ring-slate-400
          "
        />
      </div>

      {Object.entries(grouped).map(([category, items]) => {

        const poleLocations = locations.filter(l => l.type === "pole")
        const reserveLocations = locations.filter(l => l.type === "reserve")

        const currentPole = poleLocations.find(l => l.id === highlightLocationId)
        const otherPoles = poleLocations.filter(l => l.id !== highlightLocationId)

        return (

          <div key={category} className="space-y-4">

            {/* CATEGORY TITLE */}
            <h2 className="text-lg sm:text-xl font-semibold text-slate-800">
              {category}
            </h2>

            <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">

              <table className="min-w-[700px] w-full text-sm">

                <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                  <tr>
                    <th className="sticky left-0 bg-slate-100 z-10 px-4 py-3 text-left">
                      Produit
                    </th>

                    {currentPole && (
                      <th className="px-4 py-3 text-center bg-slate-200">
                        {currentPole.name}
                      </th>
                    )}

                    {otherPoles.map(loc => (
                      <th key={loc.id} className="px-4 py-3 text-center">
                        {loc.name}
                      </th>
                    ))}

                    {reserveLocations.map(loc => (
  <th
    key={loc.id}
    className="px-4 py-3 text-center text-slate-500 border-l border-slate-200"
  >
    {loc.name}
  </th>
))}
                  </tr>
                </thead>

                <tbody className="divide-y divide-slate-100">

                  {items.map((product, index) => (

                    <tr
                      key={product.product_id}
                      className={index % 2 === 0 ? "bg-white" : "bg-slate-50"}
                    >

                      {/* PRODUCT NAME (STICKY MOBILE) */}
                      <td className="sticky left-0 bg-inherit px-4 py-3 font-medium text-slate-900">
                        {product.name}
                      </td>

                      {/* CURRENT POLE */}
                      {currentPole && (
                        <StockCell
                          product={product}
                          location={currentPole}
                          highlight
                        />
                      )}

                      {/* OTHER POLES */}
                      {otherPoles.map(loc => (
                        <StockCell
                          key={loc.id}
                          product={product}
                          location={loc}
                        />
                      ))}

                      {/* RESERVES (GROUPED VISUALLY) */}
                      {reserveLocations.map(loc => (
                        <StockCell
                          key={loc.id}
                          product={product}
                          location={loc}
                          isReserve
                        />
                      ))}

                    </tr>

                  ))}

                </tbody>

              </table>

            </div>

          </div>
        )
      })}

    </div>
  )
}

/* ========================= */
/* STOCK CELL */
/* ========================= */

function StockCell({ product, location, highlight, isReserve }) {

  const data = product.locations[location.id]
  const qty = data?.quantity ?? 0
  const threshold = data?.threshold ?? 5

  const isOut = qty === 0
  const isLow = qty > 0 && qty <= threshold

  return (
    <td
      className={`
        px-4 py-3 text-center font-semibold
        ${highlight ? "bg-slate-100" : ""}
        ${isReserve ? "text-slate-500" : ""}
        ${
          isOut
            ? "text-red-700"
            : isLow
            ? "text-orange-600"
            : "text-slate-800"
        }
      `}
    >
      {qty}
    </td>
  )
}