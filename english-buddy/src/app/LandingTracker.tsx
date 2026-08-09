"use client";

import { useEffect } from "react";

const VISITOR_KEY = "buddy-visitor-id";

function visitorId(): string {
  let id = localStorage.getItem(VISITOR_KEY);
  if (!id) {
    id = crypto.randomUUID();
    localStorage.setItem(VISITOR_KEY, id);
  }
  return id;
}

function send(name: string, ref?: string) {
  try {
    const body = JSON.stringify({ name, visitorId: visitorId(), ref: ref || undefined });
    const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    // Analytics never blocks the visitor.
  }
}

/**
 * Records the landing view and clicks on any element carrying a data-track
 * attribute. Renders nothing.
 */
export function LandingTracker() {
  useEffect(() => {
    send("landing_view", document.referrer.slice(0, 200));
    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.("[data-track]");
      const name = el?.getAttribute("data-track");
      if (name) send(name);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
