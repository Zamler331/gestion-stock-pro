"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { executeTransfer } from "@/lib/services/transfersService"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

export default function TransferBetweenPoles() {

  const [poles, setPoles] = useState([])
  const [products, setProducts] = useState([])

  const [source, setSource] = useState("")
  const [destination, setDestination] = useState("")
  const [product, setProduct] = useState("")
  const [quantity, setQuantity] = useState("")
  const [annotation, setAnnotation] = useState("")

  const [error, setError] = useState("")
  const [loading, setLoading] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: poleData } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "pole")

    const { data: productData } = await supabase
      .from("products")
      .select("*")

    setPoles(poleData || [])
    setProducts(productData || [])
  }

  async function handleTransfer() {
    try {
      setLoading(true)
      setError("")

      await executeTransfer({
        productId: product,
        sourceLocationId: source,
        destinationLocationId: destination,
        quantity: parseInt(quantity),
        annotation
      })

      setQuantity("")
      setAnnotation("")
      alert("Transfert effectué ✅")

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
        Transfert entre pôles
      </h3>
      <p className="text-sm text-slate-500">
        Déplacer un produit d’un pôle vers un autre
      </p>
    </div>

    {/* FORM */}
    <div className="space-y-4">

      <select
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="w-full"
      >
        <option value="">Pôle source</option>
        {poles.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        className="w-full"
      >
        <option value="">Pôle destination</option>
        {poles.map(p => (
          <option key={p.id} value={p.id}>
            {p.name}
          </option>
        ))}
      </select>

      <select
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        className="w-full"
      >
        <option value="">Produit</option>
        {products.map(p => (
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
        className="w-full"
      />

      <textarea
        placeholder="Annotation (facultatif)"
        value={annotation}
        onChange={(e) => setAnnotation(e.target.value)}
        className="w-full"
      />

    </div>

    {/* ERROR */}
    {error && (
      <Badge variant="danger">
        {error}
      </Badge>
    )}

    {/* ACTION */}
    <div className="pt-2">
      <Button
        variant="success"
        disabled={loading}
        onClick={handleTransfer}
        className="w-full"
      >
        {loading ? "Transfert..." : "Effectuer transfert"}
      </Button>
    </div>

  </Card>
)
}