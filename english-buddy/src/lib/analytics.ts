import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

export type FunnelEvent =
  | "landing_view"
  | "landing_cta_register"
  | "landing_cta_login"
  | "register_done"
  | "onboarding_done";

/** Record a funnel event. Analytics must never break the product flow. */
export async function trackEvent(
  name: FunnelEvent,
  opts: { visitorId?: string | null; userId?: string | null; meta?: Record<string, unknown> } = {},
  client: Client = db()
) {
  try {
    await client.execute({
      sql: "INSERT INTO analytics_events (id, name, visitor_id, user_id, meta) VALUES (?, ?, ?, ?, ?)",
      args: [randomUUID(), name, opts.visitorId ?? null, opts.userId ?? null, opts.meta ? JSON.stringify(opts.meta) : null],
    });
  } catch {
    // Table missing or DB hiccup — losing one event beats losing one signup.
  }
}
