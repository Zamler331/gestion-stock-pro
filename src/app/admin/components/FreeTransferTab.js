"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function FreeTransferTab({ role = "admin" }) {

  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [selectedProduct, setSelectedProduct] = useState(null)
  const [selectedLocation, setSelectedLocation] = useState(null)

  const [quantity, setQuantity] = useState("")
  const [expirationDate, setExpirationDate] = useState("")

  const [search, setSearch] = useState("")
  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {

    const { data: productsData } = await supabase
      .from("products")
      .select("id, name, packaging")
      .order("name")

    const { data: locationsData } = await supabase
      .from("locations")
      .select("id, name, type")
      .eq("type", "pole")

    setProducts(productsData || [])
    setLocations(locationsData || [])
  }

  const filteredProducts = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  async function handleSubmit() {

    if (!selectedProduct || !selectedLocation) {
      setMessage("Produit et destination requis")
      return
    }

    if (!quantity || quantity <= 0) {
      setMessage("Quantité invalide")
      return
    }

    try {

      setLoading(true)
      setMessage("")

      const { data: { user } } = await supabase.auth.getUser()

      /* 1️⃣ movement */

      const { data: movement, error: movementError } = await supabase
        .from("movements")
        .insert({
          product_id: selectedProduct.id,
          quantity: parseInt(quantity),
          type: "transfert_libre",
          destination_location_id: selectedLocation.id,
          user_id: user.id,
          annotation: "Livraison terrain"
        })
        .select()
        .single()

      if (movementError) throw movementError

      /* 2️⃣ batch */

      const { error: batchError } = await supabase
        .from("stock_batches")
        .insert({
          product_id: selectedProduct.id,
          location_id: selectedLocation.id,
          quantity: parseInt(quantity),
          expiration_date: expirationDate || null,
          source_movement_id: movement.id
        })

      if (batchError) throw batchError

      setMessage("Livraison enregistrée ✅")

      setSelectedProduct(null)
      setSelectedLocation(null)
      setQuantity("")
      setExpirationDate("")
      setSearch("")

    } catch (err) {

      console.error(err)
      setMessage("Erreur")

    } finally {

      setLoading(false)
    }
  }

  return (
    <div className="space-y-8">

      <h2 className="text-2xl font-semibold">
        Livraison terrain
      </h2>

      {/* SEARCH PRODUIT */}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit..."
        className="border px-4 py-2 rounded-lg w-full"
      />

      {!selectedProduct && (
        <div className="bg-white border rounded-xl max-h-60 overflow-y-auto">

          {filteredProducts.map(p => (
            <div
              key={p.id}
              onClick={() => setSelectedProduct(p)}
              className="p-3 hover:bg-slate-100 cursor-pointer"
            >
              <div className="font-medium">{p.name}</div>
              <div className="text-xs text-slate-400">
                {p.packaging}
              </div>
            </div>
          ))}

        </div>
      )}

      {/* FORM */}

      {selectedProduct && (

        <div className="bg-white p-6 rounded-2xl shadow space-y-4">

          <div className="flex justify-between items-center">
            <div className="font-semibold">
              {selectedProduct.name}
            </div>
            <button
              onClick={() => setSelectedProduct(null)}
              className="text-xs text-red-500"
            >
              Changer
            </button>
          </div>

          {/* DESTINATION */}

          <select
            value={selectedLocation?.id || ""}
            onChange={(e) =>
              setSelectedLocation(
                locations.find(l => l.id === e.target.value)
              )
            }
            className="border px-3 py-2 rounded-lg w-full"
          >
            <option value="">Choisir un pôle</option>
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>

          {/* QUANTITÉ */}

          <input
            type="number"
            placeholder="Quantité"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
          />

          {/* DLC */}

          <input
            type="date"
            value={expirationDate}
            onChange={(e) => setExpirationDate(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
          />

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-slate-900 text-white px-6 py-2 rounded-lg"
          >
            {loading ? "Enregistrement..." : "Valider livraison"}
          </button>

        </div>

      )}

      {message && (
        <div className="text-sm text-slate-600">
          {message}
        </div>
      )}

    </div>
  )
}