"use client"

import { useEffect } from "react"
import { syncQueue } from "@/lib/offline/syncService"

export default function SyncInitializer() {

  useEffect(() => {

    if (navigator.onLine) {
    syncQueue()
  }

    window.addEventListener("online", syncQueue)

    return () => {
      window.removeEventListener("online", syncQueue)
    }

  }, [])

  return null
}