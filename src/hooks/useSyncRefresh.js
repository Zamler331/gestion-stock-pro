"use client"

import { useEffect } from "react"
import { subscribeSync } from "@/lib/SyncManager"

export function useSyncRefresh(refetchFunction) {

  useEffect(() => {

    function handleSync(isSyncing) {
      if (!isSyncing) {
        refetchFunction()
      }
    }

    subscribeSync(handleSync)

  }, [refetchFunction])
}