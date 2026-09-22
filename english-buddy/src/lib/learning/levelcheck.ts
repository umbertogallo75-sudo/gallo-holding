import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { skillNames } from "@/lib/ai/types";

/**
 * The entry test, counted in code.
 *
 * It used to be ten questions because the prompt said "ask about ten
 * questions", and a model asked to count its own turns does not count them:
 * testers reported a test that never ended, drifted into an ordinary chat,
 * and produced no verdict at all. Nothing that must happen reliably —
 * counting, ending, producing a result — belongs in an instruction. So the
 * turns are counted here, the order to deliver the verdict is issued here on
 * the tenth answer, and the verdict that comes back is stored here.
 *
 * Stored, because a level is worth something only if you can compare it with
 * the next one. The test reopens after a month: sooner than that there is
 * nothing new to measure and a second verdict would only contradict the
 * first, which is how somebody stops believing either.
 */

export const LEVELCHECK_QUESTIONS = 10;
export const LEVELCHECK_LOCK_DAYS = 30;

const SCHEMA = `CREATE TABLE IF NOT EXISTS level_checks (
  session_id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  taken_at TEXT NOT NULL,
  level TEXT NOT NULL,
  score INTEGER NOT NULL,
  verdict TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_level_checks_user ON level_checks(user_id, taken_at DESC);`;

async function withSchema<T>(client: Client, run: () => Promise<T>, fallback: T): Promise<T> {
  try {
    return await run();
  } catch {
    try {
      await client.executeMultiple(SCHEMA);
      return await run();
    } catch {
      // A level check is worth less than the conversation it lives in: if the
      // table cannot be had, the test still runs and still gives its verdict.
      return fallback;
    }
  }
}

/**
 * How many answers the learner has given in this test, the one just received
 * included.
 *
 * The line that opens a session is an instruction to the coach and is never
 * stored as the learner's, so this counts real answers only.
 */
export async function answersSoFar(sessionId: string, client: Client = db()): Promise<number> {
  const result = await client.execute({
    sql: "SELECT COUNT(*) AS n FROM messages WHERE session_id = ? AND role = 'user'",
    args: [sessionId],
  });
  return Number(result.rows[0]?.n ?? 0);
}

/** True when the answer just given was the last one, so this reply is the verdict. */
export function isVerdictTurn(answers: number): boolean {
  return answers >= LEVELCHECK_QUESTIONS;
}

/**
 * The order the code gives the coach on this turn — where it is in the test,
 * and, at the end, that the test is over and the verdict is due now.
 */
export function levelcheckOrder(answers: number): string {
  if (isVerdictTurn(answers)) {
    return `\n\nTHE TEST IS OVER. That was answer ${LEVELCHECK_QUESTIONS} of ${LEVELCHECK_QUESTIONS} and you have everything you need.
Do NOT ask another question. Do NOT say you will continue. This reply is the verdict and nothing else, in their language, in the four parts described above: what they can already do with an example of theirs, what is holding them back most with an example of theirs, their honest level in plain words, and what month 1 will work on plus the promise.
Write it in full — this is the first real thing they get from this app — and end there.`;
  }
  const next = answers + 1;
  return `\n\nWHERE YOU ARE: they have answered ${answers} of ${LEVELCHECK_QUESTIONS}. Now ask question ${next} of ${LEVELCHECK_QUESTIONS}, one question and nothing else.
Do NOT give a verdict, a level, a summary or any assessment yet: you will be told when the test is over. Do NOT mention numbers or say which question this is — they must not feel examined.`;
}

export type LevelCheck = {
  sessionId: string;
  takenAt: string;
  level: string;
  score: number;
  verdict: string;
  /** When the test can be taken again. */
  unlockAt: string;
  locked: boolean;
  daysLeft: number;
};

function shape(row: Record<string, unknown>, at = Date.now()): LevelCheck {
  const takenAt = String(row.taken_at);
  const unlock = new Date(takenAt).getTime() + LEVELCHECK_LOCK_DAYS * 86_400_000;
  const left = Math.ceil((unlock - at) / 86_400_000);
  return {
    sessionId: String(row.session_id),
    takenAt,
    level: String(row.level ?? "A2"),
    score: Number(row.score ?? 0),
    verdict: String(row.verdict ?? ""),
    unlockAt: new Date(unlock).toISOString(),
    locked: left > 0,
    daysLeft: Math.max(0, left),
  };
}

/** The most recent verdict, or null if this person has never finished a test. */
export async function lastLevelcheck(userId: string, client: Client = db()): Promise<LevelCheck | null> {
  return withSchema(
    client,
    async () => {
      const result = await client.execute({
        sql: "SELECT * FROM level_checks WHERE user_id = ? ORDER BY taken_at DESC LIMIT 1",
        args: [userId],
      });
      const row = result.rows[0];
      return row ? shape(row as Record<string, unknown>) : null;
    },
    null
  );
}

/**
 * Writes down the verdict, with the level and the score it was given at.
 *
 * Both are read from the learning state rather than from the model: the
 * skills were just updated from this very conversation, and a number the
 * coach volunteers in prose is not a number you can compare in three months.
 */
export async function saveLevelcheck(
  userId: string,
  sessionId: string,
  verdict: string,
  client: Client = db()
): Promise<void> {
  const state = await client
    .execute({ sql: "SELECT * FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] })
    .catch(() => ({ rows: [] as Record<string, unknown>[] }));
  const row = (state.rows[0] ?? {}) as Record<string, unknown>;
  const score = Math.round(skillNames.reduce((sum, skill) => sum + Number(row[skill] ?? 50), 0) / skillNames.length);
  const level = String(row.cefr_level ?? "A2");
  await withSchema(
    client,
    async () => {
      await client.execute({
        sql: `INSERT INTO level_checks (session_id, user_id, taken_at, level, score, verdict)
              VALUES (?, ?, ?, ?, ?, ?)
              ON CONFLICT(session_id) DO UPDATE SET
                taken_at = excluded.taken_at, level = excluded.level,
                score = excluded.score, verdict = excluded.verdict`,
        args: [sessionId, userId, new Date().toISOString(), level, score, verdict.slice(0, 4000)],
      });
      return true;
    },
    false
  );
}
