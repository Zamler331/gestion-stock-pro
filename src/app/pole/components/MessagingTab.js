"use client"

import { useEffect, useState } from "react"
import { supabase } from "@/lib/supabase"

export default function MessagingTab({ locationId }) {

  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [unreadCount, setUnreadCount] = useState(0)

  /* ========================= */
  /* FETCH MESSAGES */
  /* ========================= */

  useEffect(() => {
    if (locationId) {
      fetchMessages()
      subscribeRealtime()
    }
  }, [locationId])

  async function fetchMessages() {

    const { data } = await supabase
      .from("messages")
      .select("*")
      .eq("location_id", locationId)
      .order("created_at", { ascending: true })

    setMessages(data || [])

    // Compteur non lus
    const unread = data?.filter(
      m =>
        m.receiver_role === "pole" &&
        m.read === false
    ).length

    setUnreadCount(unread)

    // Marquer comme lus
    await supabase
      .from("messages")
      .update({ read: true })
      .eq("location_id", locationId)
      .eq("receiver_role", "pole")
      .eq("read", false)
  }

  /* ========================= */
  /* REALTIME */
  /* ========================= */

  function subscribeRealtime() {

    const channel = supabase
      .channel("pole-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages"
        },
        (payload) => {

          const newMsg = payload.new

          if (newMsg.location_id === locationId) {
            setMessages(prev => [...prev, newMsg])

            // Si message reçu par le pôle
            if (
              newMsg.receiver_role === "pole"
            ) {
              setUnreadCount(prev => prev + 1)
            }
          }
        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }
  }

  /* ========================= */
  /* SEND MESSAGE */
  /* ========================= */

  async function sendMessage() {

    if (!newMessage.trim()) return

    const { data: { user } } =
      await supabase.auth.getUser()

    await supabase.from("messages").insert([{
      sender_id: user.id,
      receiver_role: "livreur",
      location_id: locationId,
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
    <div className="space-y-6">

      <div className="flex items-center gap-3">

        <h2 className="text-2xl font-bold">
          Messagerie
        </h2>

        {unreadCount > 0 && (
          <span className="bg-red-600 text-white text-xs px-2 py-1 rounded-full">
            {unreadCount}
          </span>
        )}

      </div>

      <div className="bg-white rounded-2xl shadow p-6 h-[450px] flex flex-col">

        {/* Messages */}
        <div className="flex-1 overflow-y-auto space-y-4">

          {messages.map(msg => {

            const isMine =
              msg.receiver_role === "livreur"

            return (
              <div
                key={msg.id}
                className={`flex ${
                  isMine
                    ? "justify-end"
                    : "justify-start"
                }`}
              >
                <div
                  className={`px-4 py-2 rounded-2xl max-w-xs text-sm ${
                    isMine
                      ? "bg-blue-600 text-white"
                      : "bg-gray-200 text-gray-800"
                  }`}
                >
                  {msg.content}

                  <div className="text-xs opacity-70 mt-1">
                    {new Date(msg.created_at)
                      .toLocaleString("fr-FR")}
                  </div>
                </div>
              </div>
            )
          })}

        </div>

        {/* Input */}
        <div className="mt-4 flex gap-3">
          <input
            value={newMessage}
            onChange={(e) =>
              setNewMessage(e.target.value)
            }
            placeholder="Écrire un message..."
            className="flex-1 border rounded-lg px-3 py-2"
          />

          <button
            onClick={sendMessage}
            className="bg-blue-600 text-white px-4 py-2 rounded-lg"
          >
            Envoyer
          </button>
        </div>

      </div>

    </div>
  )
}