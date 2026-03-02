"use client"

import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"

export default function Navbar({ title, role }) {

  const router = useRouter()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="sticky top-0 z-50 bg-white border-b border-slate-200">

      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        {/* LEFT */}
        <div className="flex items-center gap-6">

          <h1 className="text-lg font-semibold text-slate-900">
            {title}
          </h1>

          {role && (
            <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium">
              {role}
            </span>
          )}

        </div>

        {/* RIGHT */}
        <button
          onClick={handleLogout}
          className="
            text-sm
            text-slate-600
            hover:text-slate-900
            font-medium
            transition-colors
          "
        >
          Déconnexion
        </button>

      </div>

    </div>
  )
}