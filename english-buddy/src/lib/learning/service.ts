import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { skillNames, type CoachMistake, type SkillName } from "@/lib/ai/types";
import { isMastered, nextIntervalDays, nextReviewAt } from "./spaced-repetition";

/**
 * Structured learning memory. All persistence for the adaptive engine lives
 * here so API routes and (later) notification/voice code share one layer.
 * Every function takes an optional client so tests can run on a local file DB.
 */

export type LearningContext = {
  profile: {
    displayName: string;
    nativeLanguage: string;
    professionalContext: string | null;
  } | null;
  level?: string;
  goal?: string;
  recentMistakes: { incorrect: string; correct: string; category: string }[];
  dueMistakes: { incorrect: string; correct: string }[];
  dueExpressions: { expression: string; meaning: string | null }[];
  recentMessages: { role: string; content: string }[];
  todayMinutes: number;
  todayInteractions: number;
};

const now = () => new Date().toISOString();
const today = () => new Date().toISOString().slice(0, 10);

export async function getRelevantLearningContext(
  userId: string,
  sessionId: string,
  client: Client = db()
): Promise<LearningContext> {
  const timestamp = now();
  const [profileResult, stateResult, mistakesResult, dueMistakesResult, dueExpressionsResult, messagesResult, metricsResult] =
    await Promise.all([
      client.execute({ sql: "SELECT display_name, native_language, professional_context FROM profiles WHERE id = ? LIMIT 1", args: [userId] }),
      client.execute({ sql: "SELECT cefr_level, primary_goal FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }),
      client.execute({ sql: "SELECT incorrect, correct, category FROM mistakes WHERE user_id = ? AND mastered = 0 ORDER BY last_seen_at DESC LIMIT 8", args: [userId] }),
      client.execute({ sql: "SELECT incorrect, correct FROM mistakes WHERE user_id = ? AND mastered = 0 AND next_review_at IS NOT NULL AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 4", args: [userId, timestamp] }),
      client.execute({ sql: "SELECT expression, meaning FROM expressions WHERE user_id = ? AND mastered = 0 AND next_review_at <= ? ORDER BY next_review_at ASC LIMIT 6", args: [userId, timestamp] }),
      client.execute({ sql: "SELECT role, content FROM messages WHERE user_id = ? AND session_id = ? ORDER BY created_at DESC LIMIT 12", args: [userId, sessionId] }),
      client.execute({ sql: "SELECT minutes_practiced, interactions FROM daily_metrics WHERE user_id = ? AND day = ? LIMIT 1", args: [userId, today()] }),
    ]);

  const profile = profileResult.rows[0];
  const state = stateResult.rows[0];
  const metrics = metricsResult.rows[0];

  return {
    profile: profile
      ? {
          displayName: String(profile.display_name ?? "Friend"),
          nativeLanguage: String(profile.native_language ?? "Italian"),
          professionalContext: profile.professional_context ? String(profile.professional_context) : null,
        }
      : null,
    level: state?.cefr_level ? String(state.cefr_level) : undefined,
    goal: state?.primary_goal ? String(state.primary_goal) : undefined,
    recentMistakes: mistakesResult.rows.map((r) => ({ incorrect: String(r.incorrect), correct: String(r.correct), category: String(r.category) })),
    dueMistakes: dueMistakesResult.rows.map((r) => ({ incorrect: String(r.incorrect), correct: String(r.correct) })),
    dueExpressions: dueExpressionsResult.rows.map((r) => ({ expression: String(r.expression), meaning: r.meaning ? String(r.meaning) : null })),
    recentMessages: [...messagesResult.rows].reverse().map((r) => ({ role: String(r.role), content: String(r.content) })),
    todayMinutes: Number(metrics?.minutes_practiced ?? 0),
    todayInteractions: Number(metrics?.interactions ?? 0),
  };
}

export async function startSession(userId: string, mode: string, client: Client = db()): Promise<string> {
  const sessionId = randomUUID();
  await client.execute({
    sql: "INSERT INTO sessions (id, user_id, mode, started_at) VALUES (?, ?, ?, ?)",
    args: [sessionId, userId, mode, now()],
  });
  return sessionId;
}

/** Each coach turn bumps ended_at so session duration is derivable without a client-side beacon. */
export async function touchSession(userId: string, sessionId: string, client: Client = db()) {
  await client.execute({
    sql: "UPDATE sessions SET ended_at = ? WHERE id = ? AND user_id = ?",
    args: [now(), sessionId, userId],
  });
}

export async function saveMessage(
  userId: string,
  sessionId: string,
  role: "user" | "assistant",
  content: string,
  correction: string | null = null,
  client: Client = db()
) {
  await client.execute({
    sql: "INSERT INTO messages (id, user_id, session_id, role, content, correction, created_at) VALUES (?, ?, ?, ?, ?, ?, ?)",
    args: [randomUUID(), userId, sessionId, role, content, correction, now()],
  });
}

/** Inserts a new mistake or increments the occurrence count of a recurring one. */
export async function saveMistake(userId: string, mistake: CoachMistake, client: Client = db()) {
  const timestamp = now();
  const existing = await client.execute({
    sql: "SELECT id, times_seen FROM mistakes WHERE user_id = ? AND incorrect = ? AND correct = ? LIMIT 1",
    args: [userId, mistake.incorrect, mistake.correct],
  });
  if (existing.rows.length) {
    const row = existing.rows[0];
    // A repeated mistake is clearly not mastered: reopen it and pull the review forward.
    await client.execute({
      sql: "UPDATE mistakes SET times_seen = ?, last_seen_at = ?, severity = ?, mastered = 0, interval_days = 1.0, next_review_at = ? WHERE id = ?",
      args: [Number(row.times_seen ?? 1) + 1, timestamp, mistake.severity, nextReviewAt(1), String(row.id)],
    });
  } else {
    await client.execute({
      sql: `INSERT INTO mistakes (id, user_id, incorrect, correct, category, note, severity, times_seen, first_seen_at, last_seen_at, next_review_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?)`,
      args: [randomUUID(), userId, mistake.incorrect, mistake.correct, mistake.category, mistake.note || null, mistake.severity, timestamp, timestamp, nextReviewAt(1)],
    });
  }
}

export async function saveExpression(userId: string, expression: string, meaning: string | null, client: Client = db()) {
  await client.execute({
    sql: `INSERT INTO expressions (id, user_id, expression, meaning, next_review_at, created_at)
          VALUES (?, ?, ?, ?, ?, ?)
          ON CONFLICT(user_id, expression) DO NOTHING`,
    args: [randomUUID(), userId, expression, meaning, nextReviewAt(1), now()],
  });
}

/**
 * Records the outcome of a naturally-occurring review. The item is matched by
 * text against due expressions and mistakes; scheduling follows the shared
 * spaced-repetition curve and mastery closes the loop.
 */
export async function recordReviewResult(userId: string, itemText: string, success: boolean, client: Client = db()): Promise<boolean> {
  const timestamp = now();

  const expression = await client.execute({
    sql: "SELECT id, interval_days, review_count, success_count FROM expressions WHERE user_id = ? AND expression = ? LIMIT 1",
    args: [userId, itemText],
  });
  if (expression.rows.length) {
    const row = expression.rows[0];
    const interval = nextIntervalDays(Number(row.interval_days ?? 1), success);
    const successCount = Number(row.success_count ?? 0) + (success ? 1 : 0);
    await client.execute({
      sql: "UPDATE expressions SET interval_days = ?, next_review_at = ?, last_reviewed_at = ?, review_count = ?, success_count = ?, mastered = ? WHERE id = ?",
      args: [interval, nextReviewAt(interval), timestamp, Number(row.review_count ?? 0) + 1, successCount, isMastered(successCount, interval) ? 1 : 0, String(row.id)],
    });
    return true;
  }

  const mistake = await client.execute({
    sql: "SELECT id, interval_days, review_count, success_count FROM mistakes WHERE user_id = ? AND (incorrect = ? OR correct = ?) LIMIT 1",
    args: [userId, itemText, itemText],
  });
  if (mistake.rows.length) {
    const row = mistake.rows[0];
    const interval = nextIntervalDays(Number(row.interval_days ?? 1), success);
    const successCount = Number(row.success_count ?? 0) + (success ? 1 : 0);
    await client.execute({
      sql: "UPDATE mistakes SET interval_days = ?, next_review_at = ?, review_count = ?, success_count = ?, mastered = ? WHERE id = ?",
      args: [interval, nextReviewAt(interval), Number(row.review_count ?? 0) + 1, successCount, isMastered(successCount, interval) ? 1 : 0, String(row.id)],
    });
    return true;
  }

  return false;
}

/** Applies small bounded skill deltas (only for skills with evidence this turn). */
export async function updateSkillEstimate(userId: string, deltas: Record<string, number>, client: Client = db()) {
  const state = await client.execute({ sql: "SELECT * FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] });
  if (!state.rows.length) return;
  const row = state.rows[0];

  const updates: string[] = [];
  const args: (string | number)[] = [];
  for (const skill of skillNames) {
    const delta = deltas[skill];
    if (typeof delta !== "number" || delta === 0) continue;
    const bounded = Math.max(-2, Math.min(2, delta));
    updates.push(`${skill} = ?`);
    args.push(Math.max(0, Math.min(100, Number(row[skill] ?? 50) + bounded)));
  }
  if (!updates.length) return;
  updates.push("updated_at = ?");
  args.push(now(), userId);
  await client.execute({ sql: `UPDATE learning_state SET ${updates.join(", ")} WHERE user_id = ?`, args });
}

export async function recordDailyMetric(
  userId: string,
  metric: { minutes?: number; interactions?: number; expressionsReviewed?: number },
  client: Client = db()
) {
  await client.execute({
    sql: `INSERT INTO daily_metrics (user_id, day, minutes_practiced, interactions, expressions_reviewed)
          VALUES (?, ?, ?, ?, ?)
          ON CONFLICT(user_id, day) DO UPDATE SET
            minutes_practiced = minutes_practiced + excluded.minutes_practiced,
            interactions = interactions + excluded.interactions,
            expressions_reviewed = expressions_reviewed + excluded.expressions_reviewed`,
    args: [userId, today(), metric.minutes ?? 0, metric.interactions ?? 0, metric.expressionsReviewed ?? 0],
  });
}

export type { SkillName };
