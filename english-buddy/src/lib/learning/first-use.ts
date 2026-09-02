import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Whether this person has never had a real session.
 *
 * Asked on the server, by counting, rather than trusting the `prima=1` the
 * plan hand-off puts in the URL: that parameter is a hint for the interface,
 * and anything a browser can type is not a fact the paywall can rest on.
 *
 * The free level check does not count. It is offered to strangers on the
 * landing page, so treating it as "your first session" would spend the one
 * free session on somebody who has not even registered a goal yet.
 */
export async function isFirstSession(userId: string, client: Client = db()): Promise<boolean> {
  try {
    const result = await client.execute({
      sql: "SELECT COUNT(*) AS n FROM sessions WHERE user_id = ? AND (mode IS NULL OR mode != 'levelcheck')",
      args: [userId],
    });
    return Number(result.rows[0]?.n ?? 0) === 0;
  } catch {
    // Unreadable history must not hand out free access forever.
    return false;
  }
}
