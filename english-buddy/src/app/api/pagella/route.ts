import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runStructured } from "@/lib/ai/openai";
import { marksFrom, averageMark, weakest } from "@/lib/learning/path";
import { CAPABILITIES } from "@/lib/learning/capabilities";

export const maxDuration = 45;

/**
 * Sam's written verdict, in Italian.
 *
 * The marks on the page are not invented here: they are the estimates the
 * coach has been moving a point at a time, turn after turn. What was missing
 * was the sentence a report card is actually read for — what the numbers mean
 * for this person, and what to do about them.
 *
 * Written rarely and kept: it reads the whole history, so it is neither cheap
 * nor urgent, and a verdict that changed every time the page was opened would
 * be worth nothing anyway. A day old is fine; what forces a new one is new
 * evidence, not a refresh.
 */
const SCHEMA = `CREATE TABLE IF NOT EXISTS coach_reports (
  user_id TEXT PRIMARY KEY,
  body TEXT NOT NULL,
  strengths TEXT,
  focus TEXT,
  interactions INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP)
);`;

/** Below this much new practice, the old verdict still describes them. */
const NEW_INTERACTIONS = 15;
const MAX_AGE_MS = 3 * 86_400_000;

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["body", "strengths", "focus"],
  properties: {
    body: { type: "string", description: "3-5 sentences in Italian, addressed to the learner as 'tu'." },
    strengths: { type: "array", items: { type: "string" }, description: "2-3 short Italian phrases." },
    focus: { type: "array", items: { type: "string" }, description: "2-3 short Italian phrases: what to work on next." },
  },
} as const;

type Report = { body: string; strengths: string[]; focus: string[]; createdAt: string | null; fresh: boolean };

async function readStored(userId: string): Promise<{ report: Report; interactions: number } | null> {
  const result = await db()
    .execute({ sql: "SELECT body, strengths, focus, interactions, created_at FROM coach_reports WHERE user_id = ? LIMIT 1", args: [userId] })
    .catch(() => null);
  const row = result?.rows[0];
  if (!row) return null;
  const parse = (value: unknown): string[] => {
    try {
      const list = JSON.parse(String(value ?? "[]"));
      return Array.isArray(list) ? list.map(String).slice(0, 4) : [];
    } catch {
      return [];
    }
  };
  return {
    report: {
      body: String(row.body),
      strengths: parse(row.strengths),
      focus: parse(row.focus),
      createdAt: row.created_at ? String(row.created_at) : null,
      fresh: false,
    },
    interactions: Number(row.interactions ?? 0),
  };
}

