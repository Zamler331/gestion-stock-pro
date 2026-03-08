"use client"

import OrdersSection from "./orders/OrdersSection"
import TransferBetweenPoles from "./transfers/TransferBetweenPoles"

export default function OrdersTransfersTab({ locationId }) {

  return (
    <div className="space-y-10">
      <OrdersSection locationId={locationId} />
      <TransferBetweenPoles locationId={locationId} />
    </div>
  )

}