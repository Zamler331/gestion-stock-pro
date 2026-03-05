"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function OverviewTab() {

  const [pendingOrders, setPendingOrders] = useState(0)
  const [latestOutputs, setLatestOutputs] = useState([])
  const [stockAlerts, setStockAlerts] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    fetchOverviewData()
  }, [])

  async function fetchOverviewData() {

    setLoading(true)

    try {
      
      /* ========================= */
      /* 2️⃣ Dernières sorties     */
      /* ========================= */

      const { data: outputs, error: outputsError } = await supabase
        .from("movements")
        .select(`
          id,
          quantity,
          created_at,
          products ( name ),
          source:locations!movements_source_location_id_fkey ( name )
        `)
        .eq("type", "sortie")
        .order("created_at", { ascending: false })
        .limit(15)

      if (outputsError) {
        console.error("Erreur sorties:", outputsError)
      }

      setLatestOutputs(outputs || [])

      /* ========================= */
      /* 3️⃣ Top alertes stock     */
      /* ========================= */

      const { data: stocks, error: stockError } = await supabase
        .from("stocks")
.select(`
  quantity,
  products:product_id (
    name
  )
`)

      if (stockError) {
        console.error("Erreur stocks:", stockError)
      }

      const alerts = (stocks || [])
        .map(s => {

          const threshold = 5 // valeur par défaut (ajustable plus tard)

          return {
            name: s.products?.name || "Produit",
            quantity: s.quantity,
            threshold,
            ratio: threshold > 0 ? s.quantity / threshold : 1
          }
        })
        .sort((a, b) => {
          if (a.quantity === 0) return -1
          if (b.quantity === 0) return 1
          return a.ratio - b.ratio
        })
        .slice(0, 5)

      setStockAlerts(alerts)

    } catch (err) {
      console.error("Erreur overview:", err)
    }

    setLoading(false)
  }

  function formatDate(date) {
    return new Date(date).toLocaleString("fr-FR", {
      day: "2-digit",
      month: "2-digit",
      hour: "2-digit",
      minute: "2-digit"
    })
  }

  if (loading) {
    return <div className="p-6">Chargement...</div>
  }

  return (
  <div className="space-y-10">

    {/* ================= KPI GRID ================= */}

    <div className="grid grid-cols-1 md:grid-cols-3 gap-6">

      {/* Commandes en attente */}

      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">

        <div className="text-sm text-slate-500 mb-2">
          Commandes en attente
        </div>

        <div className="text-4xl font-semibold text-slate-900">
          {pendingOrders}
        </div>

      </div>


      {/* Dernières sorties */}

      <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm md:col-span-2">

        <div className="flex items-center justify-between mb-5">
          <h3 className="text-lg font-semibold text-slate-900">
            Dernières sorties par pôle
          </h3>
        </div>

        {latestOutputs.length === 0 && (
          <div className="text-sm text-slate-500">
            Aucune sortie récente
          </div>
        )}

        <div className="space-y-3">

          {latestOutputs.map(output => (
            <div
              key={output.id}
              className="flex items-center justify-between text-sm border-b border-slate-100 pb-3"
            >
              <div className="flex flex-col">
                <span className="font-medium text-slate-800">
                  {output.source?.name || "-"}
                </span>
                <span className="text-slate-500 text-xs">
                  {output.products?.name || "-"}
                </span>
              </div>

              <span className="text-red-600 font-semibold">
                -{output.quantity}
              </span>

              <span className="text-xs text-slate-400">
                {formatDate(output.created_at)}
              </span>
            </div>
          ))}

        </div>

      </div>

    </div>


    {/* ================= ALERTES STOCK ================= */}

    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm">

      <h3 className="text-lg font-semibold text-slate-900 mb-5">
        Top alertes stock
      </h3>

      {stockAlerts.length === 0 && (
        <div className="text-sm text-slate-500">
          Aucun produit critique
        </div>
      )}

      <div className="space-y-3">

        {stockAlerts.map((item, index) => (

          <div
            key={index}
            className="flex items-center justify-between border-b border-slate-100 pb-3 text-sm"
          >
            <span className="text-slate-800">
              {item.name}
            </span>

            <span className={`font-semibold ${
              item.quantity === 0
                ? "text-red-700"
                : item.quantity <= item.threshold
                ? "text-orange-600"
                : "text-slate-700"
            }`}>
              {item.quantity} / {item.threshold}
            </span>
          </div>

        ))}

      </div>

    </div>

  </div>
)
}