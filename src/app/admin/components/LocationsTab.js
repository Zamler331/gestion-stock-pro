"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function LocationsTab() {

  const [locations, setLocations] = useState([])
  const [newName, setNewName] = useState("")
  const [newType, setNewType] = useState("pole")
  const [loading, setLoading] = useState(true)
  const [message, setMessage] = useState("")

  useEffect(() => {
    fetchLocations()
  }, [])

  async function fetchLocations() {
    setLoading(true)

    const { data } = await supabase
      .from("locations")
      .select("*")
      .order("type", { ascending: false })

    setLocations(data || [])
    setLoading(false)
  }

  async function createLocation() {
    if (!newName.trim()) return

    await supabase.from("locations").insert([{
      name: newName,
      type: newType
    }])

    setNewName("")
    setNewType("pole")
    fetchLocations()
  }

  async function updateName(id, name) {
    await supabase
      .from("locations")
      .update({ name })
      .eq("id", id)
  }

  async function deleteLocation(id) {

    const confirmDelete = window.confirm(
      "Supprimer ce lieu ? (Attention : cela impactera les stocks)"
    )

    if (!confirmDelete) return

    await supabase
      .from("locations")
      .delete()
      .eq("id", id)

    fetchLocations()
  }

  if (loading) {
    return <div>Chargement...</div>
  }

  return (
  <div className="space-y-12">

    {/* ================= CREATION ================= */}

    <div className="bg-white border border-slate-200 p-6 rounded-2xl shadow-sm space-y-5">

      <h2 className="text-lg font-semibold text-slate-900">
        Créer un nouveau lieu
      </h2>

      <div className="flex gap-4 flex-wrap">

        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="Nom du lieu"
          className="
            border border-slate-300
            rounded-lg
            px-3 py-2
            text-sm
            focus:outline-none
            focus:ring-2
            focus:ring-slate-400
          "
        />

        <select
          value={newType}
          onChange={(e) => setNewType(e.target.value)}
          className="
            border border-slate-300
            rounded-lg
            px-3 py-2
            text-sm
            focus:outline-none
            focus:ring-2
            focus:ring-slate-400
          "
        >
          <option value="pole">Pôle</option>
          <option value="reserve">Réserve</option>
        </select>

        <button
          onClick={createLocation}
          className="
            bg-slate-900
            hover:bg-slate-800
            text-white
            px-4 py-2
            rounded-lg
            text-sm
            font-medium
            transition-colors
          "
        >
          Ajouter
        </button>

      </div>

    </div>


    {/* ================= LISTE ================= */}

    <div className="bg-white border border-slate-200 rounded-2xl shadow-sm overflow-hidden">

      <table className="min-w-full text-sm">

        <thead className="bg-slate-100 text-xs uppercase text-slate-600 tracking-wide">
          <tr>
            <th className="px-4 py-3 text-left">Nom</th>
            <th className="px-4 py-3 text-center">Type</th>
            <th className="px-4 py-3 text-center">Actions</th>
          </tr>
        </thead>

        <tbody className="divide-y divide-slate-100">

          {locations.map((loc) => (

            <tr
              key={loc.id}
              className="hover:bg-slate-50 transition-colors"
            >

              <td className="px-4 py-3">
                <input
                  defaultValue={loc.name}
                  onBlur={(e) =>
                    updateName(loc.id, e.target.value)
                  }
                  className="
                    border border-slate-300
                    rounded-lg
                    px-2 py-1.5
                    text-sm
                    w-full
                    focus:outline-none
                    focus:ring-2
                    focus:ring-slate-400
                  "
                />
              </td>

              <td className="px-4 py-3 text-center">

                <span className={`px-3 py-1 text-xs font-medium rounded-full ${
                  loc.type === "pole"
                    ? "bg-slate-100 text-slate-800"
                    : "bg-slate-200 text-slate-700"
                }`}>
                  {loc.type === "pole" ? "Pôle" : "Réserve"}
                </span>

              </td>

              <td className="px-4 py-3 text-center">
                <button
                  onClick={() => deleteLocation(loc.id)}
                  className="
                    bg-red-700
                    hover:bg-red-800
                    text-white
                    px-3 py-1.5
                    rounded-lg
                    text-xs
                    font-medium
                    transition-colors
                  "
                >
                  Supprimer
                </button>
              </td>

            </tr>

          ))}

        </tbody>

      </table>

    </div>

    {message && (
      <p className="text-sm text-slate-500">
        {message}
      </p>
    )}

  </div>
)
}