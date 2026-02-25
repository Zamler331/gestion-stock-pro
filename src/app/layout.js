import PendingBadge from "@/components/PendingBadge"
import ServiceWorkerRegister from "@/components/ServiceWorkerRegister";
import OfflineIndicator from "@/components/OfflineIndicator"
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import SyncIndicator from "@/components/SyncIndicator"

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata = {
  title: "Gestion Stock Pro",
  description: "Application interne de gestion de stock"
}

export const viewport = {
  themeColor: "#0f172a"
};

export default function RootLayout({ children }) {
  return (
    <html lang="fr">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
       <ServiceWorkerRegister />
       <OfflineIndicator />
       <PendingBadge />
       <SyncIndicator />
       {children}
      </body>
    </html>
  );
}
