import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { sendMarketing, onceKey, dailyKey, isRealAddress } from "@/lib/marketing/send";
import { setSubscription } from "@/lib/marketing/prefs";

let client: Client;
let sent: { to: string; subject: string; headers?: Record<string, string> }[];
let succeed: boolean;

const send = async (to: string, subject: string, _html: string, _text?: string, headers?: Record<string, string>) => {
  sent.push({ to, subject, headers });
  return succeed;
};
const message = { subject: "Ciao", html: "<p>Ciao</p>", text: "Ciao" };

beforeEach(async () => {
  process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long";
  sent = [];
  succeed = true;
  client = createClient({ url: ":memory:" });
  await client.executeMultiple(`
    CREATE TABLE email_prefs (user_id TEXT PRIMARY KEY, unsubscribed_at TEXT, source TEXT, updated_at TEXT);
    CREATE TABLE email_sends (claim_key TEXT PRIMARY KEY, user_id TEXT NOT NULL, kind TEXT NOT NULL, sent_at TEXT NOT NULL DEFAULT (CURRENT_TIMESTAMP));
  `);
});
afterEach(() => { delete process.env.SESSION_SECRET; client.close(); });

const call = (userId: string, email: string | null, key: string) =>
  sendMarketing({ userId, email, kind: "welcome_trial", claimKey: key, message }, client, send);

describe("sendMarketing", () => {
  it("sends once and never a second time", async () => {
    const key = onceKey("u1", "welcome_trial");
    expect(await call("u1", "a@test.it", key)).toBe("sent");
    expect(await call("u1", "a@test.it", key)).toBe("already");
    expect(sent).toHaveLength(1);
  });

  it("refuses to write to somebody who asked to be left alone", async () => {
    await setSubscription("u1", false, "test", client);
    expect(await call("u1", "a@test.it", onceKey("u1", "welcome_trial"))).toBe("unsubscribed");
    expect(sent).toHaveLength(0);
  });

  it("writes again to somebody who changed their mind", async () => {
    await setSubscription("u1", false, "test", client);
    await setSubscription("u1", true, "test-undo", client);
    expect(await call("u1", "a@test.it", onceKey("u1", "welcome_trial"))).toBe("sent");
  });

  it("gives the claim back when the provider fails, so the email is not lost forever", async () => {
    // The claim is taken before the send so two cron runs cannot both write.
    // Keeping it after a failure would silently cost somebody their welcome.
    succeed = false;
    const key = onceKey("u1", "welcome_trial");
    expect(await call("u1", "a@test.it", key)).toBe("failed");
    const left = await client.execute("SELECT COUNT(*) AS n FROM email_sends");
    expect(Number(left.rows[0].n)).toBe(0);

    succeed = true;
    expect(await call("u1", "a@test.it", key)).toBe("sent");
  });

  it("carries the headers the mailbox providers ask bulk senders for", async () => {
    await call("u1", "a@test.it", onceKey("u1", "welcome_trial"));
    expect(sent[0].headers?.["List-Unsubscribe"]).toMatch(/^<https?:\/\/.+\/disiscriviti\/.+>$/);
    expect(sent[0].headers?.["List-Unsubscribe-Post"]).toBe("List-Unsubscribe=One-Click");
  });

  it("lets a dated email come back tomorrow but not twice today", async () => {
    expect(await call("u1", "a@test.it", dailyKey("u1", "evening_recap", "2026-08-26"))).toBe("sent");
    expect(await call("u1", "a@test.it", dailyKey("u1", "evening_recap", "2026-08-26"))).toBe("already");
    expect(await call("u1", "a@test.it", dailyKey("u1", "evening_recap", "2026-08-27"))).toBe("sent");
  });

  it("does not write to fixtures or to nothing", async () => {
    expect(await call("u1", "tester@example.com", onceKey("u1", "welcome_trial"))).toBe("invalid");
    expect(await call("u1", null, onceKey("u2", "welcome_trial"))).toBe("invalid");
    expect(await call("u1", "not-an-address", onceKey("u3", "welcome_trial"))).toBe("invalid");
    expect(sent).toHaveLength(0);
  });
});

describe("isRealAddress", () => {
  it("keeps real addresses and drops the rest", () => {
    expect(isRealAddress("umberto@vaspitalia.com")).toBe(true);
    expect(isRealAddress("a@b.co")).toBe(true);
    expect(isRealAddress("x@example.com")).toBe(false);
    expect(isRealAddress("")).toBe(false);
    expect(isRealAddress(null)).toBe(false);
  });
});
