import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Outfit, Plus_Jakarta_Sans } from "next/font/google";
import "highlight.js/styles/atom-one-dark.css";
import "@/styles/tokens.css";
import "@/styles/base.css";
import "@/styles/mobile.css";
import "@/styles/desktop.css";
import "@/styles/admin.css";

const outfit = Outfit({ subsets: ["latin"], variable: "--font-display", display: "swap" });
const jakarta = Plus_Jakarta_Sans({ subsets: ["latin"], variable: "--font-sans", display: "swap" });
const mono = JetBrains_Mono({ subsets: ["latin"], variable: "--font-mono", display: "swap" });

const THEME_BOOT = `try{var p=JSON.parse(localStorage.getItem("nexo.prefs")||"{}");var t=p.theme||"dark";if(t==="system")t=matchMedia("(prefers-color-scheme: light)").matches?"light":"dark";var d=document.documentElement;d.dataset.theme=t;if(p.accentColor)d.dataset.accent=p.accentColor;if(p.fontSize)d.dataset.fontSize=p.fontSize;if(p.chatDensity)d.dataset.density=p.chatDensity;var m=document.querySelector('meta[name="theme-color"]');if(m)m.setAttribute("content",t==="light"?"#f4f7fb":"#080b10")}catch(e){document.documentElement.dataset.theme="dark"}`;

export const metadata: Metadata = {
  title: "NEXO AI",
  description: "Beyond Intelligence. Beyond Limits. Unified AI Platform for intelligent conversation, voice, vision, image creation, and knowledge workflows.",
  manifest: "/manifest.webmanifest",
  icons: { icon: "/icons/icon-192.png", apple: "/icons/apple-touch-icon.png" },
  appleWebApp: { capable: true, title: "NEXO AI", statusBarStyle: "black-translucent" },
  openGraph: {
    title: "NEXO AI",
    description: "Beyond Intelligence. Beyond Limits. Unified AI Platform for intelligent conversation, voice, vision, image creation, and knowledge workflows.",
    type: "website"
  }
};

export const viewport: Viewport = {
  themeColor: "#080b10",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${outfit.variable} ${jakarta.variable} ${mono.variable}`} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: THEME_BOOT }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
