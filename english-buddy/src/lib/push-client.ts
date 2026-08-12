"use client";

/** Browser-side push subscription helpers shared by the banners. */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "need-install" | "denied" | "need-enable" | "subscribed";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined" || !("serviceWorker" in navigator)) return "unsupported";
  // Native store-app wrappers: no Web Push in their webviews — hide every
  // notification banner there (native push is a post-launch feature).
  if (navigator.userAgent.includes("ExecLingoApp")) return "unsupported";
  const supportsPush = "PushManager" in window && "Notification" in window;
  if (!supportsPush) {
    // On iOS, Web Push only exists inside an installed (Home Screen) app.
    const standalone = window.matchMedia("(display-mode: standalone)").matches ||
      (navigator as unknown as { standalone?: boolean }).standalone === true;
    return standalone ? "unsupported" : "need-install";
  }
  if (Notification.permission === "denied") return "denied";
  const registration = await navigator.serviceWorker.ready;
  const existing = await registration.pushManager.getSubscription();
  return existing ? "subscribed" : "need-enable";
}

/**
 * Why the last subscribeToPush attempt failed, for support/debug display.
 * Values: "no-vapid", "permission:default", "sw-timeout", "<Error name+message>".
 */
export let lastPushError = "";

/** Asks permission, subscribes, and registers the subscription server-side. */
export async function subscribeToPush(): Promise<"subscribed" | "denied" | "failed"> {
  try {
    lastPushError = "";
    const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) { lastPushError = "no-vapid"; return "failed"; }
    const permission = await Notification.requestPermission();
    if (permission !== "granted") {
      lastPushError = `permission:${permission}`;
      return permission === "denied" ? "denied" : "failed";
    }

    // `serviceWorker.ready` never settles when no SW got registered — cap it
    // so the button can't hang forever.
    const registration = await Promise.race([
      navigator.serviceWorker.ready,
      new Promise<never>((_, reject) => setTimeout(() => reject(new Error("sw-timeout")), 10_000)),
    ]);
    const subscription = await registration.pushManager.subscribe({
      userVisibleOnly: true,
      applicationServerKey: urlBase64ToUint8Array(publicKey) as BufferSource,
    });
    const response = await fetch("/api/push/subscribe", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        subscription: subscription.toJSON(),
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
      }),
    });
    if (!response.ok) { lastPushError = `subscribe-api:${response.status}`; return "failed"; }
    return "subscribed";
  } catch (error) {
    lastPushError = error instanceof Error ? `${error.name}: ${error.message}` : String(error);
    return "failed";
  }
}
