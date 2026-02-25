"use client"

import { useState } from "react"
import { supabase } from "@/lib/supabase"
import { useRouter } from "next/navigation"

export default function Login() {
  const [username, setUsername] = useState("")
  const [password, setPassword] = useState("")
  const [error, setError] = useState("")
  const router = useRouter()

  const handleLogin = async (e) => {
    e.preventDefault()

    // Transformation username -> email interne
    const email = `${username}@interne.local`

    const { data, error } = await supabase.auth.signInWithPassword({
      email,
      password,
    })

    if (error) {
      setError("Identifiant ou mot de passe incorrect")
      return
    }

    // Récupérer le rôle
    const { data: profile } = await supabase
      .from("profiles")
      .select("role")
      .eq("id", data.user.id)
      .single()

    if (!profile) {
      setError("Aucun rôle trouvé")
      return
    }

    // Redirection selon rôle
    if (profile.role === "admin") {
      router.push("/admin")
    } else if (profile.role === "pole") {
      router.push("/pole")
    } else if (profile.role === "livreur") {
      router.push("/livreur")
    }
  }

  return (
    <div className="flex items-center justify-center h-screen bg-gray-100">
      <form onSubmit={handleLogin} className="bg-white p-8 rounded-xl shadow-md w-80">
        <h2 className="text-2xl font-bold mb-6 text-center">Connexion</h2>

        <input
          type="text"
          placeholder="Identifiant"
          value={username}
          onChange={(e) => setUsername(e.target.value)}
          className="w-full p-2 border rounded mb-4"
          required
        />

        <input
          type="password"
          placeholder="Mot de passe"
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          className="w-full p-2 border rounded mb-4"
          required
        />

        {error && <p className="text-red-500 text-sm mb-4">{error}</p>}

        <button className="w-full bg-blue-600 text-white p-2 rounded">
          Se connecter
        </button>
      </form>
    </div>
  )
}