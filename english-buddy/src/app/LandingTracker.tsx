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
 * Records the landing view. Clicks are delegated once for every public page by
 * PageView, otherwise shared calls to action (notably the store badges in the
 * site footer) would become invisible on pages without a LandingTracker.
 * Every event carries the acquisition source, and `page` keeps campaign
 * landings apart from the home page. Renders nothing.
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

  }, [page]);
  return null;
}
