"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import { db } from "@/lib/localDB"
import { useSyncRefresh } from "@/hooks/useSyncRefresh"

export default function LivreurPage() {
  const router = useRouter()
  const [orders, setOrders] = useState([])
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    checkAccess()
    fetchOrders()
  }, [])

  useSyncRefresh(fetchOrders)

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

    if (!profile || (profile.role !== "livreur" && profile.role !== "admin")) {
      router.push("/login")
    }
  }

  async function fetchOrders() {
    const { data } = await supabase
      .from("orders")
      .select("*, products(*), locations!orders_destination_location_id_fkey(*)")
      .eq("status", "En attente")
      .order("created_at", { ascending: false })

    setOrders(data || [])
  }

  /* ========================= */
  /* VALIDATION COMMANDE */
  /* ========================= */

  async function validateOrder(order, selectedReserveId) {
    const qty = parseInt(order.quantity)

    if (isSubmitting) return

  setIsSubmitting(true)

  try {

    // OFFLINE
    if (!navigator.onLine) {
      await db.pendingActions.add({
        type: "validate_order",
        actionId: crypto.randomUUID(),
        payload: {
          order_id: order.id,
          source_location_id: selectedReserveId
        },
        synced: false,
        createdAt: new Date()
  
      })

      // Retirer visuellement la commande
      setOrders(prev => prev.filter(o => o.id !== order.id))

      setMessage("Commande enregistrée (offline) ✅")
      return
    }

    // ONLINE

    const { data: reserveStock } = await supabase
      .from("stocks")
      .select("*")
      .eq("product_id", order.product_id)
      .eq("location_id", selectedReserveId)
      .single()

    if (!reserveStock || reserveStock.quantity < qty) {
      setMessage("Stock insuffisant ❌")
      return
    }

    await supabase
      .from("stocks")
      .update({ quantity: reserveStock.quantity - qty })
      .eq("id", reserveStock.id)

    const { data: poleStock } = await supabase
      .from("stocks")
      .select("*")
      .eq("product_id", order.product_id)
      .eq("location_id", order.destination_location_id)
      .single()

    await supabase
      .from("stocks")
      .update({ quantity: poleStock.quantity + qty })
      .eq("id", poleStock.id)

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from("movements").insert([{
      product_id: order.product_id,
      type: "livraison",
      quantity: qty,
      source_location_id: selectedReserveId,
      destination_location_id: order.destination_location_id,
      user_id: user.id,
      annotation: "Livraison commande"
    }])

    await supabase
      .from("orders")
      .update({
        status: "Livré",
        source_location_id: selectedReserveId
      })
      .eq("id", order.id)

    setMessage("Commande livrée ✅")
    fetchOrders()
  } finally {
    setIsSubmitting(false)
  }
}

  return (
    <div className="p-10 space-y-8">
      <h1 className="text-3xl font-bold">Espace Livreur</h1>

      <SupplierEntry />
      <TransferBetweenPoles />

      {orders.length === 0 && <p>Aucune commande en attente</p>}

      {orders.map(order => (
  <OrderCard
    key={order.id}
    order={order}
    onValidate={validateOrder}
    isSubmitting={isSubmitting}
  />
))}

      {message && <p className="mt-4">{message}</p>}
    </div>
  )
}

/* ========================= */
/* ORDER CARD */
/* ========================= */

function OrderCard({ order, onValidate, isSubmitting }) {
  const [reserves, setReserves] = useState([])
  const [selectedReserve, setSelectedReserve] = useState("")

  useEffect(() => {
    fetchReserves()
  }, [])

  async function fetchReserves() {
    const { data } = await supabase
      .from("stocks")
      .select("*, locations(*)")
      .eq("product_id", order.product_id)
      .gt("quantity", 0)

    const reserveList = (data || []).filter(
      s => s.locations.type === "reserve"
    )

    setReserves(reserveList)

    if (reserveList.length === 1) {
      setSelectedReserve(reserveList[0].location_id)
    }
  }

  return (
    <div className="bg-white p-6 rounded shadow">
      <h2 className="font-semibold">{order.products.name}</h2>
      <p>Quantité : {order.quantity}</p>
      <p>Destination : {order.locations.name}</p>

      {reserves.length > 1 && (
        <select
          value={selectedReserve}
          onChange={(e) => setSelectedReserve(e.target.value)}
          className="border p-2 rounded w-full my-3"
        >
          <option value="">Choisir une réserve</option>
          {reserves.map(r => (
            <option key={r.id} value={r.location_id}>
              {r.locations.name} (Stock: {r.quantity})
            </option>
          ))}
        </select>
      )}

      <button
  disabled={!selectedReserve || isSubmitting}
  onClick={() => onValidate(order, selectedReserve)}
  className={`mt-3 bg-green-600 text-white px-4 py-2 rounded ${
    isSubmitting ? "opacity-50 cursor-not-allowed" : ""
  }`}
>
  {isSubmitting ? "Validation..." : "Valider livraison"}
</button>
    </div>
  )
}

/* ========================= */
/* ENTRÉE FOURNISSEUR */
/* ========================= */

