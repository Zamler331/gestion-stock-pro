"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function StocksPage() {
  const router = useRouter()

  const [stocks, setStocks] = useState([])
  const [role, setRole] = useState(null)

  useEffect(() => {
    initialize()
  }, [])

  async function initialize() {
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

    if (!profile) {
      router.push("/login")
      return
    }

    setRole(profile.role)
    fetchStocks()
  }

  async function fetchStocks() {
    const { data } = await supabase
      .from("stocks")
      .select(`
        quantity,
        products (
          name,
          categories (
            name,
            color
          )
        ),
        locations (
          name,
          type
        )
      `)
      .order("quantity", { ascending: true })

    setStocks(data || [])
  }

  return (
    <div className="p-10 space-y-6">

      <h1 className="text-3xl font-bold">
        Vue globale des stocks
      </h1>

      <div className="bg-white rounded shadow overflow-x-auto">
        <table className="w-full border-collapse">
          <thead className="bg-gray-100">
            <tr>
              <th className="p-3 text-left">Produit</th>
              <th className="p-3 text-left">Catégorie</th>
              <th className="p-3 text-left">Lieu</th>
              <th className="p-3 text-left">Type</th>
              <th className="p-3 text-left">Quantité</th>
            </tr>
          </thead>
          <tbody>
            {stocks.map((s, index) => (
              <tr key={index} className="border-t">
                <td className="p-3">
                  {s.products?.name}
                </td>

                <td className="p-3">
                  <span
                    className="px-2 py-1 rounded text-white text-sm"
                    style={{
                      backgroundColor:
                        s.products?.categories?.color || "#64748b"
                    }}
                  >
                    {s.products?.categories?.name}
                  </span>
                </td>

                <td className="p-3">
                  {s.locations?.name}
                </td>

                <td className="p-3">
                  {s.locations?.type}
                </td>

                <td
                  className={`p-3 font-bold ${
                    s.quantity === 0
                      ? "text-red-600"
                      : s.quantity < 5
                      ? "text-orange-500"
                      : ""
                  }`}
                >
                  {s.quantity}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

    </div>
  )
}