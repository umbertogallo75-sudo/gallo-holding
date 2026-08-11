import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";

import { runUpgradeNudges } from "@/lib/nudges";
import { saveBilling } from "@/lib/stripe";

let dir: string;
let client: Client;
const sent: { to: string; subject: string }[] = [];
const fakeSend = async (to: string, subject: string) => { sent.push({ to, subject }); return true; };
const NOON = new Date("2026-08-11T12:00:00Z");

async function addUser(id: string, email: string | null, daysAgo: number) {
  const createdAt = new Date(NOON.getTime() - daysAgo * 86_400_000).toISOString().slice(0, 19).replace("T", " ");
  await client.execute({
    sql: "INSERT INTO auth_users (id, display_name, code_hmac, email, created_at) VALUES (?, ?, ?, ?, ?)",
    args: [id, id, `hash-${id}`, email, createdAt],
  });
}

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-nudges-"));
  client = createClient({ url: `file:${join(dir, "test.db")}` });
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((f) => f.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
});

afterAll(() => {
  client.close();
  rmSync(dir, { recursive: true, force: true });
});

describe("upgrade nudge emails", () => {
  it("sends day1 to locked accounts, skips fresh/active/example ones, never repeats", async () => {
    await addUser("locked-1", "cliente@azienda.it", 1.5);
    await addUser("fresh-1", "nuovo@azienda.it", 0.2);       // too recent
    await addUser("paying-1", "pagante@azienda.it", 2);       // has a plan
    await addUser("test-acct", "qa@example.com", 2);          // internal test domain
    await addUser("no-mail", null, 2);                        // no email
    await saveBilling({ userId: "paying-1", plan: "program", status: "active", currentPeriodEnd: new Date(NOON.getTime() + 30 * 86_400_000).toISOString() }, client);

    const first = await runUpgradeNudges(client, NOON, fakeSend);
    expect(first).toEqual({ day1: 1, day3: 0 });
    expect(sent).toHaveLength(1);
    expect(sent[0].to).toBe("cliente@azienda.it");
    expect(sent[0].subject).toContain("Sam");

    // Second run same day: nothing new.
    const second = await runUpgradeNudges(client, NOON, fakeSend);
    expect(second).toEqual({ day1: 0, day3: 0 });
    expect(sent).toHaveLength(1);
  });

  it("sends day3 only after day1, then goes quiet", async () => {
    const later = new Date(NOON.getTime() + 3 * 86_400_000);
    const third = await runUpgradeNudges(client, later, fakeSend);
    expect(third).toEqual({ day1: 0, day3: 1 });
    expect(sent[1].subject).toContain("3 mesi");

    const fourth = await runUpgradeNudges(client, later, fakeSend);
    expect(fourth).toEqual({ day1: 0, day3: 0 });
    expect(sent).toHaveLength(2);
  });

  it("a brand-new old account gets day1 first even if it is past day 3", async () => {
    await addUser("late-1", "tardivo@azienda.it", 5);
    const run1 = await runUpgradeNudges(client, NOON, fakeSend);
    expect(run1).toEqual({ day1: 1, day3: 0 });
    const run2 = await runUpgradeNudges(client, NOON, fakeSend);
    expect(run2).toEqual({ day1: 0, day3: 1 });
  });

  it("stays quiet outside daytime hours", async () => {
    const night = new Date("2026-08-11T03:00:00Z");
    expect(await runUpgradeNudges(client, night, fakeSend)).toEqual({ skipped: "quiet-hours" });
  });
});
