"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"
import Card from "@/components/ui/Card"
import Button from "@/components/ui/Button"
import Badge from "@/components/ui/Badge"

export default function MessagingTab() {

  const [conversations, setConversations] = useState([])
  const [selectedLocation, setSelectedLocation] = useState(null)
  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [userId, setUserId] = useState(null)

  const messagesEndRef = useRef(null)

  /* ========================= */
  /* INIT USER */
  /* ========================= */

  useEffect(() => {

    async function getUser() {

      const { data: { user }, error } =
        await supabase.auth.getUser()

      if (error) {
        console.error("Erreur auth :", error)
        return
      }

      if (user) setUserId(user.id)

    }

    getUser()

  }, [])

  /* ========================= */
  /* FETCH CONVERSATIONS */
  /* ========================= */

  async function fetchConversations() {

    const { data, error } = await supabase
  .from("messages")
  .select(`
    location_id,
    read,
    receiver_role,
    locations!messages_location_id_fkey (
      id,
      name
    )
  `)
  .order("created_at", { ascending: false })

    const grouped = {}

    data?.forEach(msg => {

  if (!msg.location_id) return

  const locationName = msg.locations?.name || "Lieu inconnu"

  if (!grouped[msg.location_id]) {

    grouped[msg.location_id] = {
      location_id: msg.location_id,
      name: locationName,
      unread: 0
    }

  }

  if (
    msg.receiver_role === "livreur" &&
    msg.read === false
  ) {
    grouped[msg.location_id].unread++
  }

  if (!data) {
  setConversations([])
  return
}

if (!data) {
  console.log("Aucun message")
  setConversations([])
  return
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

    const { data, error } = await supabase
      .from("messages")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: true })

    if (error) {
      console.error("Erreur messages :", error)
      return
    }

    setMessages(data || [])

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
      .channel("livreur-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `receiver_role=eq.livreur`
        },
        (payload) => {

          const newMsg = payload.new

          if (newMsg.location_id === selectedLocation) {

            setMessages(prev => {

              if (prev.find(m => m.id === newMsg.id))
                return prev

              return [...prev, newMsg]

            })

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
  /* AUTO SCROLL */
  /* ========================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" })
  }, [messages])

  /* ========================= */
  /* SEND */
  /* ========================= */

  async function sendMessage() {

    if (!newMessage.trim() || !selectedLocation || !userId)
      return

    const { error } = await supabase
      .from("messages")
      .insert([{
        sender_id: userId,
        receiver_role: "pole",
        location_id: selectedLocation,
        content: newMessage,
        type: "message",
        read: false
      }])

    if (error) {
      console.error("Erreur message :", error)
      return
    }

    setNewMessage("")

  }
  return (
  <Card className="p-0 overflow-hidden h-[600px] flex">

    {/* SIDEBAR CONVERSATIONS */}
    <div className="w-1/3 border-r border-slate-200 overflow-y-auto bg-white">

      <div className="px-5 py-4 border-b font-semibold text-slate-800">
        Conversations
      </div>

      {conversations.length === 0 && (
        <div className="p-5 text-sm text-slate-500">
          Aucune conversation
        </div>
      )}

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
              ${isActive ? "bg-slate-100" : "hover:bg-slate-50"}
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


    {/* ZONE CHAT */}
    <div className="flex flex-col w-2/3 bg-white">

      {/* MESSAGES */}
      <div className="flex-1 p-6 overflow-y-auto space-y-4">

        {messages.map(msg => {

          const isMine = msg.sender_id === userId

          return (
            <div
              key={msg.id}
              className={`flex ${isMine ? "justify-end" : "justify-start"}`}
            >
              <div
                className={`
                  px-4 py-2 rounded-2xl max-w-[75%] text-sm
                  ${isMine
                    ? "bg-blue-700 text-white"
                    : "bg-slate-100 text-slate-800"}
                `}
              >
                {msg.content}

                <div className="text-xs opacity-70 mt-1">
                  {new Date(msg.created_at).toLocaleString("fr-FR")}
                </div>

              </div>
            </div>
          )
        })}

        <div ref={messagesEndRef} />

      </div>


      {/* INPUT MESSAGE */}
      {selectedLocation && (
        <div className="p-4 border-t border-slate-200 flex gap-3">

          <input
            value={newMessage}
            onChange={(e) => setNewMessage(e.target.value)}
            placeholder="Écrire un message..."
            className="flex-1 border rounded-lg px-3 py-2 text-sm"
          />

          <Button onClick={sendMessage}>
            Envoyer
          </Button>

        </div>
      )}

    </div>

  </Card>
)
}

