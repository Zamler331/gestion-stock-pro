"use client"

import { useEffect, useState, useMemo } from "react"
import { supabase } from "@/lib/supabase"
import { recordStockExits } from "@/lib/services/atomicStockService"

export default function StockExitTab({ locationId }) {

  const [stocks, setStocks] = useState([])
  const [exitDraft, setExitDraft] = useState({})
  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(true)
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    if (locationId) fetchStocks()
  }, [locationId])

  /* ========================= */
  /* FETCH STOCKS */
  /* ========================= */

  async function fetchStocks() {

    setLoading(true)

    const { data, error } = await supabase
      .from("current_stock_levels")
      .select(`
        quantity,
        product_id,
        product_name,
        packaging,
        category_name
      `)
      .eq("location_id", locationId)

    if (error) {
      console.error("Erreur stocks :", error)
      setStocks([])
      setLoading(false)
      return
    }

    setStocks((data || []).map((row) => ({
      ...row,
      id: `${row.product_id}:${locationId}`,
      products: {
        id: row.product_id,
        name: row.product_name,
        packaging: row.packaging,
        categories: { name: row.category_name },
      },
    })))
    setLoading(false)
  }

  /* ========================= */
  /* UPDATE EXIT DRAFT */
  /* ========================= */

  function updateExit(productId, value) {

    setExitDraft(prev => ({
      ...prev,
      [productId]: parseInt(value) || 0
    }))

  }

  /* ========================= */
  /* FILTER SEARCH */
  /* ========================= */

  const filteredStocks = useMemo(() => {

    return stocks.filter(item =>
      item.products.name
        .toLowerCase()
        .includes(search.toLowerCase())
    )

  }, [stocks, search])

  /* ========================= */
  /* GROUP BY CATEGORY */
  /* ========================= */

  const groupedStocks = useMemo(() => {

    return filteredStocks.reduce((acc, item) => {

      const category =
        item.products.categories?.name ||
        "Sans catégorie"

      if (!acc[category]) acc[category] = []

      acc[category].push(item)

      return acc

    }, {})

  }, [filteredStocks])

  /* ========================= */
  /* VALIDATE EXIT */
  /* ========================= */

  async function handleValidateExit() {

    try {
      if (isSubmitting) return
      setIsSubmitting(true)

      setMessage("")

      const exits = Object.entries(exitDraft)
        .filter(([_, qty]) => qty > 0)

      if (exits.length === 0) {
        setMessage("Aucune sortie saisie")
        return
      }

      await recordStockExits({
        locationId,
        exits: exits.map(([productId, quantity]) => ({
          product_id: productId,
          quantity,
        })),
        annotation: "Sortie pôle",
      })

      setExitDraft({})
      setMessage("Sorties enregistrées")

      fetchStocks()

    } catch (err) {

      console.error(err)
      setMessage("Erreur lors de la validation")

    } finally {
      setIsSubmitting(false)
    }

  }

  /* ========================= */
  /* UI */
  /* ========================= */

  return (
    <div className="space-y-8">

      <h2 className="text-xl font-semibold">
        Sortie de stock
      </h2>

      {/* SEARCH */}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit..."
        className="border border-slate-300 px-4 py-2 rounded-lg w-80 text-sm"
      />

      {loading && (
        <p className="text-sm text-slate-500">
          Chargement...
        </p>
      )}

      {!loading && Object.entries(groupedStocks).map(([category, items]) => (

        <div key={category} className="space-y-3">

          <h3 className="font-semibold text-lg text-slate-800">
            {category}
          </h3>

          <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

            <table className="min-w-full text-sm">

              <thead className="bg-slate-100 text-xs uppercase text-slate-600">
                <tr>
                  <th className="px-6 py-4 text-left">Produit</th>
                  <th className="px-6 py-4 text-center">Stock</th>
                  <th className="px-6 py-4 text-center">Sortie</th>
                </tr>
              </thead>

              <tbody className="divide-y divide-slate-100">

                {items.map((item, index) => (

                  <tr
                    key={item.id}
                    className={
                      index % 2 === 0
                        ? "bg-white"
                        : "bg-slate-50"
                    }
                  >

                    <td className="px-6 py-4 font-medium text-slate-900">

                      {item.products.name}

                      {item.products.packaging && (
                        <div className="text-xs text-slate-400 mt-1">
                          {item.products.packaging}
                        </div>
                      )}

                    </td>

                    <td className="px-6 py-4 text-center font-semibold">
                      {item.quantity}
                    </td>

                    <td className="px-6 py-4 text-center">

                      <input
                        type="number"
                        min="0"
                        value={exitDraft[item.product_id] || ""}
                        onChange={(e) =>
                          updateExit(item.product_id, e.target.value)
                        }
                        className="w-20 border border-slate-300 rounded-lg p-2 text-center text-sm"
                      />

                    </td>

                  </tr>

                ))}

              </tbody>

            </table>

          </div>

        </div>

      ))}

      {/* VALIDATE BUTTON */}

      <button
        onClick={handleValidateExit}
        disabled={isSubmitting}
        className="bg-slate-900 text-white px-6 py-2 rounded-lg"
      >
        {isSubmitting ? "Validation..." : "Valider les sorties"}
      </button>

      {message && (
        <p className="text-sm text-slate-600">
          {message}
        </p>
      )}

    </div>
  )
}
