"use client"

import { useEffect } from "react"
import { supabase } from "@/lib/supabase"

export default function Home() {

  useEffect(() => {
    async function testConnection() {
      const { data, error } = await supabase.from("products").select("*")
      
      if (error) {
        console.log("Erreur connexion :", error)
      } else {
        console.log("Connexion réussie ✅", data)
      }
    }

    testConnection()
  }, [])

  return (
    <div className="p-10">
      <h1 className="text-2xl font-bold">
        Test connexion Supabase
      </h1>
      <p>Ouvre la console (F12)</p>
    </div>
  )
}