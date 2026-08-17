"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ensureAttribution } from "@/lib/attribution-client";
import { trackablePath } from "@/lib/public-pages";

/**
 * Counts a visit to any public page, with the channel that brought it.
 *
 * Until now only two pages were counted — the home page and the campaign
 * landing — because the funnel tracker was placed by hand on each. Everything
 * else was invisible: nobody could say how many people reached /scarica, or
 * whether anyone read the prices before leaving.
 *
 * This is deliberately not the same event as `landing_view`. That one means
 * "someone entered the funnel" and the funnel queries depend on it. This one
 * means "someone loaded a page", which is a different question, and the two
 * overlap on the two landings on purpose.
 *
 * The signed-in app is excluded: moving between /home and /chat is product
 * usage, not traffic, and mixing the two would make both unreadable.
 */
export function PageView() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;
    const path = trackablePath(pathname);
    if (!path) return;
    // React may run this twice for one navigation; a visit is one row.
    if (lastSent.current === path) return;
    lastSent.current = path;

    const attribution = ensureAttribution();
    const payload: Record<string, string> = { name: "page_view", page: path };
    if (attribution) {
      payload.visitorId = attribution.visitorId;
      payload.src = attribution.source;
      if (attribution.medium) payload.medium = attribution.medium;
      if (attribution.campaign) payload.campaign = attribution.campaign;
    }
    if (document.referrer) payload.ref = document.referrer.slice(0, 200);

    try {
      const body = JSON.stringify(payload);
      const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
      if (!sent) void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
    } catch {
      // Counting a visit must never cost the visitor anything.
    }
  }, [pathname]);

  return null;
}
