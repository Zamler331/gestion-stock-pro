"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"
import * as XLSX from "xlsx"
import { saveAs } from "file-saver"
import {
  Cell,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  Tooltip,
  ResponsiveContainer
} from "recharts"

export default function AdminPage() {
  const router = useRouter()

  /* =========================
     STATE
  ========================= */

  const [kpis, setKpis] = useState({
    totalProducts: 0,
    totalLocations: 0,
    criticalProducts: 0
  })

  const [productsView, setProductsView] = useState({})
  const [locationsView, setLocationsView] = useState({})
  const [alerts, setAlerts] = useState([])
  const [orders, setOrders] = useState([])
  const [movements, setMovements] = useState([])
  const [evolutionData, setEvolutionData] = useState([])
  const [threshold, setThreshold] = useState(10)

  const [categories, setCategories] = useState([])
  const [newCategory, setNewCategory] = useState("")

  /* =========================
     AUTH
  ========================= */

  useEffect(() => {
    checkAccess()
    fetchCategories()
    fetchData()
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
    }
  }

  /* =========================
     FETCH CATEGORIES
  ========================= */

  async function fetchCategories() {
    const { data } = await supabase
      .from("categories")
      .select("*")
      .order("name")

    setCategories(data || [])
  }

  /* =========================
     FETCH DATA DASHBOARD
  ========================= */

  async function fetchData() {
    const { data: stockData } = await supabase
      .from("stocks")
      .select("*, products(*), locations(*)")

    const stocks = stockData || []

    // === Group by product ===
    const groupedByProduct = {}
    stocks.forEach(s => {
      const name = s.products.name
      if (!groupedByProduct[name]) {
        groupedByProduct[name] = { total: 0, details: [] }
      }
      groupedByProduct[name].total += s.quantity
      groupedByProduct[name].details.push({
        location: s.locations.name,
        quantity: s.quantity
      })
    })

    // === Group by location ===
    const groupedByLocation = {}
    stocks.forEach(s => {
      const name = s.locations.name
      if (!groupedByLocation[name]) {
        groupedByLocation[name] = { total: 0, details: [] }
      }
      groupedByLocation[name].total += s.quantity
      groupedByLocation[name].details.push({
        product: s.products.name,
        quantity: s.quantity
      })
    })

    const criticalProducts = Object.entries(groupedByProduct)
      .filter(([_, data]) =>
        data.details.some(d => d.quantity < threshold)
      )

    setProductsView(groupedByProduct)
    setLocationsView(groupedByLocation)
    setAlerts(criticalProducts)

    setKpis({
      totalProducts: Object.keys(groupedByProduct).length,
      totalLocations: Object.keys(groupedByLocation).length,
      criticalProducts: criticalProducts.length
    })
  }

  /* =========================
     CATEGORY MANAGEMENT
  ========================= */

  async function handleAddCategory() {
    if (!newCategory) return

    await supabase.from("categories").insert([
      { name: newCategory }
    ])

    setNewCategory("")
    fetchCategories()
  }

  async function handleDeleteCategory(id, name) {
  const confirmed = window.confirm(
    `Voulez-vous vraiment supprimer la catégorie "${name}" ?`
  )

  if (!confirmed) return

  const { error } = await supabase
    .from("categories")
    .delete()
    .eq("id", id)

  if (error) {
    alert("Impossible de supprimer : catégorie utilisée par des produits.")
    return
  }

  fetchCategories()
}
  /* =========================
     DERIVED DATA
  ========================= */

  const chartData = Object.entries(productsView).map(([product, data]) => ({
    name: product,
    total: data.total
  }))

  /* =========================
     EXPORT
  ========================= */

  function exportExcel() {
    const data = []

    Object.entries(productsView).forEach(([product, info]) => {
      data.push({ Produit: product, Total: info.total })
      info.details.forEach(d => {
        data.push({ Produit: `- ${d.location}`, Total: d.quantity })
      })
    })

    const worksheet = XLSX.utils.json_to_sheet(data)
    const workbook = XLSX.utils.book_new()
    XLSX.utils.book_append_sheet(workbook, worksheet, "Stocks")

    const excelBuffer = XLSX.write(workbook, {
      bookType: "xlsx",
      type: "array"
    })

    const blob = new Blob([excelBuffer], {
      type: "application/octet-stream"
    })

    saveAs(blob, "stocks_dashboard.xlsx")
  }

  /* =========================
     UI
  ========================= */

  return (
    <div className="p-10 space-y-10">

      <h1 className="text-3xl font-bold">Dashboard Admin</h1>

      <button
        onClick={exportExcel}
        className="bg-green-600 text-white px-4 py-2 rounded shadow"
      >
        Export Excel
      </button>

      <button
  onClick={() => router.push("/stocks")}
  className="bg-slate-700 text-white px-4 py-2 rounded"
>
  Vue globale des stocks
</button>

      {/* KPI */}
      <div className="grid grid-cols-3 gap-6">
        <div className="bg-white p-6 rounded shadow text-center">
          <div className="text-2xl font-bold">{kpis.totalProducts}</div>
          <div>Produits</div>
        </div>
        <div className="bg-white p-6 rounded shadow text-center">
          <div className="text-2xl font-bold">{kpis.totalLocations}</div>
          <div>Lieux</div>
        </div>
        <div className="bg-white p-6 rounded shadow text-center">
          <div className="text-2xl font-bold text-red-600">
            {kpis.criticalProducts}
          </div>
          <div>Produits critiques</div>
        </div>
      </div>

      <div className="flex gap-4">
  <button
    onClick={() => router.push("/admin/products")}
    className="bg-indigo-600 text-white px-4 py-2 rounded shadow"
  >
    Gestion des produits
  </button>

  <button
    onClick={() => router.push("/admin")}
    className="bg-gray-600 text-white px-4 py-2 rounded shadow"
  >
    Dashboard
  </button>
</div>

      {/* Gestion catégories */}
      <div className="bg-white p-6 rounded shadow">
        <h2 className="text-xl font-semibold mb-4">
          Gestion des catégories
        </h2>

        <div className="flex gap-2 mb-4">
          <input
            value={newCategory}
            onChange={(e) => setNewCategory(e.target.value)}
            className="border p-2 rounded flex-1"
            placeholder="Nouvelle catégorie"
          />
          <button
            onClick={handleAddCategory}
            className="bg-blue-600 text-white px-4 py-2 rounded"
          >
            Ajouter
          </button>
        </div>

        {categories.map(cat => (
          <div
            key={cat.id}
            className="flex justify-between items-center border p-2 rounded mb-2"
          >
            <span>{cat.name}</span>
            <button
              onClick={() => handleDeleteCategory(cat.id, cat.name)}
              className="text-red-600"
            >
              Supprimer
            </button>
          </div>
        ))}
      </div>

    </div>
  )
}