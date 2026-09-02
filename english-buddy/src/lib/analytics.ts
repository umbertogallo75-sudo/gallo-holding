import { randomUUID } from "node:crypto";
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
