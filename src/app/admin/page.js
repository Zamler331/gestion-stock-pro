"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

import AdminTabs from "./components/AdminTabs"
import Navbar from "@/components/layout/Navbar"

export default function AdminPage() {

  const router = useRouter()
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    checkAccess()
  }, [])

  async function checkAccess() {
    const { data: { user } } = await supabase.auth.getUser()

    if (!user) {
      router.push("/login")
      return
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "admin") {
      router.push("/login")
      return
    }

    setLoading(false)
  }

  if (loading) {
    return <div className="p-10">Chargement...</div>
  }

  return (
  <div className="min-h-screen bg-slate-200 py-10 px-6">

    <Navbar title="Administration" role="Admin" />

    <div className="max-w-7xl mx-auto space-y-10">

      {/* HEADER */}
      <div className="space-y-2">
        <h1 className="text-2xl font-semibold text-slate-900">
          
        </h1>
        <p className="text-sm text-slate-500">
          Gestion globale des stocks, produits et analytics
        </p>
      </div>

      {/* TABS */}
      <AdminTabs />

    </div>

  </div>
)
}