"use client";

import { useEffect } from "react";
import { ensureAttribution } from "@/lib/attribution-client";

/**
 * Records where the visitor came from, on whatever page they happen to land
 * on first.
 *
 * It lives in the root layout rather than on the landing page because paid
 * traffic rarely arrives at the home page: an ad about pricing points at
 * /abbonamento, a partner link at /register. Capturing only on the landing
 * page would lose exactly the campaigns being paid for. Renders nothing.
 */
export function SourceCapture() {
  useEffect(() => {
    ensureAttribution();
  }, []);
  return null;
}
