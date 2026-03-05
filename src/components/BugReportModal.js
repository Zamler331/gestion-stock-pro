"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"

export default function BugReportModal({ open, onClose, role }) {

  const [text, setText] = useState("")

  if (!open) return null

  async function sendBug() {

    if (!text.trim()) return

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from("bug_reports").insert([{
      user_id: user.id,
      role: role,
      page: window.location.pathname,
      description: text
    }])

    setText("")
    onClose()

  }

  return (

    <div className="fixed inset-0 bg-black/40 flex items-center justify-center">

      <div className="bg-white rounded-xl p-6 w-[400px] space-y-4">

        <h2 className="font-semibold text-lg">
          Signaler un bug
        </h2>

        <textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder="Décrivez le problème..."
          className="w-full border rounded-lg p-3 text-sm"
        />

        <div className="flex justify-end gap-2">

          <button
            onClick={onClose}
            className="px-4 py-2 text-sm"
          >
            Annuler
          </button>

          <button
            onClick={sendBug}
            className="bg-red-600 text-white px-4 py-2 rounded-lg text-sm"
          >
            Envoyer
          </button>

        </div>

      </div>

    </div>

  )

}