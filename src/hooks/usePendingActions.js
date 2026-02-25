"use client"

import { useEffect, useState } from "react"
import { db } from "@/lib/localDB"

export function usePendingActions() {
  const [count, setCount] = useState(0)

  useEffect(() => {
    async function fetchCount() {
      const all = await db.pendingActions.toArray()

      const total = all.filter(
        action => action.synced === false
      ).length

      setCount(total)
    }

    fetchCount()

    const interval = setInterval(fetchCount, 2000)

    return () => clearInterval(interval)
  }, [])

  return count
}