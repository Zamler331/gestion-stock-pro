"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { createStockEntry } from "@/lib/services/stockService"

export default function StockEntryTab() {

  const [products, setProducts] = useState([])
  const [search, setSearch] = useState("")
  const [selectedProduct, setSelectedProduct] = useState(null)

  const [quantity, setQuantity] = useState("")
  const [effectiveDate, setEffectiveDate] = useState("")
  const [expirationDate, setExpirationDate] = useState("")

  const [loading, setLoading] = useState(false)
  const [message, setMessage] = useState("")
  const [locations, setLocations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState("")

  /* ========================= */
  /* FETCH PRODUITS */
  /* ========================= */

  useEffect(() => {
    fetchProducts()
    fetchLocations()
  }, [])

  async function fetchProducts() {

    const { data, error } = await supabase
      .from("products")
      .select(`
        id,
        name,
        packaging,
        categories ( name )
      `)
      .order("name")

    if (error) {
      console.error(error)
      return
    }

    setProducts(data || [])
  }

  async function fetchLocations() {

  const { data, error } = await supabase
    .from("locations")
    .select("id, name, type")
    .order("name")

  if (error) {
    console.error(error)
    return
  }

  // 👉 option recommandée : seulement les réserves
  const reserves = data.filter(l => l.type === "reserve")

  setLocations(reserves)

  if (reserves.length > 0) {
    setSelectedLocation(reserves[0].id)
  }
}

  /* ========================= */
  /* FILTRE */
  /* ========================= */

  const filtered = products.filter(p =>
    p.name.toLowerCase().includes(search.toLowerCase())
  )

  /* ========================= */
  /* SUBMIT */
  /* ========================= */

  async function handleSubmit() {

    if (!selectedProduct) {
      setMessage("Sélectionner un produit")
      return
    }

    if (!quantity || quantity <= 0) {
      setMessage("Quantité invalide")
      return
    }

    try {

      setLoading(true)
      setMessage("")

      await createStockEntry({
        product_id: selectedProduct.id,
        location_id: selectedLocation,
        quantity: parseInt(quantity),
        expiration_date: expirationDate || null,
        effective_date: effectiveDate
          ? new Date(effectiveDate + "T00:00:00")
          : null
      })

      setMessage("Entrée enregistrée ✅")

      setSelectedProduct(null)
      setQuantity("")
      setEffectiveDate("")
      setExpirationDate("")
      setSearch("")

    } catch (err) {

      console.error(err)
      setMessage("Erreur lors de l'entrée")

    } finally {

      setLoading(false)

    }

  }

  /* ========================= */
  /* UI */
  /* ========================= */

  return (
    <div className="space-y-8">

      <h2 className="text-2xl font-semibold">
        Entrée de stock
      </h2>

      {/* SEARCH */}

      <input
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Rechercher un produit..."
        className="border px-4 py-2 rounded-lg w-full"
      />

      {/* LISTE PRODUITS */}

      {!selectedProduct && (
        <div className="bg-white border rounded-xl max-h-60 overflow-y-auto">

          {filtered.map(p => (
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

      {/* FORMULAIRE */}

      {selectedProduct && (

        <div className="bg-white p-6 rounded-2xl shadow space-y-4">

          <div>
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

          <div>
         <label className="text-sm text-slate-500">
           Destination
          </label>

          <select
            value={selectedLocation}
            onChange={(e) => setSelectedLocation(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
          >
            {locations.map(loc => (
              <option key={loc.id} value={loc.id}>
                {loc.name}
              </option>
            ))}
          </select>
        </div>

          {/* QUANTITÉ */}

          <input
            type="number"
            placeholder="Quantité"
            value={quantity}
            onChange={(e) => setQuantity(e.target.value)}
            className="border px-3 py-2 rounded-lg w-full"
          />

          {/* DATE EFFET */}

          <div>
            <label className="text-sm text-slate-500">
              Date d'effet
            </label>
            <input
              type="date"
              value={effectiveDate}
              onChange={(e) => setEffectiveDate(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full"
            />
          </div>

          {/* DLC */}

          <div>
            <label className="text-sm text-slate-500">
              DLC (optionnelle)
            </label>
            <input
              type="date"
              value={expirationDate}
              onChange={(e) => setExpirationDate(e.target.value)}
              className="border px-3 py-2 rounded-lg w-full"
            />
          </div>

          {/* BOUTON */}

          <button
            onClick={handleSubmit}
            disabled={loading}
            className="bg-slate-900 text-white px-6 py-2 rounded-lg"
          >
            {loading ? "Enregistrement..." : "Ajouter entrée"}
          </button>

        </div>

      )}

      {/* MESSAGE */}

      {message && (
        <div className="text-sm text-slate-600">
          {message}
        </div>
      )}

    </div>
  )
}