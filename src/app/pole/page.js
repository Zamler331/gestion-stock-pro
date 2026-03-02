"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import Navbar from "@/components/layout/Navbar"
import PoleTabs from "./components/PoleTabs"


export default function PolePage() {

  const router = useRouter()
  const [loading, setLoading] = useState(true)
  const [locationId, setLocationId] = useState(null)

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
      .select("role, location_id")
      .eq("id", user.id)
      .single()

    if (!profile || profile.role !== "pole") {
      router.push("/login")
      return
    }

    setLocationId(profile.location_id)
    setLoading(false)
  }

  if (loading) {
    return <div className="p-10">Chargement...</div>
  }

   return (
    <div className="min-h-screen bg-slate-200">

      <Navbar title="Espace Pôle" role="Pôle" />

      <div className="max-w-6xl mx-auto px-6 py-10">
        <PoleTabs />
      </div>

    </div>
  )
}