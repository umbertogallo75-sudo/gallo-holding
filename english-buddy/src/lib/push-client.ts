"use client";

/** Browser-side push subscription helpers shared by the banners. */

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export type PushStatus = "unsupported" | "need-install" | "denied" | "need-enable" | "subscribed";

type ApnsBridge = { postMessage: (message: { action: string }) => void };

/** The iOS wrapper's native push bridge (1.1+ builds expose it). */
function apnsBridge(): ApnsBridge | null {
  const w = window as unknown as { webkit?: { messageHandlers?: { push?: ApnsBridge } } };
  return w.webkit?.messageHandlers?.push ?? null;
}

const APNS_DONE_KEY = "apns-registered";

export async function getPushStatus(): Promise<PushStatus> {
  if (typeof window === "undefined") return "unsupported";
  // Native iOS wrapper: notifications go through APNs, not Web Push. Old
  // builds without the bridge keep every banner hidden.
  if (navigator.userAgent.includes("ExecLingoApp")) {
    if (!apnsBridge()) return "unsupported";
    return localStorage.getItem(APNS_DONE_KEY) === "1" ? "subscribed" : "need-enable";
  }
  if (!("serviceWorker" in navigator)) return "unsupported";
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

/** Native path: asks the iOS shell to request APNs permission and waits for
 *  the device token, which is then registered server-side. */
function subscribeViaApns(bridge: ApnsBridge): Promise<"subscribed" | "denied" | "failed"> {
  return new Promise((resolve) => {
    const w = window as unknown as { __apnsToken?: (token: string) => void; __apnsDenied?: (reason?: string) => void };
    const timer = setTimeout(() => { cleanup(); lastPushError = "apns-timeout"; resolve("failed"); }, 30_000);
    const cleanup = () => { clearTimeout(timer); delete w.__apnsToken; delete w.__apnsDenied; };
    w.__apnsToken = async (token: string) => {
      cleanup();
      const response = await fetch("/api/push/apns-register", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, timezone: Intl.DateTimeFormat().resolvedOptions().timeZone }),
      }).catch(() => null);
      if (response?.ok) { localStorage.setItem(APNS_DONE_KEY, "1"); resolve("subscribed"); }
      else { lastPushError = `apns-api:${response?.status ?? "network"}`; resolve("failed"); }
    };
    w.__apnsDenied = (reason?: string) => {
      cleanup();
      lastPushError = `apns:${reason ?? "denied"}`;
      resolve(reason === "denied" ? "denied" : "failed");
    };
    bridge.postMessage({ action: "request" });
  });
}

/** Asks permission, subscribes, and registers the subscription server-side. */
export async function subscribeToPush(): Promise<"subscribed" | "denied" | "failed"> {
  try {
    lastPushError = "";
    const apns = navigator.userAgent.includes("ExecLingoApp") ? apnsBridge() : null;
    if (apns) return await subscribeViaApns(apns);
    // Build-time inlined key, with a runtime fallback for bundles that were
    // built without the NEXT_PUBLIC_ variable.
    let publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
    if (!publicKey) {
      publicKey = await fetch("/api/push/vapid")
        .then((r) => (r.ok ? r.json() : null))
        .then((d) => d?.key ?? undefined)
        .catch(() => undefined);
    }
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
