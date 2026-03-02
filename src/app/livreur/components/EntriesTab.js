import SupplierEntry from "./entries/SupplierEntry"
import ManualStockCorrection from "./stock/ManualStockCorrection"

export default function EntriesTab() {
  return (
  <div className="space-y-8">

    {/* HEADER */}
    <div className="flex justify-between items-center">
      <h2 className="text-xl font-semibold text-slate-900">
        Entrées & Corrections
      </h2>

      <div className="text-sm text-slate-500">
        Gestion des mouvements entrants
      </div>
    </div>

    {/* CONTENT */}
    <div className="space-y-8">

      <div className="transition-all duration-200 hover:-translate-y-0.5">
        <SupplierEntry />
      </div>

      <div className="transition-all duration-200 hover:-translate-y-0.5">
        <ManualStockCorrection />
      </div>

    </div>

  </div>
)
}