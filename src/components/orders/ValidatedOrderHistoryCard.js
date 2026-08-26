"use client"

import { useMemo } from "react"
import Badge from "@/components/ui/Badge"
import Button from "@/components/ui/Button"
import Card from "@/components/ui/Card"

function formatDate(value) {
  if (!value) return "Date inconnue"

  return new Intl.DateTimeFormat("fr-FR", {
    dateStyle: "short",
    timeStyle: "short",
  }).format(new Date(value))
}

export default function ValidatedOrderHistoryCard({
  order,
  actionLabel = null,
  actionPending = false,
  onAction = null,
}) {
  const sortedItems = useMemo(
    () => [...(order.order_items || [])].sort((a, b) =>
      (a.products?.name || "").localeCompare(
        b.products?.name || "",
        "fr"
      )
    ),
    [order.order_items]
  )

  return (
    <Card className="space-y-5 p-4 sm:p-6">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
        <div className="space-y-1">
          <h3 className="text-lg font-semibold text-slate-900">
            {order.locations?.name || "Pôle inconnu"}
          </h3>
          <p className="text-sm text-slate-500">
            Validée le {formatDate(order.validated_at)}
          </p>
          <p className="text-xs text-slate-400">
            Commandée le {formatDate(order.created_at)}
          </p>
        </div>

        <Badge variant="success">Livrée</Badge>
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200">
        <div className="hidden grid-cols-[minmax(0,1fr)_5rem_5rem] gap-3 bg-slate-50 px-4 py-2 text-xs font-semibold uppercase tracking-wide text-slate-500 sm:grid">
          <span>Produit</span>
          <span className="text-center">Demandé</span>
          <span className="text-center">Livré</span>
        </div>

        <div className="divide-y divide-slate-100">
          {sortedItems.map((item) => {
            const ordered = Number(item.quantity_ordered || 0)
            const delivered = Number(item.quantity_delivered || 0)
            const isDifferent = delivered !== ordered

            return (
              <div
                key={item.id}
                className="space-y-2 px-4 py-3 text-sm sm:grid sm:grid-cols-[minmax(0,1fr)_5rem_5rem] sm:items-center sm:gap-3 sm:space-y-0"
              >
                <span className="block break-words font-medium leading-snug text-slate-800 sm:truncate">
                  {item.products?.name || "Produit inconnu"}
                </span>
                <div className="grid grid-cols-2 gap-2 sm:contents">
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 sm:block sm:bg-transparent sm:p-0 sm:text-center">
                    <span className="text-xs text-slate-500 sm:hidden">
                      Demandé
                    </span>
                    <span className="text-slate-500">{ordered}</span>
                  </div>
                  <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 sm:block sm:bg-transparent sm:p-0 sm:text-center">
                    <span className="text-xs text-slate-500 sm:hidden">
                      Livré
                    </span>
                    <span
                      className={`font-semibold ${
                        isDifferent ? "text-amber-700" : "text-slate-800"
                      }`}
                    >
                      {delivered}
                    </span>
                  </div>
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {onAction && actionLabel && (
        <div className="space-y-2 border-t border-slate-100 pt-4">
          <Button
            type="button"
            variant="secondary"
            onClick={() => onAction(order)}
            disabled={actionPending}
            className="w-full sm:w-auto"
          >
            {actionPending ? "Annulation..." : actionLabel}
          </Button>
          <p className="text-xs text-slate-500">
            La commande repassera en attente avec les quantités livrées
            précédemment, afin de pouvoir les corriger puis la valider à nouveau.
          </p>
        </div>
      )}
    </Card>
  )
}
