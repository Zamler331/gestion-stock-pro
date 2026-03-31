"use client"

import React, { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

const CATEGORY_ORDER = [
  "Epicerie",
  "Paninis",
  "Frais",
  "Surgelé",
  "Boissons",
  "Boissons (NICO)",
  "Glaces (cônes)",
  "Glaces (boules)",
  "Granités/Frozzen",
  "Confiseries",
  "Matériel",
  "Sans catégorie",
]

function compareCategories(catA, catB) {
  const a = catA || "Sans catégorie"
  const b = catB || "Sans catégorie"

  const indexA = CATEGORY_ORDER.indexOf(a)
  const indexB = CATEGORY_ORDER.indexOf(b)

  const aKnown = indexA !== -1
  const bKnown = indexB !== -1

  if (aKnown && bKnown) return indexA - indexB
  if (aKnown) return -1
  if (bKnown) return 1

  return a.localeCompare(b, "fr")
}

export default function ThresholdsTab() {
  const [loading, setLoading] = useState(true)
  const [products, setProducts] = useState([])
  const [poles, setPoles] = useState([])
  const [thresholds, setThresholds] = useState({})
  const [saving, setSaving] = useState(false)
  const [openCategories, setOpenCategories] = useState({})
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    setLoading(true)

    const { data: productData } = await supabase
      .from("products")
      .select("id, name, categories(name)")
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

    thresholdsData?.forEach((t) => {
      if (!map[t.product_id]) {
        map[t.product_id] = {}
      }
      map[t.product_id][t.location_id] = t.low_stock_threshold
    })

    const finalProducts = (productData || []).map((product) => ({
      ...product,
      category: product.categories?.name || "Sans catégorie",
    }))

    setProducts(finalProducts)
    setPoles(poleData || [])
    setThresholds(map)

    const categoryNames = [
      ...new Set(finalProducts.map((product) => product.category)),
    ]

    const isDesktop =
      typeof window !== "undefined" ? window.innerWidth >= 768 : true

    setOpenCategories((prev) => {
      const next = { ...prev }

      categoryNames.forEach((cat) => {
        if (next[cat] === undefined) {
          next[cat] = isDesktop
        }
      })

      return next
    })

    setLoading(false)
  }

  function updateThreshold(productId, locationId, value) {
    setThresholds((prev) => ({
      ...prev,
      [productId]: {
        ...prev[productId],
        [locationId]: parseInt(value, 10) || 0,
      },
    }))
  }

  function toggleCategory(categoryName) {
    setOpenCategories((prev) => ({
      ...prev,
      [categoryName]: !prev[categoryName],
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
        .insert([
          {
            product_id: productId,
            location_id: locationId,
            low_stock_threshold: value,
          },
        ])
    }

    setSaving(false)
  }

  const filteredProducts = useMemo(() => {
    return products.filter((product) =>
      product.name?.toLowerCase().includes(search.toLowerCase())
    )
  }, [products, search])

  const groupedProducts = useMemo(() => {
    const grouped = filteredProducts.reduce((acc, product) => {
      const category = product.category || "Sans catégorie"
      if (!acc[category]) acc[category] = []
      acc[category].push(product)
      return acc
    }, {})

    return Object.entries(grouped)
      .sort(([catA], [catB]) => compareCategories(catA, catB))
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "fr")),
      }))
  }, [filteredProducts])

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
    <div className="space-y-6">
      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-4">
        <input
          type="text"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="w-full md:w-96 border border-slate-300 rounded-lg px-4 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
        <div className="overflow-auto max-h-[70vh]">
          <table className="min-w-full text-sm">
            <thead className="text-xs uppercase text-slate-600 tracking-wide">
              <tr>
                <th className="sticky top-0 z-30 bg-slate-100 px-4 py-3 text-left">
                  Produit
                </th>

                {poles.map((pole) => (
                  <th
                    key={pole.id}
                    className="sticky top-0 z-30 bg-slate-100 px-4 py-3 text-center"
                  >
                    {pole.name}
                  </th>
                ))}
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">
              {groupedProducts.map(({ category, items }) => {
                const isOpen = openCategories[category] ?? true

                return (
                  <React.Fragment key={category}>
                    <tr className="bg-slate-50">
                      <td colSpan={poles.length + 1} className="px-4 py-3">
                        <button
                          type="button"
                          onClick={() => toggleCategory(category)}
                          className="w-full flex items-center justify-between text-left"
                        >
                          <div className="flex items-center gap-3">
                            <span className="font-semibold text-slate-800">
                              {category}
                            </span>
                            <span className="text-xs text-slate-500">
                              {items.length} produit{items.length > 1 ? "s" : ""}
                            </span>
                          </div>

                          <span
                            className={`text-slate-500 transition-transform duration-200 ${
                              isOpen ? "rotate-180" : ""
                            }`}
                          >
                            ▼
                          </span>
                        </button>
                      </td>
                    </tr>

                    {isOpen &&
                      items.map((product) => (
                        <tr
                          key={product.id}
                          className="hover:bg-slate-50 transition-colors"
                        >
                          <td className="px-4 py-3 font-medium text-slate-800">
                            {product.name}
                          </td>

                          {poles.map((pole) => (
                            <td
                              key={pole.id}
                              className="px-4 py-3 text-center"
                            >
                              <input
                                type="number"
                                min="0"
                                value={thresholds[product.id]?.[pole.id] ?? ""}
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
                  </React.Fragment>
                )
              })}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  )
}