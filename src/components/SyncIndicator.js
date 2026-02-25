"use client"

import { useEffect, useState } from "react"
import { subscribeSync } from "@/lib/SyncManager"

export default function SyncIndicator() {
  const [syncing, setSyncing] = useState(false)

  useEffect(() => {
    subscribeSync(setSyncing)
  }, [])

  if (!syncing) return null

  return (
    <div className="fixed top-4 right-4 bg-blue-600 text-white px-4 py-2 rounded shadow z-50 animate-pulse">
      🔄 Synchronisation en cours...
    </div>
  )
}