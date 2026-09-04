import { createHash, randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

export type FunnelEvent =
  // Any public page loaded: the traffic count. Distinct from landing_view,
  // which means the visitor entered the funnel.
  | "page_view"
  | "landing_view"
  | "landing_cta_register"
  | "landing_cta_login"
  | "landing_cta_aziende"
  // Its twin. The home page offers two paths — individual and company — and
  // only the company one was ever counted, so the split between them was
  // unknowable and the individual path looked like it had no takers.
  | "landing_cta_professionisti"
  | "landing_download"
  | "landing_store_cta"
  | "landing_store_ios"
  | "landing_store_android"
  | "onboarding_started"
  | "onboarding_done"
  | "onboarding_skipped"
  | "plan_shown"
  | "first_session_started"
  | "first_session_done"
  | "home_session_start"
  | "home_shortcut"
  | "home_all_trainings"
  | "home_rail"
  | "voice_invite"
  | "chat_starter"
  | "personalize_shown"
  | "personalize_dismissed"
  | "register_done"
  // The middle of the funnel, which was invisible: whether the free trial
  // ever started, whether the first answer actually came back, and every
  // step between meeting the paywall and paying. Without these, a drop
  // between "registered" and "bought" had no shape at all.
  | "trial_started"
  | "trial_extended"
  | "first_reply_ok"
  | "paywall_shown"
  | "prices_shown"
  | "checkout_started"
  | "checkout_cancelled"
  | "checkout_failed"
  | "purchase_apple"
  | "purchase_google"
  // The web sale is the only one that can be tied back to the click that
  // produced it: a store purchase happens inside Apple's or Google's sheet,
  // out of reach of any campaign parameter. Advertising is measured here.
  | "purchase_stripe";

// Mirrors db/migrations/0010_analytics.sql so events self-heal the schema:
// the first tracked event creates the table if the migration hasn't run yet.
const SCHEMA = `CREATE TABLE IF NOT EXISTS analytics_events (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  visitor_id TEXT,
  user_id TEXT,
  meta TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_analytics_name_time ON analytics_events(name, created_at);`;

/** Record a funnel event. Analytics must never break the product flow. */
export async function trackEvent(
  name: FunnelEvent,
  opts: { visitorId?: string | null; userId?: string | null; meta?: Record<string, unknown> } = {},
  client: Client = db()
) {
  const insert = () =>
    client.execute({
      sql: "INSERT INTO analytics_events (id, name, visitor_id, user_id, meta) VALUES (?, ?, ?, ?, ?)",
      args: [randomUUID(), name, opts.visitorId ?? null, opts.userId ?? null, opts.meta ? JSON.stringify(opts.meta) : null],
    });
  try {
    await insert();
  } catch {
    try {
      await client.executeMultiple(SCHEMA);
      await insert();
    } catch {
      // DB hiccup — losing one event beats losing one signup.
    }
  }
}

/**
 * Record an event exactly once across retries.
 *
 * The caller supplies a provider key (for example a store purchase token), but
 * only its SHA-256 digest is stored. A successful duplicate INSERT is still a
 * success: the durable event already exists. Unlike best-effort trackEvent,
 * this returns false when storage is unavailable so a purchase bridge can keep
 * its delivery queued and retry without either losing or duplicating the sale.
 */
export async function trackEventOnce(
  name: FunnelEvent,
  idempotencyKey: string,
  opts: { visitorId?: string | null; userId?: string | null; meta?: Record<string, unknown> } = {},
  client: Client = db()
): Promise<boolean> {
  const eventId = `once:${createHash("sha256").update(`${name}\0${idempotencyKey}`).digest("hex")}`;
  const insert = () =>
    client.execute({
      sql: "INSERT OR IGNORE INTO analytics_events (id, name, visitor_id, user_id, meta) VALUES (?, ?, ?, ?, ?)",
      args: [eventId, name, opts.visitorId ?? null, opts.userId ?? null, opts.meta ? JSON.stringify(opts.meta) : null],
    });
  try {
    await insert();
    return true;
  } catch {
    try {
      await client.executeMultiple(SCHEMA);
      await insert();
      return true;
    } catch {
      return false;
    }
  }
}