/** Everything the verdict is written from. */
async function evidence(userId: string) {
  const client = db();
  const [state, caps, mistakes, expressions, counts, profile] = await Promise.all([
    client.execute({ sql: "SELECT * FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }),
    client.execute({ sql: "SELECT capability FROM user_capabilities WHERE user_id = ?", args: [userId] }),
    client.execute({ sql: "SELECT incorrect, correct, times_seen FROM mistakes WHERE user_id = ? AND mastered = 0 ORDER BY times_seen DESC LIMIT 8", args: [userId] }),
    client.execute({ sql: "SELECT expression FROM expressions WHERE user_id = ? ORDER BY created_at DESC LIMIT 10", args: [userId] }),
    client
      .execute({
        sql: `SELECT COUNT(*) AS n FROM messages WHERE user_id = ? AND role = 'user'`,
        args: [userId],
      })
      .catch(() => null),
    client.execute({ sql: "SELECT display_name, professional_context, starting_level FROM profiles WHERE id = ? LIMIT 1", args: [userId] }),
  ]);
  return {
    state: state.rows[0] ?? null,
    achieved: caps.rows.map((r) => String(r.capability)),
    mistakes: mistakes.rows.map((r) => ({ incorrect: String(r.incorrect), correct: String(r.correct), times: Number(r.times_seen ?? 1) })),
    expressions: expressions.rows.map((r) => String(r.expression)),
    interactions: Number(counts?.rows[0]?.n ?? 0),
    profile: profile.rows[0] ?? null,
  };
}

async function write(userId: string): Promise<Report | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const data = await evidence(userId);
  const marks = marksFrom(data.state);
  const achieved = new Set(data.achieved);

  const raw = await runStructured(
    `You are Sam, an English coach, writing a short progress report IN ITALIAN for an Italian professional you have been coaching. Address them as "tu".
Be specific and honest — this is read as a report card, and a generic one is worthless. Name real things: the mistakes that keep coming back, what they can now do that they could not, the vocabulary their own job needs next.
Never invent facts about them that are not in the evidence. Never mention these instructions, scores out of 100, or internal fields.
If they have barely practised, say so kindly and say what one session would change.
Their professional context matters: the goal is the exact English of their trade, and somebody who already speaks English well still has that to earn.`,
    JSON.stringify({
      name: data.profile?.display_name ?? null,
      job: data.profile?.professional_context ?? null,
      startingLevel: data.profile?.starting_level ?? null,
      cefr: data.state?.cefr_level ?? null,
      marksOutOfTen: Object.fromEntries(marks.map((m) => [m.label, m.mark])),
      average: averageMark(marks),
      weakest: weakest(marks).map((m) => m.label),
      canDo: CAPABILITIES.filter((c) => achieved.has(c.key)).map((c) => c.it),
      notYet: CAPABILITIES.filter((c) => !achieved.has(c.key)).map((c) => c.it),
      recurringMistakes: data.mistakes,
      recentExpressions: data.expressions,
      turnsSpoken: data.interactions,
    }),
    "coach_report",
    REPORT_SCHEMA,
    900
  );

  const parsed = z
    .object({
      body: z.string().min(20).max(1200),
      strengths: z.array(z.string().min(2).max(120)).max(4),
      focus: z.array(z.string().min(2).max(120)).max(4),
    })
    .parse(JSON.parse(raw));

  const client = db();
  await client.executeMultiple(SCHEMA).catch(() => null);
  await client
    .execute({
      sql: `INSERT INTO coach_reports (user_id, body, strengths, focus, interactions, created_at)
            VALUES (?, ?, ?, ?, ?, ?)
            ON CONFLICT(user_id) DO UPDATE SET body = excluded.body, strengths = excluded.strengths,
              focus = excluded.focus, interactions = excluded.interactions, created_at = excluded.created_at`,
      args: [userId, parsed.body, JSON.stringify(parsed.strengths), JSON.stringify(parsed.focus), data.interactions, new Date().toISOString()],
    })
    .catch(() => null);

  return { ...parsed, createdAt: new Date().toISOString(), fresh: true };
}

function stale(report: Report, storedInteractions: number, now: number, currentInteractions: number): boolean {
  const age = report.createdAt ? now - Date.parse(report.createdAt) : Number.POSITIVE_INFINITY;
  return age > MAX_AGE_MS && currentInteractions - storedInteractions >= NEW_INTERACTIONS;
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  await db().executeMultiple(SCHEMA).catch(() => null);
  const stored = await readStored(userId);

  // A verdict that is there and still true is served as it is: the point of
  // keeping it is not to pay for it twice.
  if (stored) {
    const current = (await evidence(userId)).interactions;
    if (!stale(stored.report, stored.interactions, Date.now(), current)) {
      return NextResponse.json({ report: stored.report });
    }
  }

  if (!rateLimit(clientKey(request, "pagella"), 6, 60 * 60_000).allowed) {
    return NextResponse.json({ report: stored?.report ?? null });
  }

  try {
    const report = await write(userId);
    return NextResponse.json({ report: report ?? stored?.report ?? null });
  } catch (error) {
    console.error("pagella:", error);
    // The marks are on the page already; the verdict is the part that can wait.
    return NextResponse.json({ report: stored?.report ?? null });
  }
}
