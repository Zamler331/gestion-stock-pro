"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function ProductsTab() {

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [poles, setPoles] = useState([])

  const [newProductName, setNewProductName] = useState("")
  const [newProductCategory, setNewProductCategory] = useState("")

  const [newCategoryName, setNewCategoryName] = useState("")
  const [search, setSearch] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {

    const { data: productData } = await supabase
      .from("products")
      .select(`
        id,
        name,
        category_id
      `)
      .order("name")

    const { data: categoryData } = await supabase
      .from("categories")
      .select("*")
      .order("name")

    const { data: poleData } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "pole")
      .order("name")

    const { data: visibilityData } = await supabase
      .from("product_location_visibility")
      .select("*")

    const visibilityMap = {}

    visibilityData?.forEach(v => {
      if (!visibilityMap[v.product_id]) {
        visibilityMap[v.product_id] = {}
      }
      visibilityMap[v.product_id][v.location_id] = true
    })

    const enrichedProducts = productData?.map(p => ({
      ...p,
      visibility: visibilityMap[p.id] || {}
    }))

    setProducts(enrichedProducts || [])
    setCategories(categoryData || [])
    setPoles(poleData || [])
  }

  async function createCategory() {
    if (!newCategoryName.trim()) return

    await supabase.from("categories").insert([{
      name: newCategoryName
    }])

    setNewCategoryName("")
    fetchData()
  }

  async function createProduct() {
    if (!newProductName.trim()) return

    const { data } = await supabase
      .from("products")
      .insert([{
        name: newProductName,
        category_id: newProductCategory || null
      }])
      .select()
      .single()

    // créer stocks initiaux à 0 pour chaque location
    const { data: locations } = await supabase
      .from("locations")
      .select("id")

    for (const loc of locations || []) {
      await supabase.from("stocks").insert([{
        product_id: data.id,
        location_id: loc.id,
        quantity: 0
      }])
    }

    setNewProductName("")
    setNewProductCategory("")
    fetchData()
  }

  async function toggleVisibility(productId, locationId, isVisible) {

    if (isVisible) {
      await supabase
        .from("product_location_visibility")
        .insert([{
          product_id: productId,
          location_id: locationId
        }])
    } else {
      await supabase
        .from("product_location_visibility")
        .delete()
        .eq("product_id", productId)
        .eq("location_id", locationId)
    }

    fetchData()
  }

  async function updateCategory(productId, categoryId) {
    await supabase
      .from("products")
      .update({ category_id: categoryId || null })
      .eq("id", productId)
  }

  async function deleteProduct(productId) {

    const confirmDelete = window.confirm(
      "Supprimer ce produit ?"
    )

    if (!confirmDelete) return

    await supabase.from("products").delete().eq("id", productId)
    fetchData()
  }

  const filteredProducts = products.filter(p =>
  p.name.toLowerCase().includes(search.toLowerCase())
)

const groupedProducts = filteredProducts.reduce((acc, product) => {

  const categoryName =
    categories.find(c => c.id === product.category_id)?.name
    || "Sans catégorie"

  if (!acc[categoryName]) {
    acc[categoryName] = []
  }

  acc[categoryName].push(product)

  return acc

}, {})

return (
  <div className="space-y-12">

    {/* ================= CREATION CATEGORIE ================= */}

    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5">

      <h2 className="text-lg font-semibold text-slate-900">
        Ajouter une catégorie
      </h2>

      <div className="flex gap-3 flex-wrap">

        <input
          value={newCategoryName}
          onChange={(e) => setNewCategoryName(e.target.value)}
          placeholder="Nom catégorie"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />

        <button
          onClick={createCategory}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Ajouter
        </button>

      </div>

    </div>


    {/* ================= CREATION PRODUIT ================= */}

    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5">

      <h2 className="text-lg font-semibold text-slate-900">
        Ajouter un produit
      </h2>

      <div className="flex gap-3 flex-wrap">

        <input
          value={newProductName}
          onChange={(e) => setNewProductName(e.target.value)}
          placeholder="Nom produit"
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />

        <select
          value={newProductCategory}
          onChange={(e) => setNewProductCategory(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        >
          <option value="">Sans catégorie</option>
          {categories.map(cat => (
            <option key={cat.id} value={cat.id}>
              {cat.name}
            </option>
          ))}
        </select>

        <button
          onClick={createProduct}
          className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium transition-colors"
        >
          Ajouter
        </button>

      </div>

    </div>


    {/* ================= RECHERCHE ================= */}

    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">

      <h2 className="text-lg font-semibold text-slate-900">
        Rechercher un produit
      </h2>

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher..."
        className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64 focus:outline-none focus:ring-2 focus:ring-slate-400"
      />

    </div>


    {/* ================= TABLEAUX PAR CATEGORIE ================= */}

    {Object.entries(groupedProducts).map(([category, items]) => (

      <div key={`category-${category}`} className="space-y-4">

        <h2 className="text-base font-semibold text-slate-800">
          {category}
        </h2>

        <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">

          <table className="min-w-full text-sm">

            <thead className="bg-slate-100 text-xs uppercase text-slate-600 tracking-wide">
              <tr>
                <th className="px-4 py-3 text-left">Produit</th>
                <th className="px-4 py-3 text-center">Catégorie</th>

                {poles.map(p => (
                  <th key={p.id} className="px-4 py-3 text-center">
                    {p.name}
                  </th>
                ))}

                <th className="px-4 py-3 text-center">Supprimer</th>
              </tr>
            </thead>

            <tbody className="divide-y divide-slate-100">

              {items.map((product, index) => (

                <tr
                  key={product.id}
                  className="hover:bg-slate-50 transition-colors"
                >

                  <td className="px-4 py-3 font-medium text-slate-800">
                    {product.name}
                  </td>

                  <td className="px-4 py-3 text-center">
                    <select
                      value={product.category_id || ""}
                      onChange={(e) =>
                        updateCategory(product.id, e.target.value)
                      }
                      className="border border-slate-300 rounded-lg px-2 py-1 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
                    >
                      <option value="">Sans catégorie</option>
                      {categories.map(cat => (
                        <option key={cat.id} value={cat.id}>
                          {cat.name}
                        </option>
                      ))}
                    </select>
                  </td>

                  {poles.map(pole => (
                    <td key={pole.id} className="px-4 py-3 text-center">
                      <input
                        type="checkbox"
                        checked={product.visibility?.[pole.id] || false}
                        onChange={(e) =>
                          toggleVisibility(
                            product.id,
                            pole.id,
                            e.target.checked
                          )
                        }
                        className="accent-slate-900"
                      />
                    </td>
                  ))}

                  <td className="px-4 py-3 text-center">
                    <button
                      onClick={() => deleteProduct(product.id)}
                      className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition-colors"
                    >
                      Supprimer
                    </button>
                  </td>

                </tr>

              ))}

            </tbody>

          </table>

        </div>

      </div>

    ))}

  </div>
)
}