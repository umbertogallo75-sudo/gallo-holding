"use client";

import { useEffect, useRef } from "react";
import { track } from "@/lib/track-client";

/**
 * The two moments on this page the server cannot see: that the prices were
 * looked at, and that somebody came back from Stripe having changed their
 * mind. Both matter — a funnel that records purchases but not the people who
 * saw the price and stopped cannot say whether the price is the problem.
 */
export function PriceTracker({ esito }: { esito?: string }) {
  const sent = useRef(false);
  useEffect(() => {
    // React runs effects twice in development; a beacon that fires twice
    // would quietly double every number on this page.
    if (sent.current) return;
    sent.current = true;
    track("prices_shown");
    if (esito === "annullato") track("checkout_cancelled");
  }, [esito]);
  return null;
}
