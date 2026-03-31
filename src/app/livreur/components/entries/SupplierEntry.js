"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { executeSupplierEntry } from "@/lib/services/entriesService"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

export default function SupplierEntry() {
  const [reserves, setReserves] = useState([])
  const [products, setProducts] = useState([])

  const [selectedReserve, setSelectedReserve] = useState("")
  const [selectedProduct, setSelectedProduct] = useState("")
  const [quantity, setQuantity] = useState("")
  const [annotation, setAnnotation] = useState("")

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: reserveData, error: reserveError } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "reserve")
      .order("name")

    const { data: productData, error: productError } = await supabase
      .from("products")
      .select("*")
      .order("name")

    if (reserveError) {
      console.error(reserveError)
      setError("Erreur chargement réserves")
      return
    }

    if (productError) {
      console.error(productError)
      setError("Erreur chargement produits")
      return
    }

    setReserves(reserveData || [])
    setProducts(productData || [])
  }

  async function handleEntry() {
    try {
      setLoading(true)
      setError("")
      setSuccess("")

      if (!selectedReserve) {
        throw new Error("Choisissez une réserve")
      }

      if (!selectedProduct) {
        throw new Error("Choisissez un produit")
      }

      if (!quantity || Number(quantity) <= 0) {
        throw new Error("Quantité invalide")
      }

      await executeSupplierEntry({
        productId: selectedProduct,
        locationId: selectedReserve,
        quantity: parseInt(quantity, 10),
        annotation,
      })

      setSuccess("Entrée enregistrée ✅")
      setQuantity("")
      setAnnotation("")
      setSelectedProduct("")
    } catch (err) {
      console.error(err)
      setError(err.message || "Erreur")
    } finally {
      setLoading(false)
    }
  }

  return (
    <Card className="p-6 space-y-6">
      <div className="space-y-1">
        <h3 className="text-lg font-semibold text-slate-900">
          Entrée fournisseur
        </h3>
        <p className="text-sm text-slate-500">
          Ajouter du stock en réserve
        </p>
      </div>

      <div className="space-y-4">
        <select
          value={selectedReserve}
          onChange={(e) => setSelectedReserve(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        >
          <option value="">Choisir une réserve</option>
          {reserves.map((r) => (
            <option key={r.id} value={r.id}>
              {r.name}
            </option>
          ))}
        </select>

        <select
          value={selectedProduct}
          onChange={(e) => setSelectedProduct(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        >
          <option value="">Choisir un produit</option>
          {products.map((p) => (
            <option key={p.id} value={p.id}>
              {p.name}
            </option>
          ))}
        </select>

        <input
          type="number"
          placeholder="Quantité"
          value={quantity}
          onChange={(e) => setQuantity(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        />

        <textarea
          placeholder="Annotation (facultatif)"
          value={annotation}
          onChange={(e) => setAnnotation(e.target.value)}
          className="w-full border border-slate-300 rounded-lg px-3 py-2"
        />
      </div>

      {error && <Badge variant="danger">{error}</Badge>}
      {success && <Badge variant="success">{success}</Badge>}

      <div className="pt-2">
        <Button
          variant="primary"
          disabled={loading}
          onClick={handleEntry}
          className="w-full"
        >
          {loading ? "Enregistrement..." : "Valider entrée"}
        </Button>
      </div>
    </Card>
  )
}