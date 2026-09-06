import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { TRIAL_DAYS, TRIAL_MS, daysLeft, grantTrial, hoursLeft, readTrial } from "@/lib/marketing/trial";
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


describe("the free week", () => {
  it("opens seven days from the moment the account exists", async () => {
    const trial = await grantTrial("u1", client, START);
    expect(TRIAL_DAYS).toBe(7);
    expect(trial?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
    expect(daysLeft(trial!)).toBe(7);
    expect(hoursLeft(trial!)).toBe(168);
    expect(trial?.active).toBe(true);
  });

  it("is one week however many times it is granted", async () => {
    await grantTrial("u1", client, START);
    const later = new Date(START.getTime() + 3 * 24 * 3_600_000);
    const second = await grantTrial("u1", client, later);
    expect(second?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
  });

  it("is over when the week is over", async () => {
    await grantTrial("u1", client, START);
    const after = await readTrial("u1", client, new Date(START.getTime() + TRIAL_MS + 60_000));
    expect(after?.active).toBe(false);
    expect(daysLeft(after!)).toBe(0);
  });

  /**
   * The old trial was twenty-four hours. Somebody who started one yesterday
   * must not expire under the old promise while the site advertises the new
   * one — so a short trial is lengthened where it is read, not migrated.
   */
  it("lengthens a trial from the twenty-four hour era to the full week", async () => {
    await client.execute({
      sql: "INSERT INTO trials (user_id, started_at, ends_at) VALUES ('old', ?, ?)",
      args: [START.toISOString(), new Date(START.getTime() + 24 * 3_600_000).toISOString()],
    });
    const trial = await readTrial("old", client, new Date(START.getTime() + 48 * 3_600_000));
    expect(trial?.active).toBe(true);
    expect(trial?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());

    // Written down, not recomputed on every read.
    const row = await client.execute("SELECT ends_at FROM trials WHERE user_id = 'old'");
    expect(String(row.rows[0].ends_at)).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
  });

  it("never shortens one that is already longer", async () => {
    const generous = new Date(START.getTime() + 30 * 24 * 3_600_000).toISOString();
    await client.execute({
      sql: "INSERT INTO trials (user_id, started_at, ends_at) VALUES ('vip', ?, ?)",
      args: [START.toISOString(), generous],
    });
    const trial = await readTrial("vip", client, new Date(START.getTime() + 8 * 24 * 3_600_000));
    expect(trial?.endsAt.toISOString()).toBe(generous);
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
    const viaApp = await grantTrial("u1", client, new Date(START.getTime() + 8 * 24 * 3_600_000));
    expect(viaApp?.endsAt.toISOString()).toBe(new Date(START.getTime() + TRIAL_MS).toISOString());
    expect(viaApp?.active).toBe(false);
  });
});


/**
 * The promise is made in four places and kept in one. When they disagree the
 * user is the one who finds out, so they are held together here.
 */
describe("the week is promised where it is granted", () => {
  const read = (path: string) => readFileSync(path, "utf8");

  it("starts with the account, on all three ways in", () => {
    for (const path of [
      "src/app/api/auth/register/route.ts",
      "src/app/api/auth/google/callback/route.ts",
      "src/app/api/auth/apple/callback/route.ts",
    ]) {
      expect(read(path), `${path} non fa partire la settimana`).toContain("ensureTrial");
    }
  });

  it("says seven days where somebody is deciding whether to register", () => {
    expect(read("src/app/register/RegisterForm.tsx")).toContain("7 giorni");
    expect(read("src/lib/marketing/templates.ts")).toContain("La prima settimana è gratis");
  });

  it("promises the progress survives, in every place the access ends", () => {
    for (const path of [
      "src/app/abbonamento/page.tsx",
      "src/app/home/page.tsx",
      "src/components/TrialBanner.tsx",
      "src/lib/marketing/templates.ts",
    ]) {
      expect(read(path).toLowerCase(), `${path} non dice che i progressi restano`).toContain("progressi");
    }
  });
});
