export function filterByDate(movements, startDate, endDate) {

  return movements.filter(m => {

    if (!startDate && !endDate) return true

    const movementDate = new Date(m.created_at)

    if (startDate && movementDate < new Date(startDate)) return false
    if (endDate && movementDate > new Date(endDate + "T23:59:59")) return false

    return true
  })
}

export function computeStats(movements) {

  return {
    total: movements.length,
    livraisons: movements.filter(m => m.type === "livraison").length,
    transferts: movements.filter(m => m.type === "transfert").length,
    sorties: movements.filter(m => m.type === "sortie").length,
    entries: movements.filter(m => m.type === "entry").length,
    corrections: movements.filter(m => m.type === "correction").length
  }
}

export function computeTopProducts(movements) {

  const map = {}

  movements
    .filter(m =>
      ["sortie", "livraison", "transfert"].includes(m.type)
    )
    .forEach(m => {
      const name = m.products?.name || "Inconnu"

      if (!map[name]) map[name] = 0
      map[name] += Math.abs(m.quantity)
    })

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 5)
}

export function computePoleConsumption(movements) {

  const map = {}

  movements
    .filter(m =>
      ["sortie", "livraison"].includes(m.type)
    )
    .forEach(m => {

      const pole = m.destination?.name || "Inconnu"

      if (!map[pole]) map[pole] = 0
      map[pole] += Math.abs(m.quantity)
    })

  return Object.entries(map)
    .sort((a, b) => b[1] - a[1])
}

export function computeActivityByDay(movements) {

  const map = {}

  movements.forEach(m => {

    const date = new Date(m.created_at)
      .toISOString()
      .split("T")[0]

    if (!map[date]) map[date] = 0
    map[date] += 1
  })

  return Object.entries(map)
    .sort((a, b) => new Date(a[0]) - new Date(b[0]))
}