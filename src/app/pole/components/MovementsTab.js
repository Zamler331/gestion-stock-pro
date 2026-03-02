"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function MovementsTab({ locationId }) {

  const [products, setProducts] = useState([])
  const [selectedProduct, setSelectedProduct] = useState("")
  const [quantity, setQuantity] = useState("")
  const [type, setType] = useState("sortie")
  const [annotation, setAnnotation] = useState("")
  const [movements, setMovements] = useState([])
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  /* ========================= */
  /* FETCH DATA */
  /* ========================= */

  useEffect(() => {
    if (locationId) {
      fetchProducts()
      fetchMovements()
    }
  }, [locationId])

  async function fetchProducts() {

    const { data } = await supabase
      .from("stocks")
      .select(`
        product_id,
        products ( id, name )
      `)
      .eq("location_id", locationId)

    setProducts(data || [])
  }

  async function fetchMovements() {

    const { data } = await supabase
      .from("movements")
      .select(`
        *,
        products ( name )
      `)
      .eq("source_location_id", locationId)
      .order("created_at", { ascending: false })
      .limit(50)

    setMovements(data || [])
  }

  /* ========================= */
  /* HANDLE SUBMIT */
  /* ========================= */

  async function handleMovement() {

    if (!selectedProduct || !quantity) {
      setMessage("Tous les champs sont requis ❌")
      return
    }

    setIsSubmitting(true)

    try {

      const qty = parseInt(quantity)

      const { data: stock } = await supabase
        .from("stocks")
        .select("*")
        .eq("product_id", selectedProduct)
        .eq("location_id", locationId)
        .single()

      if (!stock) {
        setMessage("Stock introuvable ❌")
        return
      }

      let newQuantity = stock.quantity

      if (type === "sortie") {
        if (stock.quantity < qty) {
          setMessage("Stock insuffisant ❌")
          return
        }
        newQuantity = stock.quantity - qty
      }

      if (type === "correction") {
        newQuantity = qty
      }

      // Update stock
      await supabase
        .from("stocks")
        .update({ quantity: newQuantity })
        .eq("id", stock.id)

      // Insert movement
      const { data: { user } } =
        await supabase.auth.getUser()

      await supabase.from("movements").insert([{
        product_id: selectedProduct,
        type: type,
        quantity: type === "sortie" ? -qty : newQuantity - stock.quantity,
        source_location_id: locationId,
        user_id: user.id,
        annotation
      }])

      setMessage("Mouvement enregistré ✅")
      setQuantity("")
      setAnnotation("")
      fetchMovements()

    } finally {
      setIsSubmitting(false)
    }
  }

  /* ========================= */
  /* UI */
  /* ========================= */

  return (
    <div className="space-y-8">

      <h2 className="text-2xl font-bold">
        Modifications / Sorties
      </h2>

      {/* FORM */}
      <div className="bg-white p-6 rounded-2xl shadow space-y-4">

        <select
          value={selectedProduct}
          onChange={(e) =>
            setSelectedProduct(e.target.value)
          }
          className="border p-2 rounded w-full"
        >
          <option value="">Produit</option>
          {products.map(p => (
            <option
              key={p.product_id}
              value={p.product_id}
            >
              {p.products.name}
            </option>
          ))}
        </select>

        <select
          value={type}
          onChange={(e) =>
            setType(e.target.value)
          }
          className="border p-2 rounded w-full"
        >
          <option value="sortie">Sortie</option>
          <option value="correction">Correction</option>
        </select>

        <input
          type="number"
          placeholder={
            type === "correction"
              ? "Nouvelle quantité"
              : "Quantité à retirer"
          }
          value={quantity}
          onChange={(e) =>
            setQuantity(e.target.value)
          }
          className="border p-2 rounded w-full"
        />

        <textarea
          placeholder="Annotation (facultatif)"
          value={annotation}
          onChange={(e) =>
            setAnnotation(e.target.value)
          }
          className="border p-2 rounded w-full"
        />

        <button
          onClick={handleMovement}
          disabled={isSubmitting}
          className="bg-purple-600 text-white px-4 py-2 rounded"
        >
          {isSubmitting
            ? "Enregistrement..."
            : "Valider"}
        </button>

        {message && (
          <p className="text-sm text-gray-600">
            {message}
          </p>
        )}

      </div>

      {/* HISTORY */}
      <div className="bg-white p-6 rounded-2xl shadow">

        <h3 className="font-semibold mb-4">
          Historique récent
        </h3>

        <div className="space-y-3">

          {movements.map(m => (
            <div
              key={m.id}
              className="flex justify-between text-sm border-b pb-2"
            >
              <div>
                <span className="font-medium">
                  {m.products?.name}
                </span>{" "}
                ({m.type})
              </div>

              <div>
                {m.quantity}
              </div>
            </div>
          ))}

          {movements.length === 0 && (
            <p className="text-gray-500">
              Aucun mouvement
            </p>
          )}

        </div>

      </div>

    </div>
  )
}