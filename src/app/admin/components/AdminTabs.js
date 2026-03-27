"use client"

import { useState } from "react"

import OverviewTab from "./OverviewTab"
import StockEntryTab from "./StockEntryTab"
import StockGlobalTab from "./StockGlobalTab"
import ProductsTab from "./ProductsTab"
import ThresholdsTab from "./ThresholdsTab"
import LocationsTab from "./LocationsTab"
import MovementsTab from "./MovementsTab"
import AnalyticsTab from "./analytics/AnalyticsTab"
import FreeTransferTab from "./FreeTransferTab"
import DlcTab from "@/app/pole/components/DlcTab"

export default function AdminTabs() {
  const [activeTab, setActiveTab] = useState("overview")

  return (
    <div className="space-y-8">
      {/* TABS NAVIGATION */}
      <div className="border-b border-slate-300">
        <div className="flex gap-6 flex-wrap">
          <TabButton
            label="Vue d'ensemble"
            value="overview"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Entrée Stock"
            value="entry"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Paninis"
            value="dlc"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Stock Global"
            value="stock"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Produits"
            value="products"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Seuils"
            value="thresholds"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Lieux"
            value="locations"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Mouvements"
            value="movements"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
          <TabButton
            label="Analytics / Exports"
            value="analytics"
            activeTab={activeTab}
            setActiveTab={setActiveTab}
          />
        </div>
      </div>

      {/* CONTENT */}
      <div className="pt-2">
        {activeTab === "overview" && <OverviewTab />}
        {activeTab === "entry" && <StockEntryTab />}
        {activeTab === "free" && <FreeTransferTab />}
        {activeTab === "dlc" && <DlcTab canAddBatch={true} />}
        {activeTab === "stock" && <StockGlobalTab />}
        {activeTab === "products" && <ProductsTab />}
        {activeTab === "thresholds" && <ThresholdsTab />}
        {activeTab === "locations" && <LocationsTab />}
        {activeTab === "movements" && <MovementsTab />}
        {activeTab === "analytics" && <AnalyticsTab />}
      </div>
    </div>
  )
}

function TabButton({ label, value, activeTab, setActiveTab }) {
  const isActive = activeTab === value

  return (
    <button
      onClick={() => setActiveTab(value)}
      className={`
        relative
        pb-3
        text-sm
        font-medium
        transition-colors
        duration-200
        ${
          isActive
            ? "text-slate-900"
            : "text-slate-500 hover:text-slate-800"
        }
      `}
    >
      {label}

      {isActive && (
        <span className="absolute left-0 bottom-0 h-[2px] w-full bg-slate-900 rounded-full" />
      )}
    </button>
  )
}