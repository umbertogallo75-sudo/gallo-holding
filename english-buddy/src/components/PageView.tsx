"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";
import { ensureAttribution } from "@/lib/attribution-client";
import { MARKETING_TAGS_READY_EVENT, marketingTags, readConsent } from "@/lib/consent";
import { safeGa4PageContext, type Ga4PageContext } from "@/lib/ga4-page-context";
import { trackablePath } from "@/lib/public-pages";

type Gtag = {
  (command: "set", params: Ga4PageContext): void;
  (command: string, action: string, params?: Record<string, unknown>): void;
};
type AnalyticsWindow = Window & { gtag?: Gtag };

function sendFirstPartyEvent(payload: Record<string, string>) {
  try {
    const body = JSON.stringify(payload);
    const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    // Measuring acquisition must never block the visitor.
  }
}

function acquisitionContext(page: string): Record<string, string> {
  const context: Record<string, string> = { page };
  const attribution = ensureAttribution();
  if (attribution) {
    context.visitorId = attribution.visitorId;
    context.src = attribution.source;
    if (attribution.medium) context.medium = attribution.medium;
    if (attribution.campaign) context.campaign = attribution.campaign;
  }
  return context;
}

function analyticsClient(): { analyticsId: string; gtag: Gtag } | null {
  if (typeof window === "undefined" || readConsent(document.cookie) !== "granted") return null;
  const analyticsId = marketingTags().analyticsId;
  const gtag = (window as AnalyticsWindow).gtag;
  return analyticsId && typeof gtag === "function" ? { analyticsId, gtag } : null;
}

/** Sets a safe global context for GA4 and every Enhanced Measurement event. */
export function setGa4PageContext(
  pathname: string,
  search: string,
  pageReferrer: string,
): Ga4PageContext | null {
  const client = analyticsClient();
  if (!client) return null;
  try {
    const pageContext = safeGa4PageContext({
      pathname,
      search,
      origin: window.location.origin,
      referrer: pageReferrer,
    });
    client.gtag("set", pageContext);
    return pageContext;
  } catch {
    return null;
  }
}

/** Sends one consented, public and sanitised GA4 page_view. */
export function reportGa4PageView(
  pathname: string,
  search: string,
  pageReferrer: string,
): Ga4PageContext | null {
  const safePath = trackablePath(pathname);
  if (!safePath) return null;
  const client = analyticsClient();
  if (!client) return null;
  try {
    const pageContext = safeGa4PageContext({
      pathname,
      search,
      origin: window.location.origin,
      referrer: pageReferrer,
    });
    client.gtag("set", pageContext);
    client.gtag("event", "page_view", {
      send_to: client.analyticsId,
      ...pageContext,
    });
    return pageContext;
  } catch {
    return null;
  }
}

/** Applies the safe context now, or once the consented Google queue is ready. */
export function scheduleGa4PageContext(
  pathname: string,
  search: string,
  pageReferrer: string,
  onApplied: (context: Ga4PageContext) => void,
): () => void {
  if (typeof window === "undefined") return () => {};
  const immediate = setGa4PageContext(pathname, search, pageReferrer);
  if (immediate) {
    onApplied(immediate);
    return () => {};
  }
  let applied = false;
  const ready = () => {
    if (applied) return;
    const context = setGa4PageContext(pathname, search, pageReferrer);
    if (!context) return;
    applied = true;
    window.removeEventListener(MARKETING_TAGS_READY_EVENT, ready);
    onApplied(context);
  };
  window.addEventListener(MARKETING_TAGS_READY_EVENT, ready, { once: true });
  return () => window.removeEventListener(MARKETING_TAGS_READY_EVENT, ready);
}

/**
 * The first render can precede the consented Google queue. Try immediately,
 * then retry exactly once when ConsentBanner announces that the queue is ready.
 */
export function scheduleGa4PageView(
  pathname: string,
  search: string,
  pageReferrer: string,
  onSent: (context: Ga4PageContext) => void,
): () => void {
  if (typeof window === "undefined" || !trackablePath(pathname)) return () => {};
  const immediate = reportGa4PageView(pathname, search, pageReferrer);
  if (immediate) {
    onSent(immediate);
    return () => {};
  }
  let sent = false;
  const ready = () => {
    if (sent) return;
    const context = reportGa4PageView(pathname, search, pageReferrer);
    if (!context) return;
    sent = true;
    window.removeEventListener(MARKETING_TAGS_READY_EVENT, ready);
    onSent(context);
  };
  window.addEventListener(MARKETING_TAGS_READY_EVENT, ready, { once: true });
  return () => window.removeEventListener(MARKETING_TAGS_READY_EVENT, ready);
}

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
 * The signed-in app is excluded from both counters: moving between /home and
 * /chat is product usage, not acquisition traffic. Consent-gated GA4 views
 * follow only public Next navigations, with bearer route segments collapsed.
 */
export function PageView() {
  const pathname = usePathname();
  const lastSent = useRef<string | null>(null);
  const lastGa4ContextKey = useRef<string | null>(null);
  const previousGa4Location = useRef<string | null>(null);

  useEffect(() => {
    if (!pathname) return;

    const ga4Path = trackablePath(pathname);
    const search = window.location.search;
    const contextKey = `${pathname}\n${search}`;
    let cancelGa4 = () => {};
    if (lastGa4ContextKey.current !== contextKey) {
      const pageReferrer = previousGa4Location.current ?? document.referrer;
      const rememberContext = (context: Ga4PageContext) => {
        previousGa4Location.current = context.page_location;
        lastGa4ContextKey.current = contextKey;
      };
      cancelGa4 = ga4Path
        ? scheduleGa4PageView(pathname, search, pageReferrer, rememberContext)
        : scheduleGa4PageContext(pathname, search, pageReferrer, rememberContext);
    }

    const path = trackablePath(pathname);
    if (!path) return cancelGa4;
    // React may run this twice for one navigation; a visit is one row.
    if (lastSent.current === path) return cancelGa4;
    lastSent.current = path;

    const payload: Record<string, string> = { name: "page_view", ...acquisitionContext(path) };
    if (document.referrer) payload.ref = document.referrer.slice(0, 200);
    sendFirstPartyEvent(payload);
    return cancelGa4;
  }, [pathname]);

  useEffect(() => {
    if (!pathname) return;
    const page = trackablePath(pathname);
    if (!page) return;

    const onClick = (event: MouseEvent) => {
      const element = (event.target as HTMLElement | null)?.closest?.("[data-track]");
      if (!element) return;
      const name = element.getAttribute("data-track");
      if (!name) return;
      const where = element.getAttribute("data-where");
      sendFirstPartyEvent({
        name,
        ...acquisitionContext(page),
        ...(where ? { where } : {}),
      });
    };

    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, [pathname]);

  return null;
}
