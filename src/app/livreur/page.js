"use client"

import { useState } from "react"
import TabsNavigation from "./components/TabsNavigation"
import OrdersTransfersTab from "./components/OrdersTransfersTab"
import EntriesTab from "./components/EntriesTab"
import StockTab from "./components/StockTab"
import MessagingTab from "./components/MessagingTab"
import GlobalStockTable from "@/components/stock/GlobalStockTable"
import Navbar from "@/components/layout/Navbar"
import BugReportModal from "@/components/BugReportModal"

export default function LivreurPage() {
  
  const [activeTab, setActiveTab] = useState("orders")

  const [bugModal, setBugModal] = useState(false)

  return (
    
  <div className="min-h-screen bg-slate-200">
<Navbar title="Espace Livreur" role="Livreur" />
    <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">

      {/* NAVIGATION */}
      <TabsNavigation
        activeTab={activeTab}
        setActiveTab={setActiveTab}
      />

      {/* CONTENU */}
      <div className="space-y-8">

        {activeTab === "orders" && <OrdersTransfersTab />}

        {activeTab === "entries" && <EntriesTab />}

        {activeTab === "stock" && (
          <>
            <StockTab />
            <GlobalStockTable />
          </>
        )}

        {activeTab === "messages" && <MessagingTab />}

      </div>

    </div>

  </div>
)
}