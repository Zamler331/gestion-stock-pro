"use client"

import { useEffect, useState, useMemo } from "react"
import {
  getGlobalStockView,
  adjustStockAtLocation,
} from "@/lib/services/stocksService"

const CATEGORY_ORDER = [
  "Epicerie",
  "Paninis",
  "Frais",
  "Surgelé",
  "Boissons",
  "Boissons (NICO)",
  "Glaces (cônes)",
  "Glaces (boules)",
  "Granités/Frozzen",
  "Confiseries",
  "Matériel",
  "Sans catégorie",
]

function compareCategories(catA, catB) {
  const a = catA || "Sans catégorie"
  const b = catB || "Sans catégorie"

  const indexA = CATEGORY_ORDER.indexOf(a)
  const indexB = CATEGORY_ORDER.indexOf(b)

  const aKnown = indexA !== -1
  const bKnown = indexB !== -1

  if (aKnown && bKnown) return indexA - indexB
  if (aKnown) return -1
  if (bKnown) return 1

  return a.localeCompare(b, "fr")
}

export default function GlobalStockTable({
  highlightLocationId = null,
  editable = false,
  editableTypes = ["pole"],
}) {
  const [products, setProducts] = useState([])
  const [locations, setLocations] = useState([])
  const [search, setSearch] = useState("")
  const [openCategories, setOpenCategories] = useState({})
  const [drafts, setDrafts] = useState({})
  const [savingRow, setSavingRow] = useState("")
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchData()
  }, [highlightLocationId])

  async function fetchData() {
    try {
      const data = await getGlobalStockView()

      const nextProducts = data?.products || []
      const nextLocations = data?.locations || []

      setProducts(nextProducts)
      setLocations(nextLocations)

      const nextDrafts = {}
      nextProducts.forEach((product) => {
        Object.entries(product.locations || {}).forEach(([locationId, locData]) => {
          nextDrafts[`${product.product_id}_${locationId}`] =
            Number(locData?.quantity ?? 0)
        })
      })
      setDrafts(nextDrafts)

      const categoryNames = [
        ...new Set(nextProducts.map((p) => p.category || "Sans catégorie")),
      ]

      const isDesktop =
        typeof window !== "undefined" ? window.innerWidth >= 768 : true

      setOpenCategories((prev) => {
        const next = { ...prev }

        categoryNames.forEach((cat) => {
          if (next[cat] === undefined) {
            next[cat] = isDesktop
          }
        })

        return next
      })
    } catch (err) {
      console.error("Erreur GlobalStockView:", err)
      setProducts([])
      setLocations([])
    }
  }

  const poleLocations = useMemo(
    () => locations.filter((l) => l.type === "pole"),
    [locations]
  )

  const reserveLocations = useMemo(
    () => locations.filter((l) => l.type === "reserve"),
    [locations]
  )

  const filtered = useMemo(() => {
    let visibleProducts = products

    if (highlightLocationId) {
      visibleProducts = products.filter(
        (p) => p.locations?.[highlightLocationId] !== undefined
      )
    }

    return visibleProducts.filter((p) =>
      (p.name || "").toLowerCase().includes(search.toLowerCase())
    )
  }, [products, search, highlightLocationId])

  const grouped = useMemo(() => {
    const groupedObj = filtered.reduce((acc, product) => {
      const cat = product.category || "Sans catégorie"
      if (!acc[cat]) acc[cat] = []
      acc[cat].push(product)
      return acc
    }, {})

    return Object.entries(groupedObj)
      .sort(([catA], [catB]) => compareCategories(catA, catB))
      .map(([category, items]) => ({
        category,
        items: items.sort((a, b) => a.name.localeCompare(b.name, "fr")),
      }))
  }, [filtered])

  function toggleCategory(cat) {
    setOpenCategories((prev) => ({
      ...prev,
      [cat]: !prev[cat],
    }))
  }

  function updateDraft(productId, locationId, value) {
    const parsed = parseInt(value, 10)

    setDrafts((prev) => ({
      ...prev,
      [`${productId}_${locationId}`]: Number.isNaN(parsed) ? 0 : parsed,
    }))
  }

  function isEditableLocation(location) {
    return editable && editableTypes.includes(location.type)
  }

  function getEditableLocationsForProduct(product, currentPole, otherPoles, reserveLocs) {
    const orderedLocations = [
      ...(currentPole ? [currentPole] : []),
      ...otherPoles,
      ...reserveLocs,
    ]

    return orderedLocations.filter((loc) => isEditableLocation(loc))
  }

  async function saveRow(product, currentPole, otherPoles, reserveLocs) {
    try {
      const editableLocations = getEditableLocationsForProduct(
        product,
        currentPole,
        otherPoles,
        reserveLocs
      )

      if (editableLocations.length === 0) return

      setSavingRow(product.product_id)
      setMessage("")

      for (const location of editableLocations) {
        const key = `${product.product_id}_${location.id}`
        const newQty = Number(drafts[key] ?? 0)
        const oldQty = Number(product.locations?.[location.id]?.quantity ?? 0)

        if (newQty === oldQty) continue
        if (newQty < 0) {
          throw new Error(`Quantité invalide pour ${product.name}`)
        }

        await adjustStockAtLocation({
          productId: product.product_id,
          locationId: location.id,
          newQuantity: newQty,
        })
      }

      await fetchData()
      setMessage("Stock mis à jour ✅")
    } catch (err) {
      console.error(err)
      setMessage(err.message || "Erreur")
    } finally {
      setSavingRow("")
    }
  }

  return (
    <div className="space-y-8">
      <div className="sticky top-0 z-30 bg-slate-200 pb-4">
        <input
          placeholder="Rechercher produit..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="
            w-full sm:w-72
            border border-slate-300
            bg-white
            px-4 py-2
            rounded-lg
            text-sm
            shadow-sm
            focus:outline-none
            focus:ring-2
            focus:ring-slate-400
          "
        />
      </div>

      {message && (
        <div className="text-sm text-slate-600">
          {message}
        </div>
      )}

      {grouped.map(({ category, items }) => {
        const currentPole = poleLocations.find((l) => l.id === highlightLocationId)

        const otherPoles = poleLocations
          .filter((l) => l.id !== highlightLocationId)
          .filter((l) =>
            items.some((product) => product.locations?.[l.id] !== undefined)
          )

        const shownReserveLocations = reserveLocations.filter((l) =>
          items.some((product) => product.locations?.[l.id] !== undefined)
        )

        const isOpen = openCategories[category] ?? true

        let hasOut = false
        let hasLow = false

        items.forEach((product) => {
          Object.values(product.locations || {}).forEach((loc) => {
            const qty = loc?.quantity ?? 0
            const threshold = loc?.threshold ?? 5

            if (qty === 0) hasOut = true
            if (qty > 0 && qty <= threshold) hasLow = true
          })
        })

        const alertColor = hasOut
          ? "bg-red-600"
          : hasLow
            ? "bg-orange-500"
            : "bg-slate-400"

        return (
          <div key={category} className="space-y-4">
            <button
              onClick={() => toggleCategory(category)}
              className="
                relative
                w-full
                flex
                justify-between
                items-center
                bg-white
                px-5 py-4
                rounded-2xl
                shadow-sm
                border border-slate-200
                hover:bg-slate-50
                transition
                group
              "
            >
              <span className={`absolute left-0 top-0 h-full w-1 rounded-l-2xl ${alertColor}`} />

              <div className="flex items-center gap-3">
                <span className="font-semibold text-slate-800">
                  {category}
                </span>

                <span className="text-xs bg-slate-100 px-2 py-0.5 rounded-full text-slate-600">
                  {items.length}
                </span>
              </div>

              <span
                className={`
                  text-slate-500
                  text-lg
                  transition-transform
                  duration-300
                  ${isOpen ? "rotate-180" : ""}
                `}
              >
                ⌄
              </span>
            </button>

            <div
              className={`
                overflow-hidden
                transition-all
                duration-500
                ease-in-out
                ${isOpen ? "max-h-[5000px] opacity-100" : "max-h-0 opacity-0"}
              `}
            >
              <div className="pt-4 space-y-6">
                <div className="hidden md:block bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">
                  <div className="overflow-auto max-h-[70vh]">
                    <table className="min-w-[950px] w-full text-sm">
                      <thead className="text-xs uppercase text-slate-600">
                        <tr>
                          <th className="sticky top-0 left-0 z-40 bg-slate-100 px-6 py-4 text-left">
                            Produit
                          </th>

                          {currentPole && (
                            <th className="sticky top-0 z-30 bg-slate-200 px-6 py-4 text-center">
                              {currentPole.name}
                            </th>
                          )}

                          {otherPoles.map((loc) => (
                            <th
                              key={loc.id}
                              className="sticky top-0 z-30 bg-slate-100 px-6 py-4 text-center"
                            >
                              {loc.name}
                            </th>
                          ))}

                          {shownReserveLocations.map((loc) => (
                            <th
                              key={loc.id}
                              className="sticky top-0 z-30 bg-slate-100 px-6 py-4 text-center text-slate-500"
                            >
                              {loc.name}
                            </th>
                          ))}

                          {editable && (
                            <th className="sticky top-0 z-30 bg-slate-100 px-4 py-4 text-center">
                              Action
                            </th>
                          )}
                        </tr>
                      </thead>

                      <tbody className="divide-y divide-slate-100">
                        {items.map((product) => (
                          <tr
                            key={product.product_id}
                            className="transition hover:bg-slate-50"
                          >
                            <td className="sticky left-0 z-20 bg-white px-6 py-4 font-medium text-slate-900">
                              {product.name}
                              {product.packaging && (
                                <div className="text-xs text-slate-400 mt-1">
                                  {product.packaging}
                                </div>
                              )}
                            </td>

                            {currentPole && (
                              <EditableStockInputCell
                                product={product}
                                location={currentPole}
                                highlight
                                isEditable={isEditableLocation(currentPole)}
                                value={
                                  drafts[`${product.product_id}_${currentPole.id}`] ?? 0
                                }
                                onChange={updateDraft}
                              />
                            )}

                            {otherPoles.map((loc) => (
                              <EditableStockInputCell
                                key={loc.id}
                                product={product}
                                location={loc}
                                isEditable={isEditableLocation(loc)}
                                value={drafts[`${product.product_id}_${loc.id}`] ?? 0}
                                onChange={updateDraft}
                              />
                            ))}

                            {shownReserveLocations.map((loc) => (
                              <EditableStockInputCell
                                key={loc.id}
                                product={product}
                                location={loc}
                                isReserve
                                isEditable={isEditableLocation(loc)}
                                value={drafts[`${product.product_id}_${loc.id}`] ?? 0}
                                onChange={updateDraft}
                              />
                            ))}

                            {editable && (
                              <td className="px-4 py-3 text-center">
                                <button
                                  type="button"
                                  onClick={() =>
                                    saveRow(
                                      product,
                                      currentPole,
                                      otherPoles,
                                      shownReserveLocations
                                    )
                                  }
                                  disabled={savingRow === product.product_id}
                                  className="text-xs bg-slate-900 text-white px-3 py-1.5 rounded"
                                >
                                  {savingRow === product.product_id ? "..." : "OK"}
                                </button>
                              </td>
                            )}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>

                <div className="md:hidden space-y-4">
                  {items.map((product) => (
                    <div
                      key={product.product_id}
                      className="
                        bg-white
                        border border-slate-200
                        rounded-2xl
                        shadow-sm
                        p-4
                        space-y-3
                        transition
                        hover:shadow-md
                        hover:-translate-y-0.5
                      "
                    >
                      <div className="font-semibold text-slate-900">
                        {product.name}
                        {product.packaging && (
                          <div className="text-xs text-slate-400">
                            {product.packaging}
                          </div>
                        )}
                      </div>

                      {currentPole && (
                        <MobileEditableStockRow
                          label={currentPole.name}
                          product={product}
                          location={currentPole}
                          highlight
                          isEditable={isEditableLocation(currentPole)}
                          value={
                            drafts[`${product.product_id}_${currentPole.id}`] ?? 0
                          }
                          onChange={updateDraft}
                        />
                      )}

                      {otherPoles.map((loc) => (
                        <MobileEditableStockRow
                          key={loc.id}
                          label={loc.name}
                          product={product}
                          location={loc}
                          isEditable={isEditableLocation(loc)}
                          value={drafts[`${product.product_id}_${loc.id}`] ?? 0}
                          onChange={updateDraft}
                        />
                      ))}

                      {shownReserveLocations.map((loc) => (
                        <MobileEditableStockRow
                          key={loc.id}
                          label={loc.name}
                          product={product}
                          location={loc}
                          isReserve
                          isEditable={isEditableLocation(loc)}
                          value={drafts[`${product.product_id}_${loc.id}`] ?? 0}
                          onChange={updateDraft}
                        />
                      ))}

                      {editable && (
                        <button
                          type="button"
                          onClick={() =>
                            saveRow(
                              product,
                              currentPole,
                              otherPoles,
                              shownReserveLocations
                            )
                          }
                          disabled={savingRow === product.product_id}
                          className="w-full text-sm bg-slate-900 text-white px-4 py-2 rounded-lg"
                        >
                          {savingRow === product.product_id ? "Enregistrement..." : "Valider la ligne"}
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        )
      })}
    </div>
  )
}

function EditableStockInputCell({
  product,
  location,
  highlight,
  isReserve,
  isEditable,
  value,
  onChange,
}) {
  const data = product.locations?.[location.id]
  const qty = data?.quantity ?? 0
  const threshold = data?.threshold ?? 5

  const isOut = qty === 0
  const isLow = qty > 0 && qty <= threshold

  if (!isEditable) {
    return (
      <td
        className={`
          px-6 py-4 text-center font-semibold
          transition-colors
          ${highlight ? "bg-slate-100" : ""}
          ${isReserve ? "text-slate-500" : ""}
          ${
            isOut
              ? "text-red-700"
              : isLow
                ? "text-orange-600"
                : "text-slate-800"
          }
        `}
      >
        {qty}
      </td>
    )
  }

  return (
    <td className={`px-4 py-3 text-center ${highlight ? "bg-slate-100" : ""}`}>
      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) =>
          onChange(product.product_id, location.id, e.target.value)
        }
        className="w-20 border rounded px-2 py-1 text-center"
      />
    </td>
  )
}

function MobileEditableStockRow({
  label,
  product,
  location,
  highlight,
  isReserve,
  isEditable,
  value,
  onChange,
}) {
  const data = product.locations?.[location.id]
  const qty = data?.quantity ?? 0
  const threshold = data?.threshold ?? 5
  const isOut = qty === 0
  const isLow = qty > 0 && qty <= threshold

  if (!isEditable) {
    return (
      <div className="flex justify-between text-sm">
        <span
          className={`
            ${highlight ? "font-semibold" : ""}
            ${isReserve ? "text-slate-500" : "text-slate-700"}
          `}
        >
          {label}
        </span>

        <span
          className={`
            font-semibold
            ${
              isOut
                ? "text-red-700"
                : isLow
                  ? "text-orange-600"
                  : "text-slate-900"
            }
          `}
        >
          {qty}
        </span>
      </div>
    )
  }

  return (
    <div className="space-y-2">
      <div className="flex justify-between text-sm">
        <span
          className={`
            ${highlight ? "font-semibold" : ""}
            ${isReserve ? "text-slate-500" : "text-slate-700"}
          `}
        >
          {label}
        </span>
      </div>

      <input
        type="number"
        min="0"
        value={value}
        onChange={(e) =>
          onChange(product.product_id, location.id, e.target.value)
        }
        className="w-full border rounded px-3 py-2 text-center"
      />
    </div>
  )
}