"use client"

import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useBugReport } from "@/app/providers/BugReportProvider"
import Image from "next/image"

export default function Navbar({ title, role }) {

  const router = useRouter()
  const { openBug } = useBugReport()

  async function handleLogout() {
    await supabase.auth.signOut()
    router.push("/login")
  }

  return (
    <div className="sticky top-0 z-50 bg-white border-b border-slate-200">

      <div className="max-w-7xl mx-auto px-6 h-16 flex items-center justify-between">

        <div className="flex items-center gap-3">

  <Image
    src="/logo/logo.png"
    alt="Logo"
    width={36}
    height={36}
    priority
  />

  <span className="font-semibold text-lg">
    {title}
  </span>

</div>

        {/* LEFT */}
        <div className="flex items-center gap-6">

          {role && (
            <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium">
              {role}
            </span>
          )}

        </div>

        <div className="flex items-center gap-4">

  <button
  onClick={() => openBug(role)}
  className="text-xs text-red-600 hover:text-red-700"
>
  🐞 Signaler un bug
</button>

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