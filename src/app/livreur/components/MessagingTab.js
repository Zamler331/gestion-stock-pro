"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

export default function MessagingTab() {

  const [conversations, setConversations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")

  /* ========================= */
  /* FETCH CONVERSATIONS */
  /* ========================= */

  async function fetchConversations() {

  const { data } = await supabase
    .from("messages")
    .select(`
      location_id,
      read,
      receiver_role,
      locations (
        id,
        name
      )
    `)
    .order("created_at", { ascending: false })

  const grouped = {}

  data?.forEach(msg => {

    if (!grouped[msg.location_id]) {
      grouped[msg.location_id] = {
        location_id: msg.location_id,
        name: msg.locations?.name,
        unread: 0
      }
    }

    // Compteur non lu
    if (
      msg.receiver_role === "livreur" &&
      msg.read === false
    ) {
      grouped[msg.location_id].unread++
    }

  })

  setConversations(Object.values(grouped))
}

  useEffect(() => {
    fetchConversations()
  }, [])

  /* ========================= */
  /* FETCH MESSAGES */
  /* ========================= */

  async function fetchMessages(locationId) {
    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: true })

    setMessages(data || [])

    // Marquer comme lus
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("location_id", locationId)
      .eq("receiver_role", "livreur")
      .eq("read", false)

    fetchConversations()
  }

  /* ========================= */
  /* REALTIME */
  /* ========================= */

  useEffect(() => {

    const channel = supabase
      .channel("messages-realtime")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages"
        },
        (payload) => {

          const newMsg = payload.new

          if (newMsg.location_id === selectedLocation) {
            setMessages(prev => [...prev, newMsg])
          }

          fetchConversations()
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }

  }, [selectedLocation])

  /* ========================= */
  /* SEND */
  /* ========================= */

  async function sendMessage() {
    if (!newMessage.trim() || !selectedLocation) return

    const { data: { user } } = await supabase.auth.getUser()

    await supabase.from("messages").insert([{
      sender_id: user.id,
      receiver_role: "pole",
      location_id: selectedLocation,
      content: newMessage,
      type: "message",
      read: false
    }])

    setNewMessage("")
  }

  /* ========================= */
  /* UI */
  /* ========================= */

  return (
  <Card className="p-0 overflow-hidden h-[600px] flex">

    {/* COLONNE GAUCHE */}
    <div className="w-1/3 border-r border-slate-200 overflow-y-auto bg-white">

      {conversations.map(conv => {

        const isActive = selectedLocation === conv.location_id

        return (
          <div
            key={conv.location_id}
            onClick={() => {
              setSelectedLocation(conv.location_id)
              fetchMessages(conv.location_id)
            }}
            className={`
              px-5 py-4 cursor-pointer flex justify-between items-center
              transition-all duration-200
              ${isActive
                ? "bg-slate-100"
                : "hover:bg-slate-50"}
            `}
          >
            <span className="text-sm font-medium text-slate-800">
              {conv.name}
            </span>

            {conv.unread > 0 && (
              <Badge variant="danger">
                {conv.unread}
              </Badge>
            )}
          </div>
        )
      })}

    </div>

    {/* COLONNE DROITE */}
    <div className="w-2/3 flex flex-col bg-white">

      {/* MESSAGES */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">

        {messages.map(msg => {

          const isMine = msg.receiver_role === "pole"

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`
                  px-4 py-2 rounded-2xl max-w-xs text-sm
                  ${isMine
                    ? "bg-blue-800 text-white"
                    : "bg-slate-100 text-slate-800"}
                `}
              >
                {msg.content}
              </div>
            </div>
          )
        })}

      </div>

      {/* INPUT */}
      {selectedLocation && (
        <div className="p-4 border-t border-slate-200 flex gap-3 bg-white">

          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrire un message..."
            className="flex-1"
          />

          <Button
            variant="primary"
            onClick={sendMessage}
          >
            Envoyer
          </Button>

        </div>
      )}

    </div>

  </Card>
)
}