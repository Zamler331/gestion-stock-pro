"use client"

import ExcelJS from "exceljs"
import { saveAs } from "file-saver"

export default function ExcelExportBlock({
  movements,
  poles,
  products
}) {

  async function generateWorkbook(data, filename) {

    const workbook = new ExcelJS.Workbook()
    const sheet = workbook.addWorksheet("Export")

    sheet.columns = [
      { header: "Produit", key: "product", width: 25 },
      { header: "Type", key: "type", width: 15 },
      { header: "Quantité", key: "quantity", width: 12 },
      { header: "Source", key: "source", width: 20 },
      { header: "Destination", key: "destination", width: 20 },
      { header: "Date", key: "date", width: 20 }
    ]

    data.forEach(m => {
      sheet.addRow({
        product: m.products?.name || "",
        type: m.type,
        quantity: m.quantity,
        source: m.source?.name || "",
        destination: m.destination?.name || "",
        date: new Date(m.created_at).toLocaleString("fr-FR")
      })
    })

    // Style header
    sheet.getRow(1).font = { bold: true }

    const buffer = await workbook.xlsx.writeBuffer()
    const blob = new Blob([buffer], {
      type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
    })

    saveAs(blob, `${filename}.xlsx`)
  }

  async function exportGlobal() {
    await generateWorkbook(movements, "export_global")
  }

  async function exportByPole(poleId) {

    const filtered = movements.filter(
      m =>
        m.destination?.id === poleId ||
        m.source?.id === poleId
    )

    const poleName =
      poles.find(p => p.id === poleId)?.name || "pole"

    await generateWorkbook(filtered, `export_${poleName}`)
  }

  async function exportByProduct(productId) {

    const filtered = movements.filter(
      m => m.product_id === productId
    )

    const productName =
      products.find(p => p.id === productId)?.name || "produit"

    await generateWorkbook(filtered, `export_${productName}`)
  }

  return (
  <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-8">

    <h3 className="text-lg font-semibold text-slate-900">
      Exports Excel
    </h3>

    {/* ================= GLOBAL ================= */}

    <div>
      <button
        onClick={exportGlobal}
        className="
          bg-slate-900
          hover:bg-slate-800
          text-white
          px-4 py-2
          rounded-lg
          text-sm
          font-medium
          transition-colors
        "
      >
        Export global (.xlsx)
      </button>
    </div>

    {/* ================= PAR POLE ================= */}

    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700">
        Export par pôle
      </h4>

      <div className="flex flex-wrap gap-3">
        {poles.map(pole => (
          <button
            key={pole.id}
            onClick={() => exportByPole(pole.id)}
            className="
              bg-slate-700
              hover:bg-slate-600
              text-white
              px-3 py-1.5
              rounded-lg
              text-xs
              font-medium
              transition-colors
            "
          >
            {pole.name}
          </button>
        ))}
      </div>
    </div>

    {/* ================= PAR PRODUIT ================= */}

    <div className="space-y-3">
      <h4 className="text-sm font-semibold text-slate-700">
        Export par produit
      </h4>

      <div className="flex flex-wrap gap-3 max-h-48 overflow-y-auto pr-2">
        {products.map(product => (
          <button
            key={product.id}
            onClick={() => exportByProduct(product.id)}
            className="
              bg-slate-600
              hover:bg-slate-500
              text-white
              px-3 py-1.5
              rounded-lg
              text-xs
              font-medium
              transition-colors
            "
          >
            {product.name}
          </button>
        ))}
      </div>
    </div>

  </div>
)
}