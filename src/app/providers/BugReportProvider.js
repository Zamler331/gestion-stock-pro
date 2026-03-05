"use client"

import { createContext, useContext, useState } from "react"
import BugReportModal from "@/components/BugReportModal"

const BugContext = createContext()

export function useBugReport() {
  return useContext(BugContext)
}

export default function BugReportProvider({ children }) {

  const [open, setOpen] = useState(false)
  const [role, setRole] = useState(null)

  function openBug(roleName) {
    setRole(roleName)
    setOpen(true)
  }

  return (

    <BugContext.Provider value={{ openBug }}>

      {children}

      <BugReportModal
        open={open}
        role={role}
        onClose={() => setOpen(false)}
      />

    </BugContext.Provider>

  )

}