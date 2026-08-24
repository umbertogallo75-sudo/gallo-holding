/**
 * Sending an event from inside the app.
 *
 * Deliberately the same endpoint the landing pages use: one table, one place
 * to read, and a funnel that runs from an advertisement all the way to a
 * session without being stitched together from two systems.
 */
export function track(name: string, extra: Record<string, string> = {}) {
  try {
    const body = JSON.stringify({ name, ...extra });
    const sent = navigator.sendBeacon?.("/api/track", new Blob([body], { type: "application/json" }));
    if (!sent) void fetch("/api/track", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true });
  } catch {
    // Measuring the product must never cost the person using it anything.
  }
}
