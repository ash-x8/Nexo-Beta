"use client";
import { useEffect, useState } from "react";

/** Phones, and installed (standalone) PWAs on touch devices up to tablet width, get the mobile interface. */
const MOBILE_QUERY = "(max-width: 768px), (display-mode: standalone) and (pointer: coarse) and (max-width: 1024px)";

/** null until the first client measurement, so the first paint never shows the wrong layout. */
export function useIsMobile(): boolean | null {
  const [mobile, setMobile] = useState<boolean | null>(null);
  useEffect(() => {
    const mq = window.matchMedia(MOBILE_QUERY);
    const on = () => setMobile(mq.matches);
    on();
    mq.addEventListener("change", on);
    return () => mq.removeEventListener("change", on);
  }, []);
  return mobile;
}

/**
 * Tracks the visual viewport so the composer stays above the on-screen keyboard on Android and iOS
 * (modern Chrome no longer resizes the layout viewport when the keyboard opens).
 * Publishes --vvh (visible height) and returns whether the keyboard is open.
 */
export function useKeyboardViewport(active: boolean): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    if (!active) return;
    const vv = window.visualViewport;
    const root = document.documentElement;
    const update = () => {
      const h = vv ? vv.height : window.innerHeight;
      root.style.setProperty("--vvh", `${Math.round(h)}px`);
      setOpen(window.innerHeight - h > 120);
      if (vv && vv.offsetTop > 0) window.scrollTo(0, 0);
    };
    update();
    vv?.addEventListener("resize", update);
    vv?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      vv?.removeEventListener("resize", update);
      vv?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      root.style.removeProperty("--vvh");
    };
  }, [active]);
  return open;
}
