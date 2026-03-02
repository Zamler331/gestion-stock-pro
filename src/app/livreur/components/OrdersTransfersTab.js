import OrdersSection from "./orders/OrdersSection"
import TransferBetweenPoles from "./transfers/TransferBetweenPoles"

export default function OrdersTransfersTab() {
  return (
    <div className="space-y-10">
      <OrdersSection />
      <TransferBetweenPoles />
    </div>
  )
}