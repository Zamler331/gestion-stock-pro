"use client"

import { useState, useMemo } from "react"
import { useAnalyticsData } from "./useAnalyticsData"
import ExcelExportBlock from "./ExcelExportBlock"
import {
  filterByDate,
  computeStats,
  computeTopProducts,
  computePoleConsumption,
  computeActivityByDay
} from "./analyticsUtils"

export default function AnalyticsTab() {

  const { movements, poles, products, loading } = useAnalyticsData()

  const [startDate, setStartDate] = useState("")
  const [endDate, setEndDate] = useState("")

  const filtered = useMemo(
    () => filterByDate(movements, startDate, endDate),
    [movements, startDate, endDate]
  )

  const stats = useMemo(
    () => computeStats(filtered),
    [filtered]
  )

  const topProducts = useMemo(
    () => computeTopProducts(filtered),
    [filtered]
  )

  const topPoles = useMemo(
    () => computePoleConsumption(filtered),
    [filtered]
  )

  const activityByDay = useMemo(
    () => computeActivityByDay(filtered),
    [filtered]
  )

  function AnalyticsBlock({ title, data }) {

  return (
    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 space-y-4">

      <h3 className="text-lg font-semibold text-slate-900">
        {title}
      </h3>

      {data.length === 0 && (
        <div className="text-sm text-slate-500">
          Aucune donnée
        </div>
      )}

      <div className="space-y-3">

        {data.map(([label, value]) => (

          <div
            key={label}
            className="flex justify-between text-sm border-b border-slate-100 pb-2"
          >
            <span className="text-slate-700">
              {label}
            </span>

            <span className="font-semibold text-slate-900">
              {value}
            </span>
          </div>

        ))}

      </div>

    </div>
  )
}

  if (loading) return <div>Chargement...</div>

  return (
  <div className="space-y-12">

    {/* ================= FILTRE PERIODE ================= */}

    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6 flex flex-wrap gap-6 items-end">

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">
          Date début
        </label>
        <input
          type="date"
          value={startDate}
          onChange={(e) => setStartDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="flex flex-col gap-1">
        <label className="text-xs text-slate-500">
          Date fin
        </label>
        <input
          type="date"
          value={endDate}
          onChange={(e) => setEndDate(e.target.value)}
          className="border border-slate-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-slate-400"
        />
      </div>

      <div className="text-sm text-slate-500 ml-auto">
        {stats.total} mouvement(s)
      </div>

    </div>


    {/* ================= KPI ================= */}

    <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-6">

      {Object.entries(stats).map(([key, value]) => (

        <div
          key={key}
          className="bg-white border border-slate-200 rounded-2xl shadow-sm p-6"
        >
          <div className="text-sm text-slate-500 mb-2">
            {key}
          </div>
          <div className="text-3xl font-semibold text-slate-900">
            {value}
          </div>
        </div>

      ))}

    </div>


    {/* ================= BLOCS ANALYTIQUES ================= */}

    <AnalyticsBlock title="Top produits sortis" data={topProducts} />
    <AnalyticsBlock title="Consommation par pôle" data={topPoles} />
    <AnalyticsBlock title="Activité par jour" data={activityByDay} />


    {/* ================= EXPORTS ================= */}

    <ExcelExportBlock
      movements={filtered}
      poles={poles}
      products={products}
    />

  </div>
)
}