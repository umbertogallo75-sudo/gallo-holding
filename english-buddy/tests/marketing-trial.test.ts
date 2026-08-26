import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { TRIAL_MS, grantTrial, hasCompletedModules, hoursLeft, readTrial } from "@/lib/marketing/trial";
import { streakFrom } from "@/lib/marketing/lifecycle";

let client: Client;
const START = new Date("2026-09-01T10:00:00.000Z");

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    CREATE TABLE trials (user_id TEXT PRIMARY KEY, started_at TEXT NOT NULL, ends_at TEXT NOT NULL, extended_at TEXT);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, onboarding_done_at TEXT);
    CREATE TABLE daily_metrics (user_id TEXT NOT NULL, day TEXT NOT NULL, minutes_practiced INTEGER NOT NULL DEFAULT 0, PRIMARY KEY (user_id, day));
  `);
  await client.execute("INSERT INTO profiles (id, onboarding_done_at) VALUES ('u1', NULL)");
});
afterEach(() => client.close());

const practise = (minutes: number, day = "2026-09-01") =>
  client.execute({ sql: "INSERT INTO daily_metrics (user_id, day, minutes_practiced) VALUES ('u1', ?, ?)", args: [day, minutes] });
const finishOnboarding = () =>
  client.execute("UPDATE profiles SET onboarding_done_at = '2026-09-01T10:05:00Z' WHERE id = 'u1'");

describe("the free trial", () => {
  it("opens 24 hours from the moment it is claimed", async () => {
    const trial = await grantTrial("u1", client, START);
    expect(trial?.active).toBe(true);
    expect(trial?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
    expect(hoursLeft(trial!)).toBe(24);
  });

  it("is one trial however many times the link is opened", async () => {
    // Otherwise the welcome email would be a renewable subscription to free
    // access: click, run out, click again.
    await grantTrial("u1", client, START);
    const later = new Date(START.getTime() + 20 * 3_600_000);
    const second = await grantTrial("u1", client, later);
    expect(second?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
  });

  it("expires on its own, with no job to run", async () => {
    await grantTrial("u1", client, START);
    const after = await readTrial("u1", client, new Date(START.getTime() + 25 * 3_600_000));
    expect(after?.active).toBe(false);
    expect(after?.msLeft).toBe(0);
  });

  it("adds a second day once the path is actually walked", async () => {
    await grantTrial("u1", client, START);
    await finishOnboarding();
    await practise(10);
    const trial = await readTrial("u1", client, new Date(START.getTime() + 3_600_000));
    expect(trial?.extended).toBe(true);
    // Measured from the end of the first day, so finishing early is not
    // quietly punished by losing the hours in between.
    expect(trial?.endsAt.toISOString()).toBe(new Date(START.getTime() + 2 * TRIAL_MS).toISOString());
  });

  it("adds that day exactly once, however often it is read", async () => {
    await grantTrial("u1", client, START);
    await finishOnboarding();
    await practise(10);
    const first = await readTrial("u1", client, new Date(START.getTime() + 3_600_000));
    const second = await readTrial("u1", client, new Date(START.getTime() + 7_200_000));
    expect(second?.endsAt.toISOString()).toBe(first?.endsAt.toISOString());
  });

  it("holds the bar at both halves of the promise", async () => {
    await grantTrial("u1", client, START);

    await practise(30);
    expect(await hasCompletedModules("u1", client)).toBe(false); // no onboarding

    await client.execute("DELETE FROM daily_metrics");
    await finishOnboarding();
    await practise(9);
    expect(await hasCompletedModules("u1", client)).toBe(false); // one minute short

    await practise(1, "2026-09-02");
    expect(await hasCompletedModules("u1", client)).toBe(true); // ten across days
  });

  it("says nothing about someone who never claimed one", async () => {
    expect(await readTrial("nobody", client, START)).toBeNull();
  });
});

describe("streakFrom", () => {
  it("counts back from today and stops at the first gap", () => {
    const today = new Date("2026-09-10T20:00:00Z");
    expect(streakFrom(new Set(["2026-09-10", "2026-09-09", "2026-09-08"]), today)).toBe(3);
    expect(streakFrom(new Set(["2026-09-10", "2026-09-08"]), today)).toBe(1);
    expect(streakFrom(new Set(["2026-09-09"]), today)).toBe(0);
    expect(streakFrom(new Set(), today)).toBe(0);
  });
});

/**
 * The rule that makes the whole funnel work: free access exists only for
 * accounts. An anonymous trial is a stranger nobody can write to again — no
 * welcome, no reminder, no reason to come back.
 */
describe("free access requires an account", () => {
  it("is always attached to a user id, never to a browser", async () => {
    // grantTrial has no anonymous form: there is no code path that produces a
    // trial without an id, and the id only exists after registration.
    const trial = await grantTrial("u1", client, START);
    const row = await client.execute("SELECT user_id FROM trials");
    expect(row.rows).toHaveLength(1);
    expect(String(row.rows[0].user_id)).toBe("u1");
    expect(trial?.active).toBe(true);
  });

  it("gives one trial per account however many doors it is claimed through", async () => {
    // The emailed link and the in-app button both land here; two doors must
    // not become two trials.
    await grantTrial("u1", client, START);
    const viaApp = await grantTrial("u1", client, new Date(START.getTime() + 30 * 3_600_000));
    expect(viaApp?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
    expect(viaApp?.active).toBe(false);
  });
});
