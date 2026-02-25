"use client"

import { useEffect, useState } from "react"

export default function OfflineIndicator() {
  const [isOnline, setIsOnline] = useState(true)

  useEffect(() => {
    const updateStatus = () => setIsOnline(navigator.onLine)

    window.addEventListener("online", updateStatus)
    window.addEventListener("offline", updateStatus)

    updateStatus()

    return () => {
      window.removeEventListener("online", updateStatus)
      window.removeEventListener("offline", updateStatus)
    }
  }, [])

  if (isOnline) return null

  return (
    <div className="fixed bottom-4 left-4 bg-red-600 text-white px-4 py-2 rounded shadow z-50">
      ⚠ Mode hors ligne
    </div>
  )
}