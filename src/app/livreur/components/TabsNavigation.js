export default function TabsNavigation({
  activeTab,
  setActiveTab,
  unreadMessagesCount = 0,
}) {  
  
  const tabs = [
    { id: "orders", label: "Commandes / Transferts" },
    { id: "history", label: "Historique" },
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
              <span className="inline-flex items-center gap-2">
  {tab.label}

  {tab.id === "messages" && unreadMessagesCount > 0 && (
    <span className="min-w-5 h-5 px-1.5 rounded-full bg-red-600 text-white text-xs flex items-center justify-center">
      {unreadMessagesCount}
    </span>
  )}
</span>

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
