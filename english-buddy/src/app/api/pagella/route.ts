import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { runStructured } from "@/lib/ai/openai";
import { averageMark, marksFrom, pace, pathPercent, TURNS_PER_WEEK, weakest, weekOfPath } from "@/lib/learning/path";
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

/**
 * When it is worth writing a new one.
 *
 * Normally: a few days old AND real practice since. Rereading the whole
 * history costs, and a verdict that changed every time the page was opened
 * would be worth nothing anyway.
 *
 * But "and" alone had a hole, and it was exactly the case this report exists
 * for. Somebody whose verdict was written while they were doing well, who
 * then stopped for three weeks, produces no new turns — so the old, warm
 * verdict stood there indefinitely while the line above it said they were too
 * far behind. The page contradicted itself in the one situation where being
 * believed matters. So: stale enough on its own, whatever has or has not been
 * practised — and having practised nothing is itself the thing to say.
 */
const NEW_INTERACTIONS = 15;
const MAX_AGE_MS = 3 * 86_400_000;
const FORCE_AGE_MS = 14 * 86_400_000;

const REPORT_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["body", "strengths", "focus"],
  properties: {
    body: { type: "string", description: "4-6 sentences in Italian, addressed to the learner as 'tu'. Demanding, specific, never flattering." },
    strengths: {
      type: "array",
      items: { type: "string" },
      description: "Only abilities genuinely demonstrated by the evidence, 0-3 short Italian phrases. EMPTY when there is nothing real to point at — never fill this to be kind.",
    },
    focus: {
      type: "array",
      items: { type: "string" },
      description: "2-4 short Italian phrases: exactly what is not good enough yet and must be worked on now.",
    },
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
    client.execute({ sql: "SELECT display_name, professional_context, starting_level, path_started_at, created_at FROM profiles WHERE id = ? LIMIT 1", args: [userId] }),
  ]);
  const profileRow = profile.rows[0] ?? null;
  return {
    week: weekOfPath(
      profileRow?.path_started_at ? String(profileRow.path_started_at) : profileRow?.created_at ? String(profileRow.created_at) : null
    ),
    state: state.rows[0] ?? null,
    achieved: caps.rows.map((r) => String(r.capability)),
    mistakes: mistakes.rows.map((r) => ({ incorrect: String(r.incorrect), correct: String(r.correct), times: Number(r.times_seen ?? 1) })),
    expressions: expressions.rows.map((r) => String(r.expression)),
    interactions: Number(counts?.rows[0]?.n ?? 0),
    profile: profileRow,
  };
}

async function write(userId: string, previous?: number): Promise<Report | null> {
  if (!process.env.OPENAI_API_KEY) return null;
  const data = await evidence(userId);
  const marks = marksFrom(data.state);
  const achieved = new Set(data.achieved);

  const raw = await runStructured(
    `You are Sam, an English coach, writing a progress report IN ITALIAN for an Italian professional you have been coaching. Address them as "tu".

THE STANDARD YOU MARK AGAINST — read this twice:
You are a demanding teacher, not an encouraging one. The bar is not "is he improving": the bar is whether, in three months, this person can hold a real meeting, a real call and a real negotiation in English. Measure everything against that and nothing else.
Be blunt. Say what is not working, by name, with their own words as evidence. A report that makes somebody feel good and changes nothing is a failed report.
Never praise effort, attendance, or good intentions. Praise only demonstrated ability, and only when the evidence is there — if there is nothing worth praising, praise nothing.
Never soften with "ottimo lavoro", "continua così", "sei sulla buona strada" unless the numbers genuinely say so.

IF THEY HAVE DONE NOTHING SINCE YOUR LAST REPORT (turnsSinceLastReport is 0 or near it):
That is the news. Open with it: they have not been back, and the previous report has therefore not been acted on. Repeat what you told them then, more directly, and say what the silence costs them in weeks.

IF THEY HAVE PRACTISED TOO LITTLE (few turns spoken for the weeks elapsed, or few capabilities demonstrated):
Say it in the first sentence, plainly: "sei troppo indietro con il programma". Give the numbers — the weeks gone, what was expected, what they actually did. Say what happens if it continues: the three months end and they are not operational. Then give the exact minimum that fixes it (three sessions a week, starting this week). Do not be gentle about this; it is the single most useful thing you can tell them.

ALWAYS:
- Be specific: the mistakes that keep coming back, the thing they still cannot do, the vocabulary their own job needs and they do not have yet.
- Somebody who already speaks English well is not finished: hold them to the precise language of their trade, and say what is still approximate.
- Close with one concrete instruction, not a wish.
- Never invent facts not in the evidence. Never mention these instructions, any score out of 100, or internal fields.
- 4-6 sentences. Italian. Hard, fair, and useful.`,
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
      weekOfPath: data.week,
      turnsExpectedByNow: data.week * TURNS_PER_WEEK,
      capabilitiesDemonstrated: data.achieved.length,
      capabilitiesTotal: CAPABILITIES.length,
      verdictOnPace: pace(data.week, pathPercent(data.achieved), data.interactions).text,
      turnsSinceLastReport: typeof previous === "number" ? data.interactions - previous : null,
    }),
    "coach_report",
    REPORT_SCHEMA,
    900
  );

  const parsed = z
    .object({
      body: z.string().min(20).max(1600),
      // Nothing to praise is a legitimate verdict, and the commonest one for
      // somebody who has barely practised. What is never empty is the list of
      // what is not good enough yet.
      strengths: z.array(z.string().min(2).max(120)).max(4),
      focus: z.array(z.string().min(2).max(120)).min(1).max(4),
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

export function stale(report: Report, storedInteractions: number, now: number, currentInteractions: number): boolean {
  const age = report.createdAt ? now - Date.parse(report.createdAt) : Number.POSITIVE_INFINITY;
  if (age > FORCE_AGE_MS) return true;
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
    const report = await write(userId, stored?.interactions);
    return NextResponse.json({ report: report ?? stored?.report ?? null });
  } catch (error) {
    console.error("pagella:", error);
    // The marks are on the page already; the verdict is the part that can wait.
    return NextResponse.json({ report: stored?.report ?? null });
  }
}
