"use client"

import { useState } from "react"

import OrdersTab from "./OrdersTab"
import DlcTab from "./DlcTab"
import MessagingTab from "./MessagingTab"

export default function PoleTabs({ locationId }) {
  const [activeTab, setActiveTab] = useState("orders")

  const tabs = [
    { id: "orders", label: "Commandes" },
    { id: "dlc", label: "Paninis" },
    { id: "messages", label: "Messagerie" },
  ]

  return (
    <div className="space-y-8">
      <div className="flex gap-2 border-b border-slate-300 pb-2">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            onClick={() => setActiveTab(tab.id)}
            className={`
              px-4 py-2 text-sm font-medium rounded-xl transition-all
              ${
                activeTab === tab.id
                  ? "bg-slate-900 text-white shadow-sm"
                  : "text-slate-600 hover:bg-white hover:shadow-sm"
              }
            `}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div>
        {activeTab === "orders" && <OrdersTab />}
        {activeTab === "dlc" && <DlcTab locationId={locationId} canAddBatch={false} allowLocationSelect={false} />}
        {activeTab === "messages" && <MessagingTab locationId={locationId} />}
      </div>
    </div>
  )
}