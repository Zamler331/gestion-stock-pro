"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export function useAnalyticsData() {

  const [movements, setMovements] = useState([])
  const [loading, setLoading] = useState(true)
  const [poles, setPoles] = useState([])
  const [products, setProducts] = useState([])

  useEffect(() => {
    fetchMovements()
  }, [])

  async function fetchMovements() {

    setLoading(true)

    const { data } = await supabase
      .from("movements")
      .select(`
        *,
        products ( name ),
        source:locations!movements_source_location_id_fkey ( name ),
        destination:locations!movements_destination_location_id_fkey ( name )
      `)
      .order("created_at", { ascending: false })

    setMovements(data || [])
    setLoading(false)
    
    const { data: polesData } = await supabase
  .from("locations")
  .select("*")
  .eq("type", "pole")

setPoles(polesData || [])

const { data: productsData } = await supabase
  .from("products")
  .select("id, name")

setProducts(productsData || [])
  }

  return { movements, poles, products, loading }
}