"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function AdminProductsPage() {
  const router = useRouter()

  const [products, setProducts] = useState([])
  const [categories, setCategories] = useState([])

  const [newName, setNewName] = useState("")
  const [newCategory, setNewCategory] = useState("")

  const [editingId, setEditingId] = useState(null)
  const [editingName, setEditingName] = useState("")
  const [editingCategory, setEditingCategory] = useState("")

  useEffect(() => {
    checkAccess()
    fetchProducts()
    fetchCategories()
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      router.push("/login")
    }
  }

  async function fetchProducts() {
    const { data } = await supabase
      .from("products")
      .select(`
        id,
        name,
        category_id,
        categories (
          id,
          name
        )
      `)
      .order("name")

    setProducts(data || [])
  }

  async function fetchCategories() {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("name")

    setCategories(data || [])
  }

  async function handleAddProduct() {
  if (!newName || !newCategory) return

  const { data: productData, error } = await supabase
    .from("products")
    .insert([
      {
        name: newName,
        category_id: newCategory
      }
    ])
    .select()
    .single()

  if (error) return

  const newProductId = productData.id

  // 🔥 récupérer toutes les locations
  const { data: locations } = await supabase
    .from("locations")
    .select("id")

  // 🔥 créer les stocks à 0
  const stockRows = locations.map(loc => ({
    product_id: newProductId,
    location_id: loc.id,
    quantity: 0
  }))

  await supabase.from("stocks").insert(stockRows)

  setNewName("")
  setNewCategory("")
  fetchProducts()
}

  async function handleDeleteProduct(id, name) {
    const confirmed = window.confirm(
      `Supprimer le produit "${name}" ?`
    )

    if (!confirmed) return

    await supabase
      .from("products")
      .delete()
      .eq("id", id)

    fetchProducts()
  }

  async function handleSaveEdit() {
    await supabase
      .from("products")
      .update({
        name: editingName,
        category_id: editingCategory
      })
      .eq("id", editingId)

    setEditingId(null)
    fetchProducts()
  }

  const categoryStats = categories.map(cat => ({
  name: cat.name,
  count: products.filter(p => p.category_id === cat.id).length
}))

  return (
    <div className="p-10 space-y-10">

      <h1 className="text-3xl font-bold">
        Gestion des produits
      </h1>

      {/* Création produit */}
      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">
          Ajouter un produit
        </h2>

        <div className="flex gap-4">
          <input
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            placeholder="Nom du produit"
            className="border p-2 rounded flex-1"
          />

          <select
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="border p-2 rounded"
          >
            <option value="">Catégorie</option>
            {categories.map(cat => (
              <option key={cat.id} value={cat.id}>
                {cat.name}
              </option>
            ))}
          </select>

          <button
            onClick={handleAddProduct}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Ajouter
          </button>
        </div>
      </div>

      {/* Liste produits */}
      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">
          Produits existants
        </h2>

        <div className="space-y-3">
          {products.map(product => (
            <div
              key={product.id}
              className="flex justify-between items-center border p-3 rounded"
            >
              {editingId === product.id ? (
                <>
                  <input
                    value={editingName}
                    onChange={(e) => setEditingName(e.target.value)}
                    className="border p-1 rounded"
                  />

                  <select
                    value={editingCategory}
                    onChange={(e) => setEditingCategory(e.target.value)}
                    className="border p-1 rounded"
                  >
                    {categories.map(cat => (
                      <option key={cat.id} value={cat.id}>
                        {cat.name}
                      </option>
                    ))}
                  </select>

                  <button
                    onClick={handleSaveEdit}
                    className="text-green-600"
                  >
                    Sauvegarder
                  </button>
                </>
              ) : (
                <>
                  <div>
                    <div className="font-medium">
                      {product.name}
                    </div>
                    <div 
                    className="text-sm px-2 py-1 rounded text-white inline-block"
                    style={{ backgroundColor: product.categories?.color || "64748b" }}
                      >
                    </div>
                  </div>

                  <div className="flex gap-3">
                    <button
                      onClick={() => {
                        setEditingId(product.id)
                        setEditingName(product.name)
                        setEditingCategory(product.category_id)
                      }}
                      className="text-blue-600"
                    >
                      Modifier
                    </button>

                    <button
                      onClick={() =>
                        handleDeleteProduct(product.id, product.name)
                      }
                      className="text-red-600"
                    >
                      Supprimer
                    </button>
                  </div>
                </>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  )
}