import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailHash, isSuppressed, suppress, unsuppress } from "@/lib/marketing/suppression";
import { sendMarketing } from "@/lib/marketing/send";

let client: Client;
let sent: string[];
const send = async (to: string) => { sent.push(to); return true; };
const message = { subject: "Ciao", html: "<p>Ciao</p>", text: "Ciao" };

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
  sent = [];
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    CREATE TABLE email_prefs (user_id TEXT PRIMARY KEY, unsubscribed_at TEXT, source TEXT, updated_at TEXT);
    CREATE TABLE email_sends (claim_key TEXT PRIMARY KEY, user_id TEXT, kind TEXT, sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP));
    CREATE TABLE email_suppression (email_hash TEXT PRIMARY KEY, added_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP), reason TEXT);
  `);
});
afterEach(() => { delete process.env.SESSION_SECRET; client.close(); });

describe("the suppression list", () => {
  it("keeps a hash, never the address", async () => {
    await suppress("Giulia.Rossi@Example.IT", "unsubscribe", client);
    const rows = await client.execute("SELECT email_hash FROM email_suppression");
    const stored = String(rows.rows[0].email_hash);
    expect(stored).toMatch(/^[0-9a-f]{64}$/);
    expect(stored).not.toContain("giulia");
    expect(stored).not.toContain("@");
  });

  it("recognises the same address however it was typed", async () => {
    await suppress("Giulia.Rossi@Example.IT", "unsubscribe", client);
    expect(await isSuppressed("giulia.rossi@example.it", client)).toBe(true);
    expect(await isSuppressed("  GIULIA.ROSSI@EXAMPLE.IT  ", client)).toBe(true);
    expect(emailHash("a@b.it")).toBe(emailHash(" A@B.IT "));
  });

  it("stops a send even when the account preference is gone", async () => {
    // This is the whole point: the account, and its email_prefs row, have
    // been deleted. Only the hash remains, and it still has to hold.
    await suppress("giulia@test.it", "account-deleted", client);
    const result = await sendMarketing(
      { userId: "un-id-nuovo-di-zecca", email: "giulia@test.it", kind: "welcome_trial", claimKey: "k1", message },
      client,
      send
    );
    expect(result).toBe("unsubscribed");
    expect(sent).toHaveLength(0);
  });

  it("lets somebody back in when they say it was a mistake", async () => {
    await suppress("giulia@test.it", "unsubscribe", client);
    await unsuppress("giulia@test.it", client);
    expect(await isSuppressed("giulia@test.it", client)).toBe(false);
    expect(await sendMarketing({ userId: "u1", email: "giulia@test.it", kind: "welcome_trial", claimKey: "k1", message }, client, send)).toBe("sent");
  });

  it("does not silence everyone when nothing has ever been suppressed", async () => {
    expect(await isSuppressed("chiunque@test.it", client)).toBe(false);
  });

  it("is written once however many times it is asked for", async () => {
    await suppress("giulia@test.it", "unsubscribe", client);
    await suppress("giulia@test.it", "account-deleted", client);
    const rows = await client.execute("SELECT COUNT(*) AS n FROM email_suppression");
    expect(Number(rows.rows[0].n)).toBe(1);
  });
});
