"use client";
import { useInstall } from "@/lib/useInstall";
import { Icon } from "./mobile/icons";

export default function InstallButton({ label }: { label: string }) {
  const { canInstall, install } = useInstall();
  if (!canInstall) return null;
  return (
    <button className="chip" onClick={install} style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
      <Icon name="upload" size={14} />
      <span>{label}</span>
    </button>
  );
}
