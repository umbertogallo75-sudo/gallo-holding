"use client";

import { useEffect, useState } from "react";

type PushState = "checking" | "unsupported" | "need-install" | "idle" | "subscribing" | "subscribed" | "denied";

function urlBase64ToUint8Array(base64: string): Uint8Array {
  const padding = "=".repeat((4 - (base64.length % 4)) % 4);
  const normalized = (base64 + padding).replace(/-/g, "+").replace(/_/g, "/");
  const raw = atob(normalized);
  return Uint8Array.from([...raw].map((c) => c.charCodeAt(0)));
}

export function EnablePush() {
  const [state, setState] = useState<PushState>("checking");

  useEffect(() => {
    (async () => {
      if (!("serviceWorker" in navigator)) return setState("unsupported");
      const supportsPush = "PushManager" in window && "Notification" in window;
      if (!supportsPush) {
        // On iOS, Web Push only exists inside an installed (Home Screen) app.
        const standalone = window.matchMedia("(display-mode: standalone)").matches ||
          (navigator as unknown as { standalone?: boolean }).standalone === true;
        return setState(standalone ? "unsupported" : "need-install");
      }
      if (Notification.permission === "denied") return setState("denied");
      const registration = await navigator.serviceWorker.ready;
      const existing = await registration.pushManager.getSubscription();
      setState(existing ? "subscribed" : "idle");
    })().catch(() => setState("unsupported"));
  }, []);

  async function enable() {
    setState("subscribing");
    try {
      const publicKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!publicKey) throw new Error("missing key");
      const permission = await Notification.requestPermission();
      if (permission !== "granted") return setState(permission === "denied" ? "denied" : "idle");

      const registration = await navigator.serviceWorker.ready;
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
      if (!response.ok) throw new Error("subscribe failed");
      setState("subscribed");
    } catch {
      setState("idle");
    }
  }

  if (state === "checking" || state === "unsupported") return null;

  if (state === "subscribed") {
    return <p className="muted" style={{ fontSize: 13, margin: "4px 2px" }}>🔔 Buddy notifications are on.</p>;
  }

  if (state === "need-install") {
    return (
      <section className="card">
        <h2>Hear from your Buddy</h2>
        <p className="muted">To receive Buddy questions during the day, first add this app to your Home Screen: tap Share → Add to Home Screen, then open it from there.</p>
      </section>
    );
  }

  if (state === "denied") {
    return (
      <section className="card">
        <h2>Notifications are blocked</h2>
        <p className="muted">Enable notifications for English Buddy in your device Settings to get Buddy questions during the day.</p>
      </section>
    );
  }

  return (
    <section className="card">
      <h2>Hear from your Buddy</h2>
      <p className="muted">Get short English questions at natural moments of your day — like a friend texting you. Answer when you want; no streaks, no guilt.</p>
      <button className="primary full" style={{ marginTop: 10 }} disabled={state === "subscribing"} onClick={enable}>
        {state === "subscribing" ? "Enabling…" : "Enable notifications"}
      </button>
    </section>
  );
}
