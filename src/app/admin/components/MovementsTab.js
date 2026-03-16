"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function MovementsTab() {

  const [movements, setMovements] = useState([])
  const [search, setSearch] = useState("")
  const [typeFilter, setTypeFilter] = useState("all")
  const [loading, setLoading] = useState(true)
  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")
  const [locationFilter, setLocationFilter] = useState("all")

  useEffect(() => {
    fetchMovements()
  }, [])

  async function fetchMovements() {

  setLoading(true)

  const { data, error } = await supabase
    .from("movements")
    .select(`
      *,
      products ( id, name ),
      source:locations!movements_source_location_id_fkey ( id, name ),
      destination:locations!movements_destination_location_id_fkey ( id, name )
    `)
    .order("created_at", { ascending: false })

  if (error) {
    console.error("Erreur fetch movements:", error)
    setLoading(false)
    return
  }

  setMovements(data || [])
  setLoading(false)
}

const allLocations = Array.from(
  new Map(
    movements.flatMap(m => [
      m.source ? [m.source.id, m.source] : null,
      m.destination ? [m.destination.id, m.destination] : null
    ].filter(Boolean))
  ).values()
)
  function formatDate(date) {
    return new Date(date).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  function getTypeBadge(type) {

    const base = "px-2 py-1 text-xs rounded-full font-medium"

    switch (type) {
      case "livraison":
        return `${base} bg-green-100 text-green-700`
      case "transfert":
        return `${base} bg-purple-100 text-purple-700`
      case "entry":
        return `${base} bg-blue-100 text-blue-700`
      case "correction":
        return `${base} bg-orange-100 text-orange-700`
      case "annulation":
        return `${base} bg-red-100 text-red-700`
      case "sortie":
  return `${base} bg-gray-200 text-gray-800`
      default:
        return `${base} bg-gray-100 text-gray-600`
    }
  }

  const filtered = movements
  .filter(m =>
    m.products?.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.source?.name?.toLowerCase().includes(search.toLowerCase()) ||
    m.destination?.name?.toLowerCase().includes(search.toLowerCase())
  )
  .filter(m =>
    typeFilter === "all" || m.type === typeFilter
  )
  .filter(m => {
    if (!startDate && !endDate) return true

    const movementDate = new Date(m.created_at)

    if (startDate && movementDate < new Date(startDate)) return false
    if (endDate && movementDate > new Date(endDate + "T23:59:59")) return false

    return true
  })
  .filter(m => {
    if (locationFilter === "all") return true

    return (
      m.source?.id === locationFilter ||
      m.destination?.id === locationFilter
    )
  })

  if (loading) {
    return <div>Chargement...</div>
  }

  function exportCSV() {

  const headers = [
    "Produit",
    "Type",
    "Quantité",
    "Source",
    "Destination",
    "Date"
  ]

  const rows = filtered.map(m => [
    m.products?.name || "",
    m.type,
    m.quantity,
    m.source?.name || "",
    m.destination?.name || "",
    formatDate(m.created_at)
  ])

  const csvContent =
    [headers, ...rows]
      .map(row => row.join(";"))
      .join("\n")

  const blob = new Blob([csvContent], { type: "text/csv;charset=utf-8;" })
  const url = URL.createObjectURL(blob)

  const link = document.createElement("a")
  link.href = url
  link.download = "mouvements.csv"
  link.click()
}

  return (
    <div className="space-y-8">

      {/* FILTRES */}

      <div className="bg-white p-6 rounded-2xl shadow flex flex-wrap gap-4 items-center">

        <input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Rechercher produit ou lieu..."
          className="border px-3 py-2 rounded-lg w-64 focus:ring-2 focus:ring-blue-500"
        />

        <input
  type="date"
  value={startDate}
  onChange={(e) => setStartDate(e.target.value)}
  className="border px-3 py-2 rounded-lg"
/>

<input
  type="date"
  value={endDate}
  onChange={(e) => setEndDate(e.target.value)}
  className="border px-3 py-2 rounded-lg"
/>

<select
  value={locationFilter}
  onChange={(e) => setLocationFilter(e.target.value)}
  className="border px-3 py-2 rounded-lg"
>
  <option value="all">Tous lieux</option>
  {allLocations.map(loc => (
    <option key={loc.id} value={loc.id}>
      {loc.name}
    </option>
  ))}
</select>

        <select
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          className="border px-3 py-2 rounded-lg"
        >
          <option value="all">Tous types</option>
          <option value="livraison">Livraison</option>
          <option value="transfert">Transfert</option>
          <option value="entry">Entrée fournisseur</option>
          <option value="correction">Correction</option>
          <option value="annulation">Annulation</option>
          <option value="sortie">Sortie</option>
        </select>

        <div className="text-sm text-gray-500">
          {filtered.length} mouvement(s)
        </div>

      </div>

      <button
  onClick={exportCSV}
  className="bg-green-600 text-white px-4 py-2 rounded-lg"
>
  Export CSV
</button>

      {/* TABLEAU */}

      <div className="overflow-x-auto bg-white rounded-2xl shadow">

        <table className="min-w-full text-sm">

          <thead className="bg-slate-100 text-xs uppercase text-slate-600">
            <tr>
              <th className="px-4 py-3 text-left">Produit</th>
              <th className="px-4 py-3 text-center">Type</th>
              <th className="px-4 py-3 text-center">Quantité</th>
              <th className="px-4 py-3 text-center">Source</th>
              <th className="px-4 py-3 text-center">Destination</th>
              <th className="px-4 py-3 text-center">Date</th>
            </tr>
          </thead>

          <tbody className="divide-y">

            {filtered.map((m, index) => (

              <tr
                key={m.id}
                className={`${
                  index % 2 === 0 ? "bg-white" : "bg-slate-50"
                }`}
              >

                <td className="px-4 py-3 font-medium">
                  {m.products?.name}
                </td>

                <td className="px-4 py-3 text-center">
                  <span className={getTypeBadge(m.type)}>
                    {m.type}
                  </span>
                </td>

                <td className={`px-4 py-3 text-center font-semibold ${
  m.type === "sortie"
    ? "text-red-600"
    : "text-green-600"
}`}>

  {m.type === "sortie"
    ? `-${m.quantity}`
    : `+${m.quantity}`}

</td>

                <td className="px-4 py-3 text-center">
                  {m.source?.name || "-"}
                </td>

                <td className="px-4 py-3 text-center">
                  {m.destination?.name || "-"}
                </td>

                <td className="px-4 py-3 text-center text-gray-500">
                  {formatDate(m.created_at)}
                </td>

              </tr>

            ))}

          </tbody>

        </table>

      </div>

    </div>
  )
}