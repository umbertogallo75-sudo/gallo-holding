import { createClient } from "@libsql/client";
import { beforeEach, describe, expect, it } from "vitest";
import { FIRST_STEPS_DAYS, firstSteps, showFirstSteps } from "@/lib/learning/first-steps";

const client = createClient({ url: ":memory:" });

async function reset(withPushTables = true) {
  await client.execute("DROP TABLE IF EXISTS sessions");
  await client.execute("DROP TABLE IF EXISTS push_subscriptions");
  await client.execute("DROP TABLE IF EXISTS apns_tokens");
  await client.execute("DROP TABLE IF EXISTS fcm_tokens");
  await client.execute("CREATE TABLE sessions (id TEXT, user_id TEXT, mode TEXT, started_at TEXT, ended_at TEXT)");
  if (withPushTables) {
    await client.execute("CREATE TABLE push_subscriptions (endpoint TEXT, user_id TEXT)");
    await client.execute("CREATE TABLE apns_tokens (token TEXT, user_id TEXT)");
    await client.execute("CREATE TABLE fcm_tokens (token TEXT, user_id TEXT)");
  }
}

const done = (steps: Awaited<ReturnType<typeof firstSteps>>) =>
  Object.fromEntries(steps.map((s) => [s.key, s.done]));

describe("i primi passi", () => {
  beforeEach(() => reset());

  it("starts with nothing ticked for somebody who just arrived", async () => {
    expect(done(await firstSteps("u1", client))).toEqual({ level: false, voice: false, reminders: false });
  });

  it("ticks a step from what was actually done, not from a box", async () => {
    await client.execute("INSERT INTO sessions VALUES ('s1','u1','levelcheck','x','y')");
    await client.execute("INSERT INTO sessions VALUES ('s2','u1','voice','x','y')");
    expect(done(await firstSteps("u1", client))).toEqual({ level: true, voice: true, reminders: false });
  });

  it("counts any phone Sam can reach, not one in particular", async () => {
    await client.execute("INSERT INTO apns_tokens VALUES ('t','u1')");
    expect((await firstSteps("u1", client)).find((s) => s.key === "reminders")?.done).toBe(true);
  });

  it("does not credit one person's work to another", async () => {
    await client.execute("INSERT INTO sessions VALUES ('s1','u2','voice','x','y')");
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
