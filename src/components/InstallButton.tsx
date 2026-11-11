"use client";
import { useInstall } from "@/lib/useInstall";

export default function InstallButton({ label }: { label: string }) {
  const { canInstall, install } = useInstall();
  if (!canInstall) return null;
  return <button className="chip" onClick={install}>⬇ {label}</button>;
}
