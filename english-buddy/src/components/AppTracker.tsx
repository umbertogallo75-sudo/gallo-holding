"use client";

import { useEffect } from "react";
import { track } from "@/lib/track-client";

/**
 * Records taps on anything carrying data-track, inside the signed-in app.
 *
 * The same delegation the landing pages use, so a button only has to declare
 * what it is rather than wire up a handler — and so nobody adds a card to the
 * home screen and forgets to measure whether it gets used.
 */
export function AppTracker() {
  useEffect(() => {
    const onClick = (event: MouseEvent) => {
      const el = (event.target as HTMLElement | null)?.closest?.("[data-track]");
      const name = el?.getAttribute("data-track");
      if (!name) return;
      const where = el?.getAttribute("data-where");
      track(name, where ? { where } : {});
    };
    document.addEventListener("click", onClick);
    return () => document.removeEventListener("click", onClick);
  }, []);
  return null;
}