function SupplierEntry() {
  const [reserves, setReserves] = useState([])
  const [products, setProducts] = useState([])
  const [selectedReserve, setSelectedReserve] = useState("")
  const [selectedProduct, setSelectedProduct] = useState("")
  const [quantity, setQuantity] = useState("")
  const [annotation, setAnnotation] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

  useEffect(() => {
    fetchData()
  }, [])

  async function fetchData() {
    const { data: reserveData } = await supabase
      .from("locations")
      .select("*")
      .eq("type", "reserve")

    const { data: productData } = await supabase
      .from("products")
      .select("*")

    setReserves(reserveData || [])
    setProducts(productData || [])
  }

  async function handleEntry() {
    

  if (isSubmitting) return
  if (!selectedReserve || !selectedProduct || !quantity) return

  setIsSubmitting(true)

  try {

  const qty = parseInt(quantity)

  // 🔴 OFFLINE
  if (!navigator.onLine) {
    await db.pendingActions.add({
      type: "supplier_entry",
      actionId: crypto.randomUUID(),
      payload: {
        product_id: selectedProduct,
        location_id: selectedReserve,
        quantity: qty,
        annotation
      },
      synced: false,
      processing: false,
      retryCount: 0,
      createdAt: new Date()
    })

    setMessage("Entrée enregistrée (offline) ✅")
    setQuantity("")
    setAnnotation("")
    return
  }

  // 🟢 ONLINE
  const { data: stock } = await supabase
    .from("stocks")
    .select("*")
    .eq("product_id", selectedProduct)
    .eq("location_id", selectedReserve)
    .single()

  await supabase
    .from("stocks")
    .update({ quantity: stock.quantity + qty })
    .eq("id", stock.id)

  const { data: { user } } = await supabase.auth.getUser()

  await supabase.from("movements").insert([{
    product_id: selectedProduct,
    type: "entry",
    quantity: qty,
    destination_location_id: selectedReserve,
    user_id: user.id,
    annotation
  }])

  setMessage("Entrée fournisseur enregistrée ✅")
  setQuantity("")
  setAnnotation("")
}finally {
    setIsSubmitting(false)
  }
}  return (
    <div className="bg-white p-6 rounded shadow mb-8">
      ...
    </div>
  )
}

/* ========================= */
/* TRANSFERT ENTRE PÔLES */
/* ========================= */

function TransferBetweenPoles() {
  const [poles, setPoles] = useState([])
  const [products, setProducts] = useState([])
  const [source, setSource] = useState("")
  const [destination, setDestination] = useState("")
  const [product, setProduct] = useState("")
  const [quantity, setQuantity] = useState("")
  const [annotation, setAnnotation] = useState("")
  const [message, setMessage] = useState("")
  const [isSubmitting, setIsSubmitting] = useState(false)

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
  if (isSubmitting) return
  if (!source || !destination || !product || !quantity) return

  setIsSubmitting(true)

  try {

  const qty = parseInt(quantity)

    // OFFLINE
    if (!navigator.onLine) {
      await db.pendingActions.add({
        type: "transfer",
        actionId: crypto.randomUUID(),
        payload: {
          product_id: product,
          quantity: qty,
          source_location_id: source,
          destination_location_id: destination,
          annotation,
          type: "transfert",
          created_at: new Date()
        },
        synced: false,
        createdAt: new Date()
      })

      setMessage("Transfert enregistré (offline) ✅")
      setQuantity("")
      setAnnotation("")
      return
    }

    // ONLINE logique classique
    setMessage("Transfert effectué ✅")
    setQuantity("")
    setAnnotation("")
  }
 finally {
    setIsSubmitting(false)
  }
}

  return (
    <div className="bg-white p-6 rounded shadow mb-8">

      <button
  onClick={() => router.push("/stocks")}
  className="bg-slate-700 text-white px-4 py-2 rounded"
>
  Vue globale des stocks
</button>

      <h2 className="text-xl font-semibold mb-4">
        Transfert entre pôles
      </h2>

      <select
        value={source}
        onChange={(e) => setSource(e.target.value)}
        className="border p-2 rounded w-full mb-3"
      >
        <option value="">Pôle source</option>
        {poles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <select
        value={destination}
        onChange={(e) => setDestination(e.target.value)}
        className="border p-2 rounded w-full mb-3"
      >
        <option value="">Pôle destination</option>
        {poles.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <select
        value={product}
        onChange={(e) => setProduct(e.target.value)}
        className="border p-2 rounded w-full mb-3"
      >
        <option value="">Produit</option>
        {products.map((p) => (
          <option key={p.id} value={p.id}>{p.name}</option>
        ))}
      </select>

      <input
        type="number"
        placeholder="Quantité"
        value={quantity}
        onChange={(e) => setQuantity(e.target.value)}
        className="border p-2 rounded w-full mb-3"
      />

      <textarea
        placeholder="Annotation (facultatif)"
        value={annotation}
        onChange={(e) => setAnnotation(e.target.value)}
        className="border p-2 rounded w-full mb-3"
      />

      <button
  onClick={handleTransfer}
  disabled={isSubmitting}
  className={`bg-purple-600 text-white px-4 py-2 rounded ${
    isSubmitting ? "opacity-50 cursor-not-allowed" : ""
  }`}
>
  {isSubmitting ? "Transfert..." : "Effectuer transfert"}
</button>

      {message && <p className="mt-3">{message}</p>}
    </div>
  )
}
