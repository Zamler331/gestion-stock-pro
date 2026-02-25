"use client"

import { usePendingActions } from "@/hooks/usePendingActions"

export default function PendingBadge() {
  const count = usePendingActions()

  if (count === 0) return null

  return (
    <div className="fixed bottom-4 right-4 bg-yellow-500 text-black px-4 py-2 rounded shadow z-50 font-semibold">
      🔄 {count} action(s) en attente
    </div>
  )
}