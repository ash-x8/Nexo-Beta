"use client";
import { useEffect, useRef, type ReactNode } from "react";

interface Props { open: boolean; title: string; onClose: () => void; children: ReactNode }

export default function BottomSheet({ open, title, onClose, children }: Props) {
  const panel = useRef<HTMLDivElement>(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;

  useEffect(() => {
    if (!open) return;
    const prev = document.activeElement as HTMLElement | null;
    panel.current?.focus();
    const esc = (e: KeyboardEvent) => { if (e.key === "Escape") closeRef.current(); };
    window.addEventListener("keydown", esc);
    return () => { window.removeEventListener("keydown", esc); prev?.focus?.(); };
  }, [open]);

  if (!open) return null;
  return (
    <div className="m-sheet-wrap">
      <div className="m-scrim" onClick={onClose} />
      <div className="m-sheet" role="dialog" aria-modal="true" aria-label={title} tabIndex={-1} ref={panel}>
        <div className="m-grab" aria-hidden="true" />
        <h2 className="m-sheet-title">{title}</h2>
        {children}
      </div>
    </div>
  );
}
