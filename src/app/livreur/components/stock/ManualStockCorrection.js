"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { executeStockCorrection } from "@/lib/services/stockCorrectionService"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

export default function ManualStockCorrection() {

  const [locations, setLocations] = useState([])
  const [products, setProducts] = useState([])

  const [locationId, setLocationId] = useState("")
  const [productId, setProductId] = useState("")
  const [newQty, setNewQty] = useState("")
  const [reason, setReason] = useState("")

  const [error, setError] = useState("")
  const [success, setSuccess] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: locData } = await supabase
      .from("locations")
      .select("*")

    const { data: prodData } = await supabase
      .from("products")
      .select("*")

    setLocations(locData || [])
    setProducts(prodData || [])
  }

  async function handleCorrection() {
    try {
      setLoading(true)
      setError("")
      setSuccess("")

      await executeStockCorrection({
        productId,
        locationId,
        newQuantity: parseInt(newQty),
        reason
      })

      setSuccess("Stock corrigé ✅")
      setNewQty("")
      setReason("")

    } catch (err) {
      setError(err.message)
    } finally {
      setLoading(false)
    }
  }

 return (
  <Card className="p-6 space-y-6">

    {/* HEADER */}
    <div className="space-y-1">
      <h3 className="text-lg font-semibold text-slate-900">
        Correction manuelle de stock
      </h3>
      <p className="text-sm text-slate-500">
        Ajuster une quantité existante avec justification
      </p>
    </div>

    {/* FORM */}
    <div className="space-y-4">

      <select
        value={locationId}
        onChange={(e) => setLocationId(e.target.value)}
        className="w-full"
      >
        <option value="">Choisir un lieu</option>
        {locations.map(l => (
          <option key={l.id} value={l.id}>
            {l.name}
          </option>
        ))}
      </select>

      <select
        value={productId}
        onChange={(e) => setProductId(e.target.value)}
        className="w-full"
      >
        <option value="">Choisir un produit</option>
        {products.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <input
        type="number"
        placeholder="Nouvelle quantité"
        value={newQty}
        onChange={(e) => setNewQty(e.target.value)}
        className="w-full"
      />

      <textarea
        placeholder="Motif obligatoire"
        value={reason}
        onChange={(e) => setReason(e.target.value)}
        className="w-full"
      />

    </div>

    {/* STATUS */}
    {error && (
      <Badge variant="danger">
        {error}
      </Badge>
    )}

    {success && (
      <Badge variant="success">
        {success}
      </Badge>
    )}

    {/* ACTION */}
    <div className="pt-2">
      <Button
        variant="danger"
        disabled={loading}
        onClick={handleCorrection}
        className="w-full"
      >
        {loading ? "Correction..." : "Corriger le stock"}
      </Button>
    </div>

  </Card>
)
}