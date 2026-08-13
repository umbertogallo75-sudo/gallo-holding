"use client";

import { useSyncExternalStore } from "react";

/**
 * Device-aware app download button for the landing: iPhones get the App
 * Store, Androids their store path, both through /app (the server redirect
 * that always knows the freshest destination). Desktop and the store-app
 * wrappers see nothing.
 */
function platform(): "ios" | "android" | null {
  if (typeof navigator === "undefined") return null;
  const ua = navigator.userAgent;
  if (ua.includes("ExecLingoApp")) return null; // already inside the app
  if (typeof document !== "undefined" && document.cookie.includes("eb_app=")) return null;
  if (/iphone|ipad|ipod/i.test(ua)) return "ios";
  if (/android/i.test(ua)) return "android";
  return null;
}

export function StoreCta() {
  const device = useSyncExternalStore(() => () => {}, platform, () => null);
  if (!device) return null;
  return (
    <a href="/app" className="landCta" data-track="landing_store_cta" style={{ textDecoration: "none" }}>
      {device === "ios" ? " Scarica l’app dall’App Store" : "📲 Installa l’app ExecLingo"}
    </a>
  );
}
