export default function TabsNavigation({ activeTab, setActiveTab }) {
  const tabs = [
    { id: "orders", label: "Commandes / Transferts" },
    { id: "entries", label: "Entrées" },
    { id: "dlc", label: "Paninis" },
    { id: "stock", label: "Stock" },
    { id: "messages", label: "Messagerie" },
  ]

  return (
    <div className="border-b border-slate-300">
      <div className="flex gap-8 flex-wrap">
        {tabs.map((tab) => {
          const isActive = activeTab === tab.id

          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={`
                relative pb-3 text-sm font-medium transition-all duration-200
                ${
                  isActive
                    ? "text-blue-800"
                    : "text-slate-500 hover:text-slate-800"
                }
              `}
            >
              {tab.label}

              {isActive && (
                <span className="absolute left-0 -bottom-[1px] w-full h-[2px] bg-blue-800 rounded-full" />
              )}
            </button>
          )
        })}
      </div>
    </div>
  )
}