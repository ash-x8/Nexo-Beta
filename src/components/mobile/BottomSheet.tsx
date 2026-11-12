"use client";
import { useEffect, type ReactNode } from "react";

interface Props {
  open: boolean;
  title: string;
  onClose: () => void;
  children: ReactNode;
}

export default function BottomSheet({ open, title, onClose, children }: Props) {
  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, onClose]);

  if (!open) return null;

  return (
    <div className="nx-sheet-backdrop" role="dialog" aria-modal="true" aria-label={title} onClick={onClose}>
      <div className="nx-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="nx-sheet-handle" aria-hidden="true" />
        <h3 className="nx-sheet-title">{title}</h3>
        {children}
      </div>
    </div>
  );
}
