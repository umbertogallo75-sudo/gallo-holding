"use client";

import { useEffect } from "react";
import { ensureAttribution } from "@/lib/attribution-client";

function send(name: string, extra: Record<string, string> = {}) {
  try {
    const body = JSON.stringify({ name, ...extra });
    const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    // Analytics never blocks the visitor.
  }
}

/**
 * Records the landing view and clicks on any element carrying a data-track
 * attribute. Every event carries the acquisition source, so the funnel can be
 * read one channel at a time instead of as a single undifferentiated total —
 * and `page` keeps campaign landings apart from the home page, which matters
 * as soon as there is more than one. Renders nothing.
 */
export function LandingTracker({ page }: { page?: string } = {}) {
  useEffect(() => {
    const attribution = ensureAttribution();
    const context: Record<string, string> = {};
    if (page) context.page = page;
    if (attribution) {
      context.visitorId = attribution.visitorId;
      context.src = attribution.source;
      if (attribution.medium) context.medium = attribution.medium;
      if (attribution.campaign) context.campaign = attribution.campaign;
    }

    send("landing_view", { ...context, ...(document.referrer ? { ref: document.referrer.slice(0, 200) } : {}) });

    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.("[data-track]");
      const name = el?.getAttribute("data-track");
      if (!name) return;
      // A page can carry the same call to action more than once; data-where
      // says which copy was tapped, so a duplicated button can be judged
      // instead of guessed at.
      const where = el?.getAttribute("data-where");
      send(name, where ? { ...context, where } : context);
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [page]);
  return null;
}
