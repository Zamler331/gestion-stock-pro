"use client"

import { useState } from "react"

import OrdersTab from "./OrdersTab"
import CommonStocksTab from "./CommonStocksTab"
import MovementsTab from "./MovementsTab"
import MessagingTab from "./MessagingTab"
import StockTab from "./StockTab"

export default function PoleTabs({ locationId }) {

  const [activeTab, setActiveTab] = useState("orders")

  const tabs = [
    { id: "orders", label: "Commandes" },
    { id: "stock", label: "Stock" },
    { id: "messages", label: "Messagerie" }
  ]

return (
    <div className="space-y-8">

      {/* TABS */}
      <div className="flex gap-2 border-b border-slate-300 pb-2">

        {tabs.map(tab => (

          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium rounded-xl transition-all
              ${activeTab === tab.id
                ? "bg-slate-900 text-white shadow-sm"
                : "text-slate-600 hover:bg-white hover:shadow-sm"
              }
            `}
          >
            {tab.label}
          </button>

        ))}

      </div>

      {/* CONTENT */}
      <div>

        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "stock" && <StockTab />}
        {activeTab === "messages" && <MessagingTab />}

      </div>

    </div>
  )
}

function TabButton({ label, value, activeTab, setActiveTab }) {
  return (
    <button
      onClick={() => setActiveTab(value)}
      className={`px-4 py-2 rounded-t font-medium ${
        activeTab === value
          ? "bg-blue-600 text-white"
          : "bg-gray-200 hover:bg-gray-300"
      }`}
    >
      {label}
    </button>
  )
}