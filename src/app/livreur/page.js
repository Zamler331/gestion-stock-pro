"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

import TabsNavigation from "./components/TabsNavigation"
import OrdersTransfersTab from "./components/OrdersTransfersTab"
import EntriesTab from "./components/EntriesTab"
import StockTab from "./components/StockTab"
import MessagingTab from "./components/MessagingTab"
import FreeTransferTab from "@/app/admin/components/FreeTransferTab"

import GlobalStockTable from "@/components/stock/GlobalStockTable"
import Navbar from "@/components/layout/Navbar"
import BugReportModal from "@/components/BugReportModal"

export default function LivreurPage() {

  const [activeTab, setActiveTab] = useState("orders")
  const [bugModal, setBugModal] = useState(false)

  const [locationId, setLocationId] = useState(null)
  const [loading, setLoading] = useState(true)

  useEffect(() => {

    async function fetchProfile() {

      const { data: { user } } = await supabase.auth.getUser()

      if (!user) {
        setLoading(false)
        return
      }

      const { data: profile } = await supabase
        .from("profiles")
        .select("location_id")
        .eq("id", user.id)
        .single()

      if (profile) {
        setLocationId(profile.location_id)
      }

      setLoading(false)
    }

    fetchProfile()

  }, [])

  console.log("LIVREUR locationId:", locationId)

  if (loading) {
    return (
      <div className="p-10 text-slate-600">
        Chargement...
      </div>
    )
  }

  return (

    <div className="min-h-screen bg-slate-200">

      <Navbar
        title="Espace Livreur"
        role="Livreur"
      />

      <BugReportModal
        open={bugModal}
        onClose={() => setBugModal(false)}
        role="livreur"
      />

      <div className="max-w-7xl mx-auto px-8 py-10 space-y-10">

        {/* NAVIGATION */}
        <TabsNavigation
          activeTab={activeTab}
          setActiveTab={setActiveTab}
        />

        {/* CONTENU */}
        <div className="space-y-8">

          {activeTab === "orders" && (
            <OrdersTransfersTab locationId={locationId} />
          )}

          {activeTab === "delivery" && (
            <FreeTransferTab role="livreur" />
          )}

          {activeTab === "entries" && (
            <EntriesTab />
          )}

          {activeTab === "stock" && (
            <>
              <StockTab />
              <GlobalStockTable />
            </>
          )}

          {activeTab === "messages" && (
            <MessagingTab />
          )}

        </div>

      </div>

    </div>

  )
}