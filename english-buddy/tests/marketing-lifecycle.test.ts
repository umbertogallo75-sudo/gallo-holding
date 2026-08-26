import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { lifecycleStart, runLifecycleEmails } from "@/lib/marketing/lifecycle";

let client: Client;
let sent: { to: string; subject: string }[];
const send = async (to: string, subject: string) => { sent.push({ to, subject }); return true; };

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
  process.env.LIFECYCLE_START_AT = "2026-09-01";
  sent = [];
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT, display_name TEXT, created_at TEXT);
    CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT, ended_at TEXT);
    CREATE TABLE daily_metrics (user_id TEXT, day TEXT, minutes_practiced INTEGER DEFAULT 0, expressions_reviewed INTEGER DEFAULT 0, PRIMARY KEY (user_id, day));
    CREATE TABLE billing (user_id TEXT PRIMARY KEY, plan TEXT, status TEXT);
    CREATE TABLE trials (user_id TEXT PRIMARY KEY, started_at TEXT, ends_at TEXT, extended_at TEXT);
    CREATE TABLE profiles (id TEXT PRIMARY KEY, onboarding_done_at TEXT);
    CREATE TABLE email_prefs (user_id TEXT PRIMARY KEY, unsubscribed_at TEXT, source TEXT, updated_at TEXT);
    CREATE TABLE email_sends (claim_key TEXT PRIMARY KEY, user_id TEXT, kind TEXT, sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP));
    INSERT INTO auth_users VALUES ('tester', 'tester@vaspitalia.com', 'Giulia', '2026-07-20 10:00:00');
    INSERT INTO sessions VALUES ('s1', 'tester', '2026-08-05 10:00:00');
  `);
});
afterEach(() => { delete process.env.LIFECYCLE_START_AT; delete process.env.SESSION_SECRET; client.close(); });

const at = (iso: string) => new Date(iso);

describe("the opening date", () => {
  it("is read from the environment, with a safe fallback", () => {
    expect(lifecycleStart().toISOString().slice(0, 10)).toBe("2026-09-01");
    process.env.LIFECYCLE_START_AT = "non-una-data";
    // A typo in the dashboard must not become "start immediately".
    expect(lifecycleStart().toISOString().slice(0, 10)).toBe("2026-09-15");
    delete process.env.LIFECYCLE_START_AT;
    expect(lifecycleStart().toISOString().slice(0, 10)).toBe("2026-09-15");
  });

  it("sends nothing at all before it", async () => {
    const report = await runLifecycleEmails(client, at("2026-08-31T10:00:00Z"), send);
    expect(report.skipped).toBe("before-start");
    expect(sent).toHaveLength(0);
  });

  it("does not open with the harshest letter to someone lapsed since before it existed", async () => {
    // Giulia last practised on 5 August — 27 days before the start. Counted
    // naively she is deep into the reminders, and the first thing she would
    // ever receive is the fortnight letter telling her she has given up.
    await runLifecycleEmails(client, at("2026-09-01T10:00:00Z"), send);
    expect(sent).toHaveLength(0);

    // Three days after the opening, and only now, the gentle one.
    await runLifecycleEmails(client, at("2026-09-04T10:00:00Z"), send);
    expect(sent).toHaveLength(1);
    expect(sent[0].subject).toContain("Sam ti aspetta");
  });

  it("reaches the firm letter a week in, in the right order", async () => {
    await runLifecycleEmails(client, at("2026-09-04T10:00:00Z"), send);
    await runLifecycleEmails(client, at("2026-09-08T10:00:00Z"), send);
    expect(sent.map((m) => m.subject)).toEqual([
      expect.stringContaining("Sam ti aspetta"),
      expect.stringContaining("Una settimana"),
    ]);
  });

  it("never writes to somebody who asked to be left alone", async () => {
    await client.execute("INSERT INTO email_prefs (user_id, unsubscribed_at) VALUES ('tester', '2026-09-02')");
    await runLifecycleEmails(client, at("2026-09-04T10:00:00Z"), send);
    expect(sent).toHaveLength(0);
  });

  it("sends one email a day and no more, even when two are due", async () => {
    await runLifecycleEmails(client, at("2026-09-04T10:00:00Z"), send);
    await client.execute("INSERT INTO daily_metrics VALUES ('tester', '2026-09-04', 30, 4)");
    // Evening of the same day: the recap is due, but one letter has gone.
    await runLifecycleEmails(client, at("2026-09-04T18:00:00Z"), send);
    expect(sent).toHaveLength(1);
  });
});
