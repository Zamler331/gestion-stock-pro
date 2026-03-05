"use client"

import { useEffect, useState, useRef } from "react"
import { supabase } from "@/lib/supabase"

export default function MessagingTab({ locationId }) {

  const [messages, setMessages] = useState([])
  const [newMessage, setNewMessage] = useState("")
  const [unreadCount, setUnreadCount] = useState(0)
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
  /* FETCH + REALTIME */
  /* ========================= */

  useEffect(() => {

    if (!locationId) return

    fetchMessages()

    const channel = supabase
      .channel("pole-messages")
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "messages",
          filter: `location_id=eq.${locationId}`
        },
        (payload) => {

          const newMsg = payload.new

          setMessages(prev => {

            // évite doublons
            if (prev.find(m => m.id === newMsg.id)) {
              return prev
            }

            return [...prev, newMsg]
          })

        }
      )
      .subscribe()

    return () => {
      supabase.removeChannel(channel)
    }

  }, [locationId])

  /* ========================= */
  /* FETCH MESSAGES */
  /* ========================= */

  async function fetchMessages() {

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

    const unread = data?.filter(
      m =>
        m.receiver_role === "pole" &&
        m.read === false
    ).length

    setUnreadCount(unread)

    await supabase
      .from("messages")
      .update({ read: true })
      .eq("location_id", locationId)
      .eq("receiver_role", "pole")
      .eq("read", false)
  }

  /* ========================= */
  /* AUTO SCROLL */
  /* ========================= */

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({
      behavior: "smooth"
    })
  }, [messages])

  /* ========================= */
  /* SEND MESSAGE */
  /* ========================= */

  async function sendMessage() {

    if (!newMessage.trim()) return
    if (!userId) return

    const { error } = await supabase
      .from("messages")
      .insert([{
        sender_id: userId,
        receiver_role: "livreur",
        location_id: locationId,
        content: newMessage,
        type: "message",
        read: false
      }])

    if (error) {
      console.error("Erreur envoi message :", error)
      return
    }

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

            const isMine = msg.sender_id === userId

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

          <div ref={messagesEndRef} />

        </div>

        {/* Input */}

        <div className="mt-4 flex gap-3">

          <input
            value={newMessage}
            onChange={(e) =>
              setNewMessage(e.target.value)
            }
            onKeyDown={(e) => {
              if (e.key === "Enter") sendMessage()
            }}
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