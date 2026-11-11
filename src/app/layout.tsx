import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Sora } from "next/font/google";
import "highlight.js/styles/atom-one-dark.css";
import "./globals.css";
import "./mobile.css";
import "./theme.css";

const sora = Sora({ subsets: ["latin"], variable: "--font-sora", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

// Runs before first paint so the saved theme never flashes the wrong colors.
const THEME_BOOT = `try{var p=JSON.parse(localStorage.getItem("nexo.prefs")||"{}");var t=p.theme||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";document.documentElement.dataset.theme=t}catch(e){document.documentElement.dataset.theme="dark"}`;

export const metadata: Metadata = {
  title: "NEXO AI",
  description: "Your Intelligent Digital Companion - Advanced Personal AI Assistant Platform with voice, vision, memory, and web search",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NEXO AI", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "NEXO AI",
    description: "Your Intelligent Digital Companion - Advanced Personal AI Assistant Platform with voice, vision, memory, and web search",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#07080c",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${sora.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
