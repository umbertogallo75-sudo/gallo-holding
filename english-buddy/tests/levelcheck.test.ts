import type { Client } from "@libsql/client";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import {
  answersSoFar,
  isVerdictTurn,
  lastLevelcheck,
  levelcheckOrder,
  saveLevelcheck,
  LEVELCHECK_LOCK_DAYS,
  LEVELCHECK_QUESTIONS,
} from "@/lib/learning/levelcheck";

/**
 * The bug this exists to stop.
 *
 * The entry test was ten questions because the prompt said "ask about ten
 * questions". Testers ran it and got a test that never ended: it drifted into
 * an ordinary chat, asked a twelfth and a fifteenth question, and never gave
 * the verdict it exists to give. A model asked to count its own turns does
 * not count them. So the counting is here, and these tests are about the
 * counting, not about what the coach then writes.
 */
type Call = { sql: string; args: unknown[] };

function fakeClient(rowsFor: (sql: string) => Record<string, unknown>[], opts: { noTable?: boolean } = {}) {
  let exists = !opts.noTable;
  const calls: Call[] = [];
  const client = {
    execute: async (q: { sql: string; args: unknown[] } | string) => {
      const sql = typeof q === "string" ? q : q.sql;
      calls.push({ sql, args: typeof q === "string" ? [] : q.args });
      if (/level_checks/.test(sql) && !exists) throw new Error("no such table: level_checks");
      return { rows: rowsFor(sql) };
    },
    executeMultiple: async (sql: string) => {
      calls.push({ sql, args: [] });
      if (/CREATE TABLE IF NOT EXISTS level_checks/.test(sql)) exists = true;
    },
  } as unknown as Client;
  return { client, calls };
}

const day = 86_400_000;

describe("the entry test is counted in code", () => {
  it("tells the coach which question it is on, and forbids a verdict before the end", () => {
    const early = levelcheckOrder(3);
    expect(early).toContain(`ask question 4 of ${LEVELCHECK_QUESTIONS}`);
    expect(early).toMatch(/Do NOT give a verdict/);
    // And it must not leak the count to the learner: a test that announces
    // "question 4 of 10" is an exam, which is the one thing it must not be.
    expect(early).toMatch(/Do NOT mention numbers/);
  });

  it("orders the verdict on the tenth answer and not before", () => {
    expect(isVerdictTurn(LEVELCHECK_QUESTIONS - 1)).toBe(false);
    expect(isVerdictTurn(LEVELCHECK_QUESTIONS)).toBe(true);
    // A session reopened past the end must not start asking again either.
    expect(isVerdictTurn(LEVELCHECK_QUESTIONS + 4)).toBe(true);
    const end = levelcheckOrder(LEVELCHECK_QUESTIONS);
    expect(end).toContain("THE TEST IS OVER");
    expect(end).toMatch(/Do NOT ask another question/);
  });

  it("counts answers, not messages", () => {
    const { client, calls } = fakeClient(() => [{ n: 7 }]);
    return answersSoFar("s1", client).then((n) => {
      expect(n).toBe(7);
      expect(calls[0].sql).toMatch(/role = 'user'/);
    });
  });
});

describe("the verdict is kept", () => {
  it("stores the level and the score the state held when it was given", async () => {
    const { client, calls } = fakeClient((sql) =>
      /learning_state/.test(sql) ? [{ cefr_level: "B1", grammar: 60, vocabulary: 70, listening: 50, speaking: 60, writing: 60 }] : []
    );
    await saveLevelcheck("u1", "s1", "Ecco cosa sai già fare…", client);
    const insert = calls.find((c) => /INSERT INTO level_checks/.test(c.sql));
    expect(insert).toBeDefined();
    expect(insert!.args[0]).toBe("s1");
    expect(insert!.args[3]).toBe("B1");
    // A number taken from the skills, not from prose the coach volunteered:
    // a level is worth something only if the next one is measured the same way.
    expect(typeof insert!.args[4]).toBe("number");
    expect(insert!.args[5]).toBe("Ecco cosa sai già fare…");
  });

  it("creates its table on a database that has never seen it", async () => {
    const { client, calls } = fakeClient(() => [], { noTable: true });
    const result = await lastLevelcheck("u1", client);
    expect(result).toBeNull();
    expect(calls.some((c) => /CREATE TABLE IF NOT EXISTS level_checks/.test(c.sql))).toBe(true);
  });

  it("locks for a month and then reopens", async () => {
    const fresh = new Date(Date.now() - 3 * day).toISOString();
    const { client } = fakeClient(() => [{ session_id: "s1", taken_at: fresh, level: "B1", score: 61, verdict: "…" }]);
    const recent = await lastLevelcheck("u1", client);
    expect(recent!.locked).toBe(true);
    expect(recent!.daysLeft).toBe(LEVELCHECK_LOCK_DAYS - 3);

    const old = new Date(Date.now() - (LEVELCHECK_LOCK_DAYS + 1) * day).toISOString();
    const second = fakeClient(() => [{ session_id: "s1", taken_at: old, level: "B1", score: 61, verdict: "…" }]);
    const past = await lastLevelcheck("u1", second.client);
    expect(past!.locked).toBe(false);
    expect(past!.daysLeft).toBe(0);
  });
});

describe("the rest of the app agrees with it", () => {
  it("never offers an interrupted entry test as a conversation to resume", () => {
    const sessions = readFileSync("src/lib/learning/sessions.ts", "utf8");
    const resumable = sessions.slice(sessions.indexOf("export async function resumableSession"));
    expect(resumable).toContain("s.mode != 'levelcheck'");
    // NULL != 'levelcheck' is NULL in SQL, so without the guard every session
    // stored before modes existed would quietly stop being resumable.
    expect(resumable).toContain("s.mode IS NULL OR");
  });

  it("ticks the first step on the verdict rather than on three turns", () => {
    const steps = readFileSync("src/lib/learning/first-steps.ts", "utf8");
    expect(steps).toContain("lastLevelcheck(userId, client)");
    expect(steps).toContain('step.key === "level" ? level !== null');
  });

  it("stops asking the coach to count its own questions", () => {
    const prompt = readFileSync("src/lib/ai/prompt.ts", "utf8");
    expect(prompt).toContain("do not count and do not decide the ending yourself");
    expect(prompt).not.toContain("Ask about TEN questions");
  });

  it("sends somebody back to the verdict instead of starting a second test", () => {
    const buddy = readFileSync("src/app/buddy/page.tsx", "utf8");
    expect(buddy).toContain("lastLevelcheck");
    expect(buddy).toContain("previous?.locked");
  });
});
