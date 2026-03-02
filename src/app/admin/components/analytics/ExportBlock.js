"use client"

export default function ExportBlock({ movements }) {

  function exportMovementsCSV() {

    const headers = [
      "Produit",
      "Type",
      "Quantité",
      "Source",
      "Destination",
      "Date"
    ]

    const rows = movements.map(m => [
      m.products?.name || "",
      m.type,
      m.quantity,
      m.source?.name || "",
      m.destination?.name || "",
      new Date(m.created_at).toLocaleString("fr-FR")
    ])

    const csv =
      [headers, ...rows]
        .map(row => row.join(";"))
        .join("\n")

    const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" })
    const url = URL.createObjectURL(blob)

    const link = document.createElement("a")
    link.href = url
    link.download = "analytics_mouvements.csv"
    link.click()
  }

  return (
    <div className="bg-white p-6 rounded-2xl shadow flex gap-4 flex-wrap">
      <button
        onClick={exportMovementsCSV}
        className="bg-green-600 text-white px-4 py-2 rounded-lg"
      >
        Export Mouvements (CSV)
      </button>
    </div>
  )
}