"use client"

import { useEffect, useMemo, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function DlcTab({
  locationId,
  canAddBatch = false,
  allowLocationSelect = false,
}) {
  const [myLocationId, setMyLocationId] = useState(locationId || null)
  const [targetLocationId, setTargetLocationId] = useState(locationId || "")
  const [availableLocations, setAvailableLocations] = useState([])

  const [batches, setBatches] = useState([])
  const [batchDraft, setBatchDraft] = useState({})
  const [products, setProducts] = useState([])
  const [search, setSearch] = useState("")
  const [statusFilter, setStatusFilter] = useState("all")
  const [isSubmitting, setIsSubmitting] = useState(false)
  const [message, setMessage] = useState("")

  const [newBatch, setNewBatch] = useState({
    product_id: "",
    quantity: "",
    expiration_date: "",
  })

  useEffect(() => {
    if (locationId) {
      setMyLocationId(locationId)
      if (!allowLocationSelect) {
        setTargetLocationId(locationId)
      }
    } else {
      fetchMyLocation()
    }
  }, [locationId, allowLocationSelect])

  useEffect(() => {
    if (allowLocationSelect) {
      fetchPoleLocations()
    }
  }, [allowLocationSelect])

  useEffect(() => {
    if (myLocationId && !allowLocationSelect && locationId) {
      setTargetLocationId(locationId)
    }
  }, [myLocationId, allowLocationSelect, locationId])

  useEffect(() => {
    if (targetLocationId) {
      fetchDlcData()
    } else {
      setProducts([])
      setBatches([])
      setBatchDraft({})
    }
  }, [targetLocationId])

  async function fetchMyLocation() {
    const {
      data: { user },
      error: userError,
    } = await supabase.auth.getUser()

    if (userError) {
      console.error(userError)
      return
    }

    if (!user) return

    const { data, error } = await supabase
      .from("profiles")
      .select("location_id")
      .eq("id", user.id)
      .single()

    if (error) {
      console.error(error)
      return
    }

    if (data?.location_id) {
      setMyLocationId(data.location_id)

      if (!allowLocationSelect) {
        setTargetLocationId(data.location_id)
      }
    }
  }

  async function fetchPoleLocations() {
    const { data, error } = await supabase
      .from("locations")
      .select("id, name")
      .eq("type", "pole")
      .order("name")

    if (error) {
      console.error(error)
      return
    }

    const poles = data || []
    setAvailableLocations(poles)

    setTargetLocationId((prev) => {
      if (prev) return prev
      return poles[0]?.id || ""
    })
  }

  function getBatchStatus(expirationDate) {
    if (!expirationDate) return "ok"

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const limit = new Date()
    limit.setHours(0, 0, 0, 0)
    limit.setDate(limit.getDate() + 3)

    const exp = new Date(expirationDate)
    exp.setHours(0, 0, 0, 0)

    if (exp < today) return "expired"
    if (exp <= limit) return "warning"
    return "ok"
  }

  function formatDate(dateString) {
    if (!dateString) return "Sans DLC"
    return new Date(dateString).toLocaleDateString("fr-FR")
  }

  function getDaysLeft(dateString) {
    if (!dateString) return null

    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const exp = new Date(dateString)
    exp.setHours(0, 0, 0, 0)

    return Math.round((exp - today) / (1000 * 60 * 60 * 24))
  }

  async function fetchDlcData() {
    try {
      setMessage("")

      const { data: visibility, error: visibilityError } = await supabase
        .from("product_location_settings")
        .select("product_id")
        .eq("location_id", targetLocationId)

      if (visibilityError) throw visibilityError

      const visibleProductIds = visibility?.map((v) => v.product_id) || []

      if (visibleProductIds.length === 0) {
        setProducts([])
        setBatches([])
        setBatchDraft({})
        return
      }

      const { data: productsData, error: productsError } = await supabase
        .from("products")
        .select("id, name, packaging, has_expiration, categories(name)")
        .in("id", visibleProductIds)
        .eq("has_expiration", true)
        .order("name")

      if (productsError) throw productsError

      const dlcProducts = productsData || []
      const dlcProductIds = dlcProducts.map((p) => p.id)

      setProducts(dlcProducts)

      if (dlcProductIds.length === 0) {
        setBatches([])
        setBatchDraft({})
        return
      }

      const { data: batchesData, error: batchesError } = await supabase
        .from("stock_batches")
        .select("*")
        .eq("location_id", targetLocationId)
        .in("product_id", dlcProductIds)
        .order("expiration_date", { ascending: true })

      if (batchesError) throw batchesError

      const sourceMovementIds = [
        ...new Set(
          (batchesData || []).map((b) => b.source_movement_id).filter(Boolean)
        ),
      ]

      let movementMap = {}

      if (sourceMovementIds.length > 0) {
        const { data: movements, error: movementsError } = await supabase
          .from("movements")
          .select("id, effective_date")
          .in("id", sourceMovementIds)

        if (movementsError) throw movementsError

        movements?.forEach((m) => {
          movementMap[m.id] = m.effective_date
        })
      }

      const now = new Date()

      const validBatches = (batchesData || [])
        .filter((b) => {
          const effectiveDate = movementMap[b.source_movement_id]
          const isActive = !effectiveDate || new Date(effectiveDate) <= now
          return isActive && Number(b.quantity || 0) > 0
        })
        .map((b) => {
          const product = dlcProducts.find((p) => p.id === b.product_id)
          return {
            ...b,
            products: product || null,
            status: getBatchStatus(b.expiration_date),
          }
        })

      setBatches(validBatches)

      const draft = {}
      validBatches.forEach((batch) => {
        draft[batch.id] = Number(batch.quantity || 0)
      })
      setBatchDraft(draft)
    } catch (err) {
      console.error(err)
      setMessage("Erreur lors du chargement des DLC")
    }
  }

  function updateBatchDraft(batchId, value) {
    const parsed = parseInt(value, 10)
    setBatchDraft((prev) => ({
      ...prev,
      [batchId]: Number.isNaN(parsed) ? 0 : parsed,
    }))
  }

  function updateNewBatch(field, value) {
    setNewBatch((prev) => ({
      ...prev,
      [field]: value,
    }))
  }

  const filteredBatches = useMemo(() => {
    return batches.filter((batch) => {
      const matchesSearch =
        batch.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
        false

      const matchesStatus =
        statusFilter === "all" ? true : batch.status === statusFilter

      return matchesSearch && matchesStatus
    })
  }, [batches, search, statusFilter])

  const grouped = useMemo(() => {
    return filteredBatches.reduce((acc, batch) => {
      const productName = batch.products?.name || "Produit"
      if (!acc[productName]) acc[productName] = []
      acc[productName].push(batch)
      return acc
    }, {})
  }, [filteredBatches])

    async function handleAddBatchOnly() {
    try {
      setIsSubmitting(true)
      setMessage("")

      if (!canAddBatch) {
        throw new Error("Ajout de lot non autorisé")
      }

      if (!targetLocationId) {
        throw new Error("Sélectionnez un pôle")
      }

      if (!newBatch.product_id) {
        throw new Error("Choisissez un produit")
      }

      if (!newBatch.quantity || Number(newBatch.quantity) <= 0) {
        throw new Error("Quantité invalide")
      }

      if (!newBatch.expiration_date) {
        throw new Error("Choisissez une DLC")
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) throw new Error("Utilisateur non connecté")

      const quantity = Number(newBatch.quantity)

      const { data: movement, error: movementError } = await supabase
        .from("movements")
        .insert({
          product_id: newBatch.product_id,
          quantity,
          type: "correction",
          destination_location_id: targetLocationId,
          user_id: user.id,
        })
        .select()
        .single()

      if (movementError) throw movementError

      const { error: insertBatchError } = await supabase
        .from("stock_batches")
        .insert({
          product_id: newBatch.product_id,
          location_id: targetLocationId,
          quantity,
          expiration_date: newBatch.expiration_date,
          source_movement_id: movement.id,
        })

      if (insertBatchError) throw insertBatchError

      setNewBatch({
        product_id: "",
        quantity: "",
        expiration_date: "",
      })

      setMessage("Lot ajouté ✅")
      await fetchDlcData()
    } catch (err) {
      console.error(err)
      setMessage(err.message || "Erreur")
    } finally {
      setIsSubmitting(false)
    }
  }

  async function handleValidate() {
    try {
      setIsSubmitting(true)
      setMessage("")

      if (!targetLocationId) {
        throw new Error("Sélectionnez un pôle")
      }

      const {
        data: { user },
        error: userError,
      } = await supabase.auth.getUser()

      if (userError) throw userError
      if (!user) throw new Error("Utilisateur non connecté")

      for (const batch of batches) {
        const oldQty = Number(batch.quantity || 0)
        const newQty = Number(batchDraft[batch.id] ?? oldQty)

        if (newQty === oldQty) continue

        if (newQty < 0) {
          throw new Error(
            `Quantité invalide pour ${batch.products?.name || "un produit"}`
          )
        }

        const diff = newQty - oldQty

        if (diff < 0) {
          const qtyRemoved = Math.abs(diff)

          const { error: movementError } = await supabase
            .from("movements")
            .insert({
              product_id: batch.product_id,
              quantity: qtyRemoved,
              type: "sortie",
              source_location_id: targetLocationId,
              user_id: user.id,
            })

          if (movementError) throw movementError

          if (newQty === 0) {
            const { error: deleteError } = await supabase
              .from("stock_batches")
              .delete()
              .eq("id", batch.id)

            if (deleteError) throw deleteError
          } else {
            const { error: updateError } = await supabase
              .from("stock_batches")
              .update({ quantity: newQty })
              .eq("id", batch.id)

            if (updateError) throw updateError
          }
        }

        if (diff > 0) {
          const { data: movement, error: movementError } = await supabase
            .from("movements")
            .insert({
              product_id: batch.product_id,
              quantity: diff,
              type: "correction",
              source_location_id: targetLocationId,
              user_id: user.id,
            })
            .select()
            .single()

          if (movementError) throw movementError

          const { error: updateError } = await supabase
            .from("stock_batches")
            .update({
              quantity: newQty,
              source_movement_id: movement.id,
            })
            .eq("id", batch.id)

          if (updateError) throw updateError
        }
      }

      if (
        canAddBatch &&
        newBatch.product_id &&
        Number(newBatch.quantity) > 0 &&
        newBatch.expiration_date
      ) {
        const quantity = Number(newBatch.quantity)

        const { data: movement, error: movementError } = await supabase
          .from("movements")
          .insert({
            product_id: newBatch.product_id,
            quantity,
            type: "correction",
            destination_location_id: targetLocationId,
            user_id: user.id,
          })
          .select()
          .single()

        if (movementError) throw movementError

        const { error: insertBatchError } = await supabase
          .from("stock_batches")
          .insert({
            product_id: newBatch.product_id,
            location_id: targetLocationId,
            quantity,
            expiration_date: newBatch.expiration_date,
            source_movement_id: movement.id,
          })

        if (insertBatchError) throw insertBatchError
      }

      setNewBatch({
        product_id: "",
        quantity: "",
        expiration_date: "",
      })

      setMessage("Mise à jour DLC OK ✅")
      await fetchDlcData()
    } catch (err) {
      console.error(err)
      setMessage(err.message || "Erreur")
    } finally {
      setIsSubmitting(false)
    }
  }

  function renderStatusBadge(status, expirationDate) {
    const daysLeft = getDaysLeft(expirationDate)

    if (status === "expired") {
      return (
        <span className="text-xs bg-red-100 text-red-700 px-2 py-0.5 rounded-full">
          Expiré
        </span>
      )
    }

    if (status === "warning") {
      return (
        <span className="text-xs bg-orange-100 text-orange-700 px-2 py-0.5 rounded-full">
          {daysLeft === 0 ? "Expire aujourd’hui" : `Urgent (${daysLeft} j)`}
        </span>
      )
    }

    return (
      <span className="text-xs bg-emerald-100 text-emerald-700 px-2 py-0.5 rounded-full">
        OK
      </span>
    )
  }

  return (
    <div className="space-y-8">
      <h2 className="text-xl font-semibold">Produits avec DLC</h2>

      {allowLocationSelect && (
        <select
          value={targetLocationId}
          onChange={(e) => setTargetLocationId(e.target.value)}
          className="border px-4 py-2 rounded-lg w-full"
        >
          <option value="">Choisir un pôle</option>
          {availableLocations.map((loc) => (
            <option key={loc.id} value={loc.id}>
              {loc.name}
            </option>
          ))}
        </select>
      )}

      <div className="grid md:grid-cols-2 gap-3">
        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher un produit..."
          className="border px-4 py-2 rounded-lg w-full"
        />

        <select
          value={statusFilter}
          onChange={(e) => setStatusFilter(e.target.value)}
          className="border px-4 py-2 rounded-lg w-full"
        >
          <option value="all">Tous les statuts</option>
          <option value="ok">OK</option>
          <option value="warning">Urgent</option>
          <option value="expired">Expiré</option>
        </select>
      </div>

      {canAddBatch && (
        <div className="bg-white p-4 rounded-xl shadow space-y-4">
          <h3 className="font-semibold">Ajouter un lot</h3>

          <div className="grid md:grid-cols-3 gap-3">
            <select
              value={newBatch.product_id}
              onChange={(e) => updateNewBatch("product_id", e.target.value)}
              className="border px-3 py-2 rounded-lg"
            >
              <option value="">Choisir un produit</option>
              {products.map((product) => (
                <option key={product.id} value={product.id}>
                  {product.name}
                </option>
              ))}
            </select>

            <input
              type="number"
              min="1"
              value={newBatch.quantity}
              onChange={(e) => updateNewBatch("quantity", e.target.value)}
              placeholder="Quantité"
              className="border px-3 py-2 rounded-lg"
            />

            <input
              type="date"
              value={newBatch.expiration_date}
              onChange={(e) =>
                updateNewBatch("expiration_date", e.target.value)
              }
              className="border px-3 py-2 rounded-lg"
            />
                        <button
              type="button"
              onClick={handleAddBatchOnly}
              disabled={isSubmitting}
              className="bg-slate-800 text-white px-4 py-2 rounded-lg"
            >
              {isSubmitting ? "Ajout..." : "Ajouter le lot"}
            </button>
          </div>
        </div>
      )}

      {Object.entries(grouped).length === 0 ? (
        <div className="text-sm text-slate-500">
          Aucun lot DLC à afficher.
        </div>
      ) : (
        Object.entries(grouped).map(([productName, productBatches]) => (
          <div key={productName} className="space-y-3">
            <h3 className="font-semibold">{productName}</h3>

            <div className="space-y-3">
              {productBatches.map((batch) => (
                <div
                  key={batch.id}
                  className="bg-white p-4 rounded-xl shadow space-y-3"
                >
                  <div className="flex items-center justify-between gap-3 flex-wrap">
                    <div className="font-medium">
                      DLC : {formatDate(batch.expiration_date)}
                    </div>

                    {renderStatusBadge(batch.status, batch.expiration_date)}
                  </div>

                  <div className="flex justify-between text-sm text-slate-500">
                    <span>Stock actuel</span>
                    <span>{batch.quantity}</span>
                  </div>

                  <div className="flex justify-between text-sm">
                    <span>Stock restant</span>
                    <input
                      type="number"
                      min="0"
                      value={batchDraft[batch.id] ?? batch.quantity}
                      onChange={(e) =>
                        updateBatchDraft(batch.id, e.target.value)
                      }
                      className="w-24 border rounded text-center"
                    />
                  </div>
                </div>
              ))}
            </div>
          </div>
        ))
      )}

      <button
        onClick={handleValidate}
        disabled={isSubmitting}
        className="bg-slate-900 text-white px-6 py-2 rounded-lg"
      >
        {isSubmitting ? "Enregistrement..." : "Valider"}
      </button>

      {message && <div>{message}</div>}
    </div>
  )
}