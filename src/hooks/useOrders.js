import { useEffect, useState } from "react"
import { getPendingOrders } from "@/lib/services/ordersService"

export function useOrders(locationId) {

  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchOrders() {

    if (!locationId) return

    setLoading(true)

    try {

      const data = await getPendingOrders(locationId)

      setOrders(data)

    } catch (error) {

      console.error("Erreur fetchOrders:", error)

    } finally {

      setLoading(false)

    }

  }

  useEffect(() => {
  fetchOrders()
}, [])

  useEffect(() => {

  function handleSync() {
    fetchOrders()
  }

  window.addEventListener("ordersSynced", handleSync)

  return () => {
    window.removeEventListener("ordersSynced", handleSync)
  }

}, [])

  return {
    orders,
    loading,
    refresh: fetchOrders
  }
}