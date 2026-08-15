import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Where a customer came from.
 *
 * The browser writes one first-touch cookie on the first page it sees; the
 * server reads it when the account is created and freezes the answer on the
 * user. That freeze is the whole point: the payment arrives later, over a
 * Stripe webhook with no browser attached, so the source has to already be
 * on record by then.
 */

export const ATTRIBUTION_COOKIE = "eb_src";

export type Attribution = {
  visitorId: string | null;
  source: string;
  medium: string | null;
  campaign: string | null;
  referrer: string | null;
  landedAt: string | null;
};

// Mirrors db/migrations/0021_attribution.sql so a missing migration degrades
// to a self-healing insert rather than a lost signup.
const SCHEMA = `CREATE TABLE IF NOT EXISTS user_attribution (
  user_id TEXT PRIMARY KEY,
  visitor_id TEXT,
  source TEXT NOT NULL DEFAULT 'direct',
  medium TEXT,
  campaign TEXT,
  referrer TEXT,
  landed_at TEXT,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);
CREATE INDEX IF NOT EXISTS idx_user_attribution_source ON user_attribution(source);
CREATE INDEX IF NOT EXISTS idx_user_attribution_visitor ON user_attribution(visitor_id);`;

/** Cookies are user-controlled: cap every field before it reaches the database. */
function trim(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const clean = value.trim().slice(0, max);
  return clean || null;
}

/** Reads the first-touch cookie the browser wrote on the first page it saw. */
export function parseAttributionCookie(cookieHeader: string | null): Attribution | null {
  const raw = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${ATTRIBUTION_COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  try {
    const decoded = JSON.parse(decodeURIComponent(raw)) as Record<string, unknown>;
    return {
      visitorId: trim(decoded.v, 64),
      source: trim(decoded.s, 60) ?? "direct",
      medium: trim(decoded.m, 60),
      campaign: trim(decoded.c, 80),
      referrer: trim(decoded.r, 200),
      landedAt: trim(decoded.t, 40),
    };
  } catch {
    return null;
  }
}

/**
 * Freezes the source on the user. First write wins — a second registration
 * attempt or a later visit never overwrites how the person actually arrived.
 */
export async function saveAttribution(
  userId: string,
  attribution: Attribution | null,
  client: Client = db()
): Promise<void> {
  const value = attribution ?? {
    visitorId: null,
    source: "direct",
    medium: null,
    campaign: null,
    referrer: null,
    landedAt: null,
  };
  const insert = () =>
    client.execute({
      sql: `INSERT OR IGNORE INTO user_attribution
              (user_id, visitor_id, source, medium, campaign, referrer, landed_at)
            VALUES (?, ?, ?, ?, ?, ?, ?)`,
      args: [userId, value.visitorId, value.source, value.medium, value.campaign, value.referrer, value.landedAt],
    });
  try {
    await insert();
  } catch {
    try {
      await client.executeMultiple(SCHEMA);
      await insert();
    } catch {
      // Knowing where a customer came from is worth a lot; it is not worth
      // failing the registration that created them.
    }
  }
}
