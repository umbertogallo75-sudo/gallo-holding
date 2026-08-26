import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { unsubscribedIds } from "./prefs";
import { dailyKey, isRealAddress, sendMarketing, type Sender } from "./send";
import { broadcast } from "./templates";

/**
 * Owner-sent campaigns from /admin.
 *
 * They go out through exactly the same door as the automatic emails — the
 * whole reason that door exists is that a hand-written campaign is precisely
 * the message most likely to reach somebody who had already asked to be left
 * alone.
 */
export type Segment = "all" | "no_plan" | "paying" | "lapsed" | "trial_done";

export const SEGMENT_LABELS: Record<Segment, string> = {
  all: "Tutti gli iscritti",
  no_plan: "Senza piano attivo",
  paying: "Clienti paganti",
  lapsed: "Inattivi da 7+ giorni",
  trial_done: "Hanno finito la prova gratuita",
};

export type Recipient = { userId: string; email: string; name: string | null };

/** Who is in a segment, opt-outs already removed. */
export async function audienceFor(segment: Segment, client: Client = db(), now: Date = new Date()): Promise<Recipient[]> {
  const [users, billing, lastSessions, trials, optedOut] = await Promise.all([
    client.execute("SELECT id, email, display_name FROM auth_users WHERE email IS NOT NULL AND email != ''"),
    client.execute("SELECT user_id, status FROM billing").catch(() => ({ rows: [] })),
    client.execute("SELECT user_id, MAX(ended_at) AS last_at FROM sessions GROUP BY user_id").catch(() => ({ rows: [] })),
    client.execute("SELECT user_id, ends_at FROM trials").catch(() => ({ rows: [] })),
    unsubscribedIds(client),
  ]);

  const paying = new Set(billing.rows.filter((r) => String(r.status) === "active").map((r) => String(r.user_id)));
  const lastAt = new Map(lastSessions.rows.map((r) => [String(r.user_id), String(r.last_at ?? "")]));
  const trialEnded = new Set(
    trials.rows
      .filter((r) => {
        const raw = String(r.ends_at ?? "");
        const at = Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z");
        return Number.isFinite(at) && at < now.getTime();
      })
      .map((r) => String(r.user_id))
  );
  const weekAgo = now.getTime() - 7 * 86_400_000;

  const out: Recipient[] = [];
  for (const row of users.rows) {
    const userId = String(row.id);
    const email = row.email ? String(row.email) : null;
    if (!isRealAddress(email) || optedOut.has(userId)) continue;

    if (segment === "paying" && !paying.has(userId)) continue;
    if (segment === "no_plan" && paying.has(userId)) continue;
    if (segment === "trial_done" && !trialEnded.has(userId)) continue;
    if (segment === "lapsed") {
      const raw = lastAt.get(userId) ?? "";
      const at = raw ? Date.parse(raw.includes("T") ? raw : raw.replace(" ", "T") + "Z") : NaN;
      // Never practised counts as lapsed: they are exactly who a campaign is
      // for, and excluding them would quietly hide the largest group.
      if (Number.isFinite(at) && (at as number) >= weekAgo) continue;
    }
    out.push({ userId, email: email as string, name: row.display_name ? String(row.display_name) : null });
  }
  return out;
}

/**
 * `campaignId` is what stops a double-click on the send button from writing
 * to everybody twice: it becomes part of every claim key.
 */
export async function sendCampaign(
  opts: {
    segment: Segment;
    campaignId: string;
    subject: string;
    paragraphs: string[];
    cta?: { label: string; url: string };
    limit?: number;
  },
  client: Client = db(),
  send?: Sender
): Promise<{ sent: number; skipped: number; audience: number }> {
  const audience = await audienceFor(opts.segment, client);
  const limit = opts.limit ?? 500;
  let sent = 0;
  let skipped = 0;
  for (const person of audience.slice(0, limit)) {
    const result = await sendMarketing(
      {
        userId: person.userId,
        email: person.email,
        kind: "campaign",
        claimKey: dailyKey(person.userId, "campaign", opts.campaignId),
        message: broadcast(person.userId, person.name, opts.subject, opts.paragraphs, opts.cta),
      },
      client,
      send
    );
    if (result === "sent") sent++;
    else skipped++;
  }
  return { sent, skipped, audience: audience.length };
}
