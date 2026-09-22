import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { FIRST_STEPS_DAYS, firstSteps, showFirstSteps } from "@/lib/learning/first-steps";

const client = createClient({ url: ":memory:" });

async function reset(withPushTables = true) {
  await client.execute("DROP TABLE IF EXISTS sessions");
  await client.execute("DROP TABLE IF EXISTS messages");
  await client.execute("DROP TABLE IF EXISTS push_subscriptions");
  await client.execute("DROP TABLE IF EXISTS apns_tokens");
  await client.execute("DROP TABLE IF EXISTS fcm_tokens");
  await client.execute("DROP TABLE IF EXISTS level_checks");
  await client.execute("CREATE TABLE sessions (id TEXT, user_id TEXT, mode TEXT, started_at TEXT, ended_at TEXT)");
  await client.execute("CREATE TABLE messages (id TEXT, user_id TEXT, session_id TEXT, role TEXT, content TEXT)");
  if (withPushTables) {
    await client.execute("CREATE TABLE push_subscriptions (endpoint TEXT, user_id TEXT)");
    await client.execute("CREATE TABLE apns_tokens (token TEXT, user_id TEXT)");
    await client.execute("CREATE TABLE fcm_tokens (token TEXT, user_id TEXT)");
  }
}

const done = (steps: Awaited<ReturnType<typeof firstSteps>>) =>
  Object.fromEntries(steps.map((s) => [s.key, s.done]));

/**
 * A finished entry test: the row the coach route writes once the verdict has
 * been given. The step is ticked by this and by nothing else — four answers
 * into a test that was then abandoned leaves Sam with no level to work from,
 * which is exactly the situation the step exists to prevent.
 */
async function verdict(userId: string, sessionId: string) {
  await client.execute(
    `CREATE TABLE IF NOT EXISTS level_checks (session_id TEXT PRIMARY KEY, user_id TEXT, taken_at TEXT, level TEXT, score INTEGER, verdict TEXT)`
  );
  await client.execute(
    `INSERT INTO level_checks VALUES ('${sessionId}','${userId}','${new Date().toISOString()}','B1',61,'giudizio')`
  );
}

/** A session with `turns` things the learner actually said in it. */
async function session(id: string, userId: string, mode: string, turns: number) {
  await client.execute(`INSERT INTO sessions VALUES ('${id}','${userId}','${mode}','x','y')`);
  for (let i = 0; i < turns; i++) {
    await client.execute(`INSERT INTO messages VALUES ('${id}-${i}','${userId}','${id}','user','line ${i}')`);
  }
}

describe("i primi passi", () => {
  beforeEach(() => reset());

  it("starts with nothing ticked for somebody who just arrived", async () => {
    expect(done(await firstSteps("u1", client))).toEqual({ level: false, voice: false, reminders: false });
  });

  it("ticks a step from what was actually done, not from a box", async () => {
    await session("s1", "u1", "levelcheck", 10);
    await verdict("u1", "s1");
    await session("s2", "u1", "voice", 4);
    expect(done(await firstSteps("u1", client))).toEqual({ level: true, voice: true, reminders: false });
  });

  it("does not tick the level on a test that was answered but never finished", async () => {
    // Ten answers and no verdict is a test the app killed halfway, or one
    // somebody walked out of: either way there is no starting point, so there
    // is nothing to congratulate.
    await session("s1", "u1", "levelcheck", 10);
    expect(done(await firstSteps("u1", client))).toEqual({ level: false, voice: false, reminders: false });
  });

  it("does not congratulate somebody who opened a step and closed it", async () => {
    // A session row exists from the moment the screen opens, so this used to
    // tick the box for a spoken conversation nobody had had — and then the
    // home screen told them it was done.
    await session("s1", "u1", "levelcheck", 1);
    await session("s2", "u1", "voice", 0);
    expect(done(await firstSteps("u1", client))).toEqual({ level: false, voice: false, reminders: false });
  });

  it("counts any phone Sam can reach, not one in particular", async () => {
    await client.execute("INSERT INTO apns_tokens VALUES ('t','u1')");
    expect((await firstSteps("u1", client)).find((s) => s.key === "reminders")?.done).toBe(true);
  });

  it("does not credit one person's work to another", async () => {
    await session("s1", "u2", "voice", 5);
    await verdict("u2", "s1");
    expect(done(await firstSteps("u1", client))).toEqual({ level: false, voice: false, reminders: false });
  });

  it("survives a database where push has never been registered", async () => {
    // Those tables are created on first registration; on a fresh install they
    // are legitimately absent, and the home screen must still render.
    await reset(false);
    expect(done(await firstSteps("u1", client))).toEqual({ level: false, voice: false, reminders: false });
  });

  it("goes away when it is finished, and stops asking after a fortnight", async () => {
    const fresh = await firstSteps("u1", client);
    expect(showFirstSteps(fresh, 1)).toBe(true);
    expect(showFirstSteps(fresh, FIRST_STEPS_DAYS)).toBe(true);
    expect(showFirstSteps(fresh, FIRST_STEPS_DAYS + 1)).toBe(false);
    expect(showFirstSteps(fresh.map((s) => ({ ...s, done: true })), 1)).toBe(false);
  });
});
