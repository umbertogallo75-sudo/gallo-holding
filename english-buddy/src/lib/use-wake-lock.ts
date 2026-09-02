"use client";

import { useEffect, useRef } from "react";

/**
 * Keeps the screen awake while something is genuinely running.
 *
 * A spoken conversation is the one thing in this app where nobody touches the
 * screen — that is the point of it — so the phone locks after its usual
 * fifteen or thirty seconds, the page is suspended, and the call dies in the
 * middle of a sentence. The person did nothing wrong and there is nothing on
 * screen to explain it.
 *
 * Three things this deliberately does not do. It never asks: the browser
 * grants or refuses on its own, and a refusal is silent because a phone that
 * declines on low battery is behaving correctly, not failing. It gives the
 * lock back the moment the reason for it ends — an unreleased screen lock is
 * somebody's battery. And it re-takes the lock when the page becomes visible
 * again, because the system revokes it on every hide, so without that a
 * glance at a notification would quietly cost the rest of the conversation.
 */
export function useWakeLock(active: boolean, maxMs?: number): void {
  const heldRef = useRef<WakeLockSentinel | null>(null);

  useEffect(() => {
    if (!active) return;
    let cancelled = false;

    // A ceiling, for the screens that have no natural end. Meeting mode is
    // opened for a meeting and closed when somebody remembers to; left on a
    // desk it would hold the screen awake until the battery ran out, and
    // "your app killed my phone" is a fair complaint that this prevents.
    const ceiling = maxMs
      ? setTimeout(() => {
          cancelled = true;
          const held = heldRef.current;
          heldRef.current = null;
          void held?.release().catch(() => undefined);
        }, maxMs)
      : null;

    async function acquire() {
      if (cancelled || heldRef.current || document.visibilityState !== "visible") return;
      try {
        const sentinel = await navigator.wakeLock?.request("screen");
        if (!sentinel) return;
        if (cancelled) {
          void sentinel.release().catch(() => undefined);
          return;
        }
        heldRef.current = sentinel;
        // The system can take it back on its own — low battery, or the user
        // switching away. Forget it so the next chance re-takes it.
        sentinel.addEventListener("release", () => {
          if (heldRef.current === sentinel) heldRef.current = null;
        });
      } catch {
        // Unsupported, refused, or the tab lost focus mid-request. The
        // conversation still works; the screen just behaves as it always did.
      }
    }

    function onVisibility() {
      if (document.visibilityState === "visible") void acquire();
    }

    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (ceiling) clearTimeout(ceiling);
      document.removeEventListener("visibilitychange", onVisibility);
      const held = heldRef.current;
      heldRef.current = null;
      void held?.release().catch(() => undefined);
    };
  }, [active, maxMs]);
}
