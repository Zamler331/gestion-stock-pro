"use client"

import { useEffect, useState } from "react"
import { getPendingOrders } from "@/lib/services/ordersService"

export default function useOrders() {
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  async function fetchOrders() {
    setLoading(true)
    try {
      const data = await getPendingOrders()
      setOrders(data || [])
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchOrders()
  }, [])

  return { orders, loading, refresh: fetchOrders }
}