"use client";

import { useEffect, useRef } from "react";
import { makeWakeVideo, wakeStrategy } from "./wake-video";

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
 *
 * And one thing it now does. The API above does not exist inside iOS
 * WKWebView, which is precisely what the ExecLingo iPhone app is — so on the
 * device where a spoken conversation matters most, all of the care above
 * amounted to nothing and the screen locked anyway. Where there is no API,
 * a silent invisible video plays instead, which is the one thing iOS accepts
 * as a reason to stay awake.
 */
export function useWakeLock(active: boolean, maxMs?: number): void {
  const heldRef = useRef<WakeLockSentinel | null>(null);
  const videoRef = useRef<HTMLVideoElement | null>(null);

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
          stopVideo();
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

    /** The fallback: a video that is playing is a reason for iOS to stay lit. */
    function playVideo() {
      if (cancelled) return;
      try {
        if (!videoRef.current) {
          videoRef.current = makeWakeVideo();
          document.body.appendChild(videoRef.current);
        }
        void videoRef.current.play().catch(() => undefined);
      } catch {
        // No video either. The call still works; the screen behaves as before.
      }
    }

    function stopVideo() {
      const video = videoRef.current;
      videoRef.current = null;
      if (!video) return;
      try {
        video.pause();
        video.removeAttribute("src");
        video.load();
        video.remove();
      } catch {
        /* already gone */
      }
    }

    function onVisibility() {
      if (document.visibilityState !== "visible") return;
      void acquire();
      // iOS pauses the video when the app goes to the background and does not
      // resume it on its own, so a glance at a notification would otherwise
      // cost the rest of the conversation — the same trap as the API path.
      if (videoRef.current) playVideo();
    }

    if (wakeStrategy(Boolean(navigator.wakeLock)) === "video") playVideo();
    void acquire();
    document.addEventListener("visibilitychange", onVisibility);
    return () => {
      cancelled = true;
      if (ceiling) clearTimeout(ceiling);
      document.removeEventListener("visibilitychange", onVisibility);
      stopVideo();
      const held = heldRef.current;
      heldRef.current = null;
      void held?.release().catch(() => undefined);
    };
  }, [active, maxMs]);
}
