import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  ensureProfile,
  getRelevantLearningContext,
  recordDailyMetric,
  recordReviewResult,
  saveExpression,
  saveMessage,
  saveMistake,
  startSession,
  updateSkillEstimate,
} from "@/lib/learning/service";

const USER = "owner";
let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-test-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
  await client.execute({ sql: "INSERT INTO profiles (id, display_name) VALUES (?, ?)", args: [USER, "Umberto"] });
  await client.execute({ sql: "INSERT INTO learning_state (user_id, cefr_level, primary_goal) VALUES (?, 'B1', 'Business calls')", args: [USER] });
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("learning service against a real libSQL database", () => {
  it("stores mistakes and increments occurrences on repetition", async () => {
    const mistake = { incorrect: "I am agree", correct: "I agree", category: "grammar" as const, severity: "meaningful" as const, note: "" };
    await saveMistake(USER, mistake, client);
    await saveMistake(USER, mistake, client);
    const rows = (await client.execute({ sql: "SELECT times_seen, first_seen_at, next_review_at FROM mistakes WHERE user_id = ?", args: [USER] })).rows;
    expect(rows).toHaveLength(1);
    expect(Number(rows[0].times_seen)).toBe(2);
    expect(rows[0].first_seen_at).toBeTruthy();
    expect(rows[0].next_review_at).toBeTruthy();
  });

  it("stores expressions once and schedules them for review", async () => {
    await saveExpression(USER, "From my perspective", "Dal mio punto di vista", client);
    await saveExpression(USER, "From my perspective", null, client);
    const rows = (await client.execute({ sql: "SELECT meaning, next_review_at FROM expressions WHERE user_id = ?", args: [USER] })).rows;
    expect(rows).toHaveLength(1);
    expect(rows[0].meaning).toBe("Dal mio punto di vista");
  });

  it("records review results and grows the interval on success", async () => {
    // Make the expression due now so it shows up in context first.
    await client.execute({ sql: "UPDATE expressions SET next_review_at = ? WHERE user_id = ?", args: [new Date(Date.now() - 1000).toISOString(), USER] });
    const matched = await recordReviewResult(USER, "From my perspective", true, client);
    expect(matched).toBe(true);
    const row = (await client.execute({ sql: "SELECT interval_days, review_count, success_count, next_review_at FROM expressions WHERE user_id = ?", args: [USER] })).rows[0];
    expect(Number(row.interval_days)).toBeGreaterThan(1);
    expect(Number(row.review_count)).toBe(1);
    expect(Number(row.success_count)).toBe(1);
    expect(new Date(String(row.next_review_at)).getTime()).toBeGreaterThan(Date.now());
  });

  it("matches mistake reviews by either incorrect or corrected text", async () => {
    expect(await recordReviewResult(USER, "I agree", true, client)).toBe(true);
    expect(await recordReviewResult(USER, "not stored anywhere", true, client)).toBe(false);
  });

  it("builds compact learning context with due items and session messages", async () => {
    const sessionId = await startSession(USER, "text-5", client);
    await saveMessage(USER, sessionId, "user", "Hello coach", null, client);
    await saveMessage(USER, sessionId, "assistant", "Hello! How is your day?", null, client);
    await client.execute({ sql: "UPDATE mistakes SET next_review_at = ? WHERE user_id = ?", args: [new Date(Date.now() - 1000).toISOString(), USER] });

    const context = await getRelevantLearningContext(USER, sessionId, client);
    expect(context.profile?.displayName).toBe("Umberto");
    expect(context.level).toBe("B1");
    expect(context.recentMistakes.length).toBeGreaterThan(0);
    expect(context.dueMistakes.length).toBeGreaterThan(0);
    expect(context.recentMessages.map((m) => m.role)).toEqual(["user", "assistant"]);
  });

  it("accumulates daily metrics", async () => {
    await recordDailyMetric(USER, { minutes: 5, interactions: 1 }, client);
    await recordDailyMetric(USER, { minutes: 2, interactions: 1, expressionsReviewed: 1 }, client);
    const row = (await client.execute({ sql: "SELECT * FROM daily_metrics WHERE user_id = ?", args: [USER] })).rows[0];
    expect(Number(row.minutes_practiced)).toBe(7);
    expect(Number(row.interactions)).toBe(2);
    expect(Number(row.expressions_reviewed)).toBe(1);
  });

  it("applies bounded skill updates", async () => {
    await updateSkillEstimate(USER, { grammar: 50, fluency: -50, listening: 0 }, client);
    const row = (await client.execute({ sql: "SELECT grammar, fluency, listening FROM learning_state WHERE user_id = ?", args: [USER] })).rows[0];
    expect(Number(row.grammar)).toBe(52); // clamped to +2
    expect(Number(row.fluency)).toBe(48); // clamped to -2
    expect(Number(row.listening)).toBe(50);
  });

  it("ensureProfile lets a user who skipped onboarding start a session (FK regression)", async () => {
    const newcomer = "newcomer-no-onboarding";
    await expect(startSession(newcomer, "text-5", client)).rejects.toThrow(); // FK fails without a profile
    await ensureProfile(newcomer, client);
    const sessionId = await startSession(newcomer, "text-5", client);
    await saveMessage(newcomer, sessionId, "user", "Hello!", null, client);
    expect(sessionId).toBeTruthy();
    await ensureProfile(newcomer, client); // idempotent, never overwrites
    const profile = (await client.execute({ sql: "SELECT display_name FROM profiles WHERE id = ?", args: [newcomer] })).rows[0];
    expect(String(profile.display_name)).toBe("Friend");
  });
});
