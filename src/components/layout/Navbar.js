"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { supabase } from "@/lib/supabase"
import { useBugReport } from "@/app/providers/BugReportProvider"
import Image from "next/image"

export default function Navbar({ title, role }) {
  const router = useRouter()
  const { openBug } = useBugReport()

  const [unreadMessages, setUnreadMessages] = useState(0)

  const normalizedRole =
    role?.toLowerCase() === "livreur"
      ? "livreur"
      : role?.toLowerCase() === "pôle"
      ? "pole"
      : null

  useEffect(() => {
    if (!normalizedRole) return

    fetchUnreadMessages()

    const handleUpdate = () => {
      fetchUnreadMessages()
    }

    window.addEventListener("messages-updated", handleUpdate)

    const channel = supabase
      .channel(`navbar-messages-${normalizedRole}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "messages",
          filter: `receiver_role=eq.${normalizedRole}`,
        },
        () => {
          fetchUnreadMessages()
        }
      )
      .subscribe()

    return () => {
      window.removeEventListener("messages-updated", handleUpdate)
      supabase.removeChannel(channel)
    }
  }, [normalizedRole])

  async function fetchUnreadMessages() {
    if (!normalizedRole) return

    const { count, error } = await supabase
      .from("messages")
      .select("*", { count: "exact", head: true })
      .eq("receiver_role", normalizedRole)
      .eq("read", false)

    if (error) {
      console.error("Erreur notifications messages :", error)
      return
    }

    setUnreadMessages(count || 0)
  }

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

          {unreadMessages > 0 && (
            <span className="ml-2 text-xs bg-red-600 text-white px-2 py-0.5 rounded-full">
              {unreadMessages}
            </span>
          )}

        </div>

        <div className="flex items-center gap-6">

          {role && (
            <span className="text-xs bg-slate-100 text-slate-700 px-3 py-1 rounded-full font-medium">
              {role}
            </span>
          )}

          <button
            onClick={() => openBug(role)}
            className="text-xs text-red-600 hover:text-red-700"
          >
            🐞 Signaler un bug
          </button>

          <button
            onClick={handleLogout}
            className="text-sm text-slate-600 hover:text-slate-900 font-medium transition-colors"
          >
            Déconnexion
          </button>

        </div>

      </div>

    </div>
  )
}