"use client";

import { useEffect } from "react";
import { syncPendingActions } from "@/lib/SyncManager";
import { db } from "@/lib/localDB";

export default function ServiceWorkerRegister() {

  useEffect(() => {

    const interval = setInterval(() => {
  if (navigator.onLine) {
    syncPendingActions()
  }
}, 30000) // toutes les 30 secondes

    /* ========================= */
    /* 1️⃣ Enregistrement SW */
    /* ========================= */

    if ("serviceWorker" in navigator) {
      navigator.serviceWorker
        .register("/sw.js")
        .then(() => console.log("Service Worker enregistré"))
        .catch((err) =>
          console.error("Erreur Service Worker :", err)
        );
    }

    /* ========================= */
    /* 2️⃣ Fonction de sync sécurisée */
    /* ========================= */

    const runSyncIfNeeded = async () => {
      try {
        const count = await db.pendingActions
  .filter(a => a.synced === false)
  .count();

        if (count > 0) {
          console.log(`🔄 ${count} action(s) à synchroniser`);
          await syncPendingActions();
        }
      } catch (err) {
        console.error("Erreur vérification sync:", err);
      }
    };

    /* ========================= */
    /* 3️⃣ Sync au retour online */
    /* ========================= */

    const handleOnline = () => {
      console.log("🌐 Connexion rétablie → Synchronisation...");
      runSyncIfNeeded();
    };

    window.addEventListener("online", handleOnline);

    /* ========================= */
    /* 4️⃣ Sync au chargement si déjà online */
    /* ========================= */

    if (navigator.onLine) {
      runSyncIfNeeded();
    }

    /* ========================= */
    /* 5️⃣ Nettoyage React */
    /* ========================= */

    return () => {
  window.removeEventListener("online", handleOnline)
  clearInterval(interval)
};

  }, []);

  return null;
}