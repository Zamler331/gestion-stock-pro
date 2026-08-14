"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { fetchAllPages } from "@/lib/services/paginationService"

export default function ProductsTab() {

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])
  const [poles, setPoles] = useState([])

  const [newProductName, setNewProductName] = useState("")
  const [newProductCategory, setNewProductCategory] = useState("")
  const [newProductPackaging, setNewProductPackaging] = useState("")

  const [newCategoryName, setNewCategoryName] = useState("")
  const [search, setSearch] = useState("")

  const [editingCategoryId, setEditingCategoryId] = useState(null)
  const [editingCategoryName, setEditingCategoryName] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    try {
      const [productData, categoryData, poleData, visibilityData] =
        await Promise.all([
          fetchAllPages(() =>
            supabase
              .from("products")
              .select("id, name, category_id, packaging")
              .order("name", { ascending: true })
              .order("id", { ascending: true })
          ),
          fetchAllPages(() =>
            supabase
              .from("categories")
              .select("*")
              .order("name", { ascending: true })
              .order("id", { ascending: true })
          ),
          fetchAllPages(() =>
            supabase
              .from("locations")
              .select("*")
              .eq("type", "pole")
              .order("name", { ascending: true })
              .order("id", { ascending: true })
          ),
          fetchAllPages(() =>
            supabase
              .from("product_location_settings")
              .select("product_id, location_id")
              .order("product_id", { ascending: true })
              .order("location_id", { ascending: true })
          ),
        ])

      const visibilityMap = {}

      visibilityData.forEach(v => {
        if (!visibilityMap[v.product_id]) {
          visibilityMap[v.product_id] = {}
        }

        visibilityMap[v.product_id][v.location_id] = true
      })

      const enrichedProducts = productData.map(p => ({
        ...p,
        visibility: visibilityMap[p.id] || {}
      }))

      setProducts(enrichedProducts)
      setCategories(categoryData)
      setPoles(poleData)
    } catch (error) {
      console.error("Erreur chargement produits :", error)
      alert("Impossible de charger la liste complète des produits")
    }
  }

  async function createCategory() {

    if (!newCategoryName.trim()) return

    await supabase
      .from("categories")
      .insert([
        { name: newCategoryName }
      ])

    setNewCategoryName("")
    fetchData()
  }

  async function startEditCategory(category) {
    setEditingCategoryId(category.id)
    setEditingCategoryName(category.name)
  }

  async function saveCategoryEdit() {

    if (!editingCategoryName.trim()) return

    await supabase
      .from("categories")
      .update({
        name: editingCategoryName,
      })
      .eq("id", editingCategoryId)

    setEditingCategoryId(null)
    setEditingCategoryName("")

    fetchData()
  }

  async function deleteCategory(categoryId) {

    const linkedProducts = products.filter(
      (p) => p.category_id === categoryId
    )

    if (linkedProducts.length > 0) {
      alert("Impossible de supprimer : catégorie utilisée par des produits")
      return
    }

    const confirmDelete = window.confirm(
      "Supprimer cette catégorie ?"
    )

    if (!confirmDelete) return

    await supabase
      .from("categories")
      .delete()
      .eq("id", categoryId)

    fetchData()
  }

  async function createProduct() {

    if (!newProductName.trim()) return

    try {

      const { error } = await supabase
        .from("products")
        .insert([{
          name: newProductName,
          category_id: newProductCategory || null,
          packaging: newProductPackaging || null
        }])
        .select()
        .single()

      if (error) throw error

      setNewProductName("")
      setNewProductCategory("")
      setNewProductPackaging("")

      fetchData()

    } catch (err) {

      console.error("Erreur createProduct:", err)

    }
  }

  async function updatePackaging(productId, value) {

    await supabase
      .from("products")
      .update({
        packaging: value || null
      })
      .eq("id", productId)
  }

  async function toggleVisibility(productId, locationId, isVisible) {
    try {
      const query = isVisible
        ? supabase
            .from("product_location_settings")
            .upsert(
              { product_id: productId, location_id: locationId },
              {
                onConflict: "product_id,location_id",
                ignoreDuplicates: true,
              }
            )
        : supabase
            .from("product_location_settings")
            .delete()
            .eq("product_id", productId)
            .eq("location_id", locationId)

      const { error } = await query
      if (error) throw error
    } catch (error) {
      console.error("Erreur modification visibilité :", error)
      alert("La visibilité n'a pas pu être modifiée")
    } finally {
      await fetchData()
    }
  }

  async function updateCategory(productId, categoryId) {

    await supabase
      .from("products")
      .update({
        category_id: categoryId || null
      })
      .eq("id", productId)
  }

  async function deleteProduct(productId) {

    const confirmDelete = window.confirm(
      "Supprimer ce produit ?"
    )

    if (!confirmDelete) return

    await supabase
      .from("products")
      .delete()
      .eq("id", productId)

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

      {/* CATEGORIES */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-6">

        <div className="space-y-4">

          <h2 className="text-lg font-semibold text-slate-900">
            Catégories
          </h2>

          <div className="flex gap-3 flex-wrap">

            <input
              value={newCategoryName}
              onChange={(e) => setNewCategoryName(e.target.value)}
              placeholder="Nom catégorie"
              className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
            />

            <button
              onClick={createCategory}
              className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
            >
              Ajouter
            </button>

          </div>

        </div>

        <div className="space-y-3">

          {categories.map(category => {

            const isEditing = editingCategoryId === category.id

            return (
              <div
                key={category.id}
                className="flex items-center justify-between gap-4 border border-slate-200 rounded-xl p-3"
              >

                <div className="flex-1">

                  {isEditing ? (

                    <input
                      value={editingCategoryName}
                      onChange={(e) =>
                        setEditingCategoryName(e.target.value)
                      }
                      className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-full"
                    />

                  ) : (

                    <div className="font-medium text-slate-800">
                      {category.name}
                    </div>

                  )}

                </div>

                <div className="flex gap-2">

                  {isEditing ? (

                    <button
                      onClick={saveCategoryEdit}
                      className="bg-green-600 hover:bg-green-700 text-white px-3 py-1.5 rounded-lg text-xs"
                    >
                      OK
                    </button>

                  ) : (

                    <button
                      onClick={() => startEditCategory(category)}
                      className="bg-slate-700 hover:bg-slate-800 text-white px-3 py-1.5 rounded-lg text-xs"
                    >
                      Modifier
                    </button>

                  )}

                  <button
                    onClick={() => deleteCategory(category.id)}
                    className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded-lg text-xs"
                  >
                    Supprimer
                  </button>

                </div>

              </div>
            )
          })}

        </div>

      </div>

      {/* CREATION PRODUIT */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5">

        <h2 className="text-lg font-semibold text-slate-900">
          Ajouter un produit
        </h2>

        <div className="flex gap-3 flex-wrap">

          <input
            value={newProductName}
            onChange={(e) => setNewProductName(e.target.value)}
            placeholder="Nom produit"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />

          <input
            value={newProductPackaging}
            onChange={(e) => setNewProductPackaging(e.target.value)}
            placeholder="Conditionnement (ex : 24x33cl)"
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
          />

          <select
            value={newProductCategory}
            onChange={(e) => setNewProductCategory(e.target.value)}
            className="border border-slate-300 rounded-lg px-3 py-2 text-sm"
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
            className="bg-slate-900 hover:bg-slate-800 text-white px-4 py-2 rounded-lg text-sm font-medium"
          >
            Ajouter
          </button>

        </div>

      </div>

      {/* RECHERCHE */}
      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-4">

        <h2 className="text-lg font-semibold text-slate-900">
          Rechercher un produit
        </h2>

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher..."
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm w-64"
        />

      </div>

      {/* TABLEAUX PAR CATEGORIE */}
      {Object.entries(groupedProducts).map(([category, items]) => (

        <div
          key={`category-${category}`}
          className="space-y-4"
        >

          <h2 className="text-base font-semibold text-slate-800">
            {category}
          </h2>

          <div className="overflow-x-auto bg-white border border-slate-200 rounded-2xl shadow-sm">

            <table className="min-w-full text-sm">

              <thead className="bg-slate-100 text-xs uppercase text-slate-600">

                <tr>
                  <th className="px-4 py-3 text-left">
                    Produit
                  </th>

                  <th className="px-4 py-3 text-center">
                    Catégorie
                  </th>

                  {poles.map(p => (
                    <th
                      key={p.id}
                      className="px-4 py-3 text-center"
                    >
                      {p.name}
                    </th>
                  ))}

                  <th className="px-4 py-3 text-center">
                    Supprimer
                  </th>

                </tr>

              </thead>

              <tbody className="divide-y divide-slate-100">

                {items.map(product => (

                  <tr
                    key={product.id}
                    className="hover:bg-slate-50 transition-colors"
                  >

                    <td className="px-4 py-3 text-slate-800">

                      <div className="font-medium">
                        {product.name}
                      </div>

                      <input
                        defaultValue={product.packaging || ""}
                        onBlur={(e) =>
                          updatePackaging(product.id, e.target.value)
                        }
                        placeholder="Conditionnement..."
                        className="mt-1 text-xs text-slate-500 border border-slate-200 rounded px-2 py-1 w-full"
                      />

                    </td>

                    <td className="px-4 py-3 text-center">

                      <select
                        value={product.category_id || ""}
                        onChange={(e) =>
                          updateCategory(product.id, e.target.value)
                        }
                        className="border border-slate-300 rounded-lg px-2 py-1 text-sm"
                      >

                        <option value="">
                          Sans catégorie
                        </option>

                        {categories.map(cat => (
                          <option
                            key={cat.id}
                            value={cat.id}
                          >
                            {cat.name}
                          </option>
                        ))}

                      </select>

                    </td>

                    {poles.map(pole => (

                      <td
                        key={pole.id}
                        className="px-4 py-3 text-center"
                      >

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
                        className="bg-red-700 hover:bg-red-800 text-white px-3 py-1.5 rounded-lg text-xs font-medium"
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
