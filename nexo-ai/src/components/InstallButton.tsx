"use client";
import { useEffect, useState } from "react";

export default function InstallButton({ label }: { label: string }) {
  const [evt, setEvt] = useState<any>(null);
  useEffect(() => {
    const on = (e: Event) => { e.preventDefault(); setEvt(e); };
    const done = () => setEvt(null);
    window.addEventListener("beforeinstallprompt", on);
    window.addEventListener("appinstalled", done);
    return () => { window.removeEventListener("beforeinstallprompt", on); window.removeEventListener("appinstalled", done); };
  }, []);
  if (!evt) return null;
  return <button className="chip" onClick={async () => { await evt.prompt(); setEvt(null); }}>⬇ {label}</button>;
}
