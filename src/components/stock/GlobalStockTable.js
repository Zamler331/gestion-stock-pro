"use client"

import { useEffect, useState, useMemo } from "react"
import { getGlobalStockView } from "@/lib/services/stocksService"

export default function GlobalStockTable({ highlightLocationId = null }) {

  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState("")
  const [openCategories, setOpenCategories] = useState({})

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
  try {

    const data = await getGlobalStockView(highlightLocationId)

    setProducts(data?.products || [])
    setLocations(data?.locations || [])

  } catch (err) {

    console.error("Erreur GlobalStockView:", err)

    setProducts([])
    setLocations([])

  }
}

const poleLocations = useMemo(
  () => locations.filter(l => l.type === "pole"),
  [locations]
)

const reserveLocations = useMemo(
  () => locations.filter(l => l.type === "reserve"),
  [locations]
)

  /* ========================= */
  /* FILTERING */
  /* ========================= */

  const filtered = useMemo(() => {

  let visibleProducts = products

  /* ========================= */
  /* FILTRE VISIBILITÉ PÔLE */
  /* ========================= */

  if (highlightLocationId) {
    visibleProducts = products.filter(p =>
      p.locations?.[highlightLocationId] !== undefined
    )
  }

  /* ========================= */
  /* FILTRE RECHERCHE */
  /* ========================= */

  return visibleProducts.filter(p =>
    (p.name || "").toLowerCase().includes(search.toLowerCase())
  )

}, [products, search, highlightLocationId])


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

  function toggleCategory(cat) {
    setOpenCategories(prev => ({
      ...prev,
      [cat]: !prev[cat]
    }))
  }

  return (
    <div className="space-y-8">

      {/* ========================= */}
      {/* STICKY SEARCH */}
      {/* ========================= */}

      <div className="sticky top-0 z-30 bg-slate-200 pb-4">
        <input
          placeholder="Rechercher produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="
            w-full sm:w-72
            border border-slate-300
            bg-white
            px-4 py-2
            rounded-lg
            text-sm
            shadow-sm
            focus:outline-none
            focus:ring-2
            focus:ring-slate-400
          "
        />
      </div>

      {Object.entries(grouped).map(([category, items]) => {

        const currentPole = poleLocations.find(l => l.id === highlightLocationId)
        const otherPoles = poleLocations.filter(l => l.id !== highlightLocationId)
  .filter(l =>
    items.some(product =>
      product.locations?.[l.id] !== undefined
    )
  )


        const isOpen = openCategories[category] ?? true

        /* ========================= */
        /* ALERT CALCULATIONS */
        /* ========================= */

        let hasOut = false
        let hasLow = false

        items.forEach(product => {
          Object.values(product.locations).forEach(loc => {
            const qty = loc?.quantity ?? 0
            const threshold = loc?.threshold ?? 5
            if (qty === 0) hasOut = true
            if (qty > 0 && qty <= threshold) hasLow = true
          })
        })

        const alertColor = hasOut
          ? "bg-red-600"
          : hasLow
          ? "bg-orange-500"
          : "bg-slate-400"

        return (
          <div key={category} className="space-y-4">

            {/* ========================= */}
            {/* CATEGORY HEADER */}
            {/* ========================= */}

            <button
              onClick={() => toggleCategory(category)}
              className="
                relative
                w-full
                flex
                justify-between
                items-center
                bg-white
                px-5 py-4
                rounded-2xl
                shadow-sm
                border border-slate-200
                hover:bg-slate-50
                transition
                group
              "
            >

              {/* ALERT BAR */}
              <span className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl ${alertColor}`} />

              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-800">
                  {category}
                </span>

                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                  {items.length}
                </span>
              </div>

              <span
                className={`
                  text-slate-500
                  text-lg
                  transition-transform
                  duration-300
                  ${isOpen ? "rotate-180" : ""}
                `}
              >
                ⌄
              </span>
            </button>

            {/* ========================= */}
            {/* ACCORDION CONTENT */}
            {/* ========================= */}

            <div
              className={`
                overflow-hidden
                transition-all
                duration-500
                ease-in-out
                ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
              `}
            >
              <div className="pt-4 space-y-6">

                {/* DESKTOP TABLE */}
                <div className="hidden md:block overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">

                  <table className="min-w-[700px] w-full text-sm">

                    <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                      <tr>
                        <th className="px-6 py-4 text-left">Produit</th>

                        {currentPole && (
                          <th className="px-6 py-4 text-center bg-slate-200">
                            {currentPole.name}
                          </th>
                        )}

                        {otherPoles.map(loc => (
                          <th key={loc.id} className="px-6 py-4 text-center">
                            {loc.name}
                          </th>
                        ))}

                        {reserveLocations.map(loc => (
                          <th key={loc.id} className="px-6 py-4 text-center text-slate-500">
                            {loc.name}
                          </th>
                        ))}
                      </tr>
                    </thead>

                    <tbody className="divide-y divide-slate-100">

                      {items.map((product, index) => (

                        <tr
                          key={product.product_id}
                          className="
                            transition
                            hover:bg-slate-50
                          "
                        >

                          <td className="px-6 py-4 font-medium text-slate-900">
                              {product.name}
                              {product.packaging && (
                                <div className="text-xs text-slate-400 mt-1">
                                  {product.packaging}
                                </div>
                              )}
                            </td>

                          {currentPole && (
                            <StockCell
                              product={product}
                              location={currentPole}
                              highlight
                            />
                          )}

                          {otherPoles.map(loc => (
                            <StockCell
                              key={loc.id}
                              product={product}
                              location={loc}
                            />
                          ))}

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

                {/* MOBILE CARDS */}
                <div className="md:hidden space-y-4">

                  {items.map(product => (

                    <div
                      key={product.product_id}
                      className="
                        bg-white
                        border border-slate-200
                        rounded-2xl
                        shadow-sm
                        p-4
                        space-y-3
                        transition
                        hover:shadow-md
                        hover:-translate-y-0.5
                      "
                    >

                      <div className="font-semibold text-slate-900">
                          {product.name}

                          {product.packaging && (
                            <div className="text-xs text-slate-400">
                              {product.packaging}
                            </div>
                          )}
                        </div>

                      {currentPole && (
                        <MobileStockRow
                          label={currentPole.name}
                          product={product}
                          location={currentPole}
                          highlight
                        />
                      )}

                      {otherPoles.map(loc => (
                        <MobileStockRow
                          key={loc.id}
                          label={loc.name}
                          product={product}
                          location={loc}
                        />
                      ))}

                      {reserveLocations.map(loc => (
                        <MobileStockRow
                          key={loc.id}
                          label={loc.name}
                          product={product}
                          location={loc}
                          isReserve
                        />
                      ))}

                    </div>
                  ))}

                </div>

              </div>
            </div>

          </div>
        )
      })}

    </div>
  )
}

/* ========================= */

function StockCell({ product, location, highlight, isReserve }) {

  const data = product.locations?.[location.id]
  const qty = data?.quantity ?? 0
  const threshold = data?.threshold ?? 5

  const isOut = qty === 0
  const isLow = qty > 0 && qty <= threshold

  return (
    <td
      className={`
        px-6 py-4 text-center font-semibold
        transition-colors
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

function MobileStockRow({ label, product, location, highlight, isReserve }) {

  const data = product.locations?.[location.id]
  const qty = data?.quantity ?? 0
  const threshold = data?.threshold ?? 5

  const isOut = qty === 0
  const isLow = qty > 0 && qty <= threshold

  return (
    <div className="flex justify-between text-sm">

      <span className={`
        ${highlight ? "font-semibold" : ""}
        ${isReserve ? "text-slate-500" : "text-slate-700"}
      `}>
        {label}
      </span>

      <span className={`
        font-semibold
        ${
          isOut
            ? "text-red-700"
            : isLow
            ? "text-orange-600"
            : "text-slate-900"
        }
      `}>
        {qty}
      </span>

    </div>
  )
}