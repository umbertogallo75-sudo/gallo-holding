"use client";

import { useSyncExternalStore } from "react";
import { inStoreApp } from "@/lib/shell";

/**
 * Social sign-in buttons; render only the providers that are configured.
 *
 * The pages already leave these out when the request arrives from a store app
 * — Google refuses OAuth inside an embedded webview and Apple's web flow is
 * clunky there. The check is repeated here on the browser side because the
 * server only sees the shell on a fresh request: a page kept alive across an
 * app update would otherwise still be showing buttons that cannot work.
 */
export function OAuthButtons({ google, apple }: { google: boolean; apple: boolean }) {
  const embedded = useSyncExternalStore(() => () => {}, inStoreApp, () => false);
  if (embedded) return null;
  if (!google && !apple) return null;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8, margin: "4px 0 14px" }}>
      {apple ? (
        <a href="/api/auth/apple" className="oauthBtn oauthApple">
          <svg width="16" height="19" viewBox="0 0 814 1000" aria-hidden="true"><path fill="currentColor" d="M788.1 340.9c-5.8 4.5-108.2 62.2-108.2 190.5 0 148.4 130.3 200.9 134.2 202.2-.6 3.2-20.7 71.9-68.7 141.9-42.8 61.6-87.5 123.1-155.5 123.1s-85.5-39.5-164-39.5c-76.5 0-103.7 40.8-165.9 40.8s-105.6-57-155.5-127C46.7 790.7 0 663 0 541.8c0-194.4 126.4-297.5 250.8-297.5 66.1 0 121.2 43.4 162.7 43.4 39.5 0 101.1-46 176.3-46 28.5 0 130.9 2.6 198.3 99.2zm-234-181.5c31.1-36.9 53.1-88.1 53.1-139.3 0-7.1-.6-14.3-1.9-20.1-50.6 1.9-110.8 33.7-147.1 75.8-28.5 32.4-55.1 83.6-55.1 135.5 0 7.8 1.3 15.6 1.9 18.1 3.2.6 8.4 1.3 13.6 1.3 45.4 0 102.5-30.4 135.5-71.3z"/></svg>
          Continua con Apple
        </a>
      ) : null}
      {google ? (
        <a href="/api/auth/google" className="oauthBtn oauthGoogle">
          <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#EA4335" d="M24 9.5c3.5 0 6.6 1.2 9.1 3.6l6.8-6.8C35.8 2.4 30.3 0 24 0 14.6 0 6.5 5.4 2.6 13.2l7.9 6.2C12.4 13.4 17.7 9.5 24 9.5z"/><path fill="#4285F4" d="M46.5 24.5c0-1.6-.1-3.1-.4-4.5H24v9h12.7c-.6 3-2.3 5.5-4.8 7.2l7.7 6c4.5-4.2 6.9-10.3 6.9-17.7z"/><path fill="#FBBC05" d="M10.5 28.6c-.5-1.5-.8-3-.8-4.6s.3-3.1.8-4.6l-7.9-6.2C.9 16.5 0 20.1 0 24s.9 7.5 2.6 10.8l7.9-6.2z"/><path fill="#34A853" d="M24 48c6.3 0 11.6-2.1 15.5-5.7l-7.7-6c-2.1 1.4-4.8 2.3-7.8 2.3-6.3 0-11.6-3.9-13.5-9.9l-7.9 6.2C6.5 42.6 14.6 48 24 48z"/></svg>
          Continua con Google
        </a>
      ) : null}
      <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 4 }}>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
        <span className="muted" style={{ fontSize: 12 }}>or · oppure</span>
        <span style={{ flex: 1, height: 1, background: "var(--line)" }} />
      </div>
    </div>
  );
}
