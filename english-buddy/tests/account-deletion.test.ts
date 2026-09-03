import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { deleteUserAccount } from "@/lib/account-deletion";
import { emailHash } from "@/lib/marketing/suppression";

const clients: Client[] = [];
const dirs: string[] = [];

async function migratedClient(): Promise<Client> {
  const dir = mkdtempSync(join(tmpdir(), "execlingo-account-delete-"));
  const client = createClient({ url: `file:${join(dir, "test.db")}` });
  clients.push(client);
  dirs.push(dir);
  const migrations = join(__dirname, "..", "db", "migrations");
  for (const file of readdirSync(migrations).filter((name) => name.endsWith(".sql")).sort()) {
    await client.executeMultiple(readFileSync(join(migrations, file), "utf8"));
  }
  return client;
}

function memoryClient(): Client {
  const client = createClient({ url: ":memory:" });
  clients.push(client);
  return client;
}

afterEach(() => {
  for (const client of clients.splice(0)) client.close();
  for (const dir of dirs.splice(0)) rmSync(dir, { recursive: true, force: true });
});

describe("account deletion", () => {
  it("removes account data, detaches a redeemed license and anonymises retained partner records", async () => {
    const client = await migratedClient();
    const target = "person-to-delete";
    await client.batch([
      { sql: "INSERT INTO auth_users (id, display_name, email, code_hmac) VALUES (?, 'Mario Rossi', 'mario@example.it', 'secret-hash')", args: [target] },
      { sql: "INSERT INTO profiles (id, display_name) VALUES (?, 'Mario Rossi')", args: [target] },
      { sql: "INSERT INTO google_purchase_entitlements (purchase_key, user_id, product_id, plan, status, current_period_end, verified_at) VALUES ('delete-google-token', ?, 'annual', 'annual', 'active', '2027-01-01T00:00:00.000Z', 1)", args: [target] },
      { sql: "INSERT INTO google_purchase_refresh_attempts (purchase_key, user_id, checked_at) VALUES ('delete-google-token', ?, 1)", args: [target] },
      { sql: "INSERT INTO sessions (id, user_id, mode) VALUES ('s1', ?, 'buddy')", args: [target] },
      { sql: "INSERT INTO messages (id, user_id, session_id, role, content) VALUES ('m1', ?, 's1', 'user', 'hello')", args: [target] },
      { sql: "INSERT INTO email_prefs (user_id, unsubscribed_at, source) VALUES (?, CURRENT_TIMESTAMP, 'footer')", args: [target] },
      { sql: "INSERT INTO licenses (code, order_id, status, redeemed_by) VALUES ('EXEC-TEST-CODE', 'order-1', 'redeemed', ?)", args: [target] },
      { sql: `INSERT INTO partners (user_id, name, email, country, partner_type, status, ref_code, payout_method, payout_details, payout_docs_status, notes)
              VALUES (?, 'Mario Rossi', 'mario@example.it', 'IT', 'AFFILIATE', 'ACTIVE', 'MARIOROS-ABCD', 'iban', 'IT00 PERSONAL', 'complete', 'private note')`, args: [target] },
      { sql: "INSERT INTO partner_clicks (id, partner_id, campaign) VALUES ('click-1', ?, 'spring')", args: [target] },
      { sql: "INSERT INTO partner_attributions (user_id, partner_id, ref_code) VALUES ('customer-1', ?, 'MARIOROS-ABCD')", args: [target] },
      { sql: "INSERT INTO partner_leads (id, partner_id, contact_name) VALUES ('lead-1', ?, 'Cliente')", args: [target] },
      { sql: `INSERT INTO commissions (id, partner_id, user_id, payment_ref, revenue_cents, net_cents, rate, amount_cents, status)
              VALUES ('commission-1', ?, ?, 'payment-1', 10000, 8197, 5, 410, 'available')`, args: [target, target] },
      { sql: "INSERT INTO payouts (id, partner_id, amount_cents) VALUES ('payout-1', ?, 410)", args: [target] },
      { sql: "INSERT INTO partner_audit (id, actor, action, entity, detail) VALUES ('audit-1', ?, 'partner_status', ?, ?)", args: [target, target, `partner=${target}`] },
    ], "write");

    await deleteUserAccount(target, client);

    expect(Number((await client.execute({ sql: "SELECT COUNT(*) AS n FROM auth_users WHERE id = ?", args: [target] })).rows[0].n)).toBe(0);
    expect(Number((await client.execute({ sql: "SELECT COUNT(*) AS n FROM profiles WHERE id = ?", args: [target] })).rows[0].n)).toBe(0);
    expect(Number((await client.execute({ sql: "SELECT COUNT(*) AS n FROM google_purchase_entitlements WHERE user_id = ?", args: [target] })).rows[0].n)).toBe(0);
    expect(Number((await client.execute({ sql: "SELECT COUNT(*) AS n FROM google_purchase_refresh_attempts WHERE user_id = ?", args: [target] })).rows[0].n)).toBe(0);
    expect(Number((await client.execute({ sql: "SELECT COUNT(*) AS n FROM messages WHERE user_id = ?", args: [target] })).rows[0].n)).toBe(0);

    const license = (await client.execute("SELECT status, redeemed_by FROM licenses WHERE code = 'EXEC-TEST-CODE'")).rows[0];
    expect(license.status).toBe("redeemed");
    expect(license.redeemed_by).toBeNull();

    const suppression = await client.execute("SELECT email_hash FROM email_suppression");
    expect(suppression.rows.map((row) => String(row.email_hash))).toContain(emailHash("mario@example.it"));

    const partner = (await client.execute("SELECT * FROM partners")).rows[0];
    const anonymousPartnerId = String(partner.user_id);
    expect(anonymousPartnerId).toMatch(/^deleted-partner:/);
    expect(partner).toMatchObject({
      name: "Account eliminato",
      email: null,
      country: null,
      status: "DELETED",
      notes: null,
      payout_method: "iban",
      payout_details: "IT00 PERSONAL",
    });
    expect(String(partner.ref_code)).toMatch(/^DELETED-/);

    for (const table of ["partner_clicks", "partner_attributions", "partner_leads", "commissions", "payouts"]) {
      const row = (await client.execute(`SELECT partner_id FROM ${table} LIMIT 1`)).rows[0];
      expect(String(row.partner_id)).toBe(anonymousPartnerId);
    }
    const attribution = (await client.execute("SELECT ref_code FROM partner_attributions WHERE user_id = 'customer-1'")).rows[0];
    expect(String(attribution.ref_code)).toMatch(/^DELETED-/);
    const commission = (await client.execute("SELECT user_id FROM commissions WHERE id = 'commission-1'")).rows[0];
    expect(commission.user_id).toBeNull();
    const audit = (await client.execute("SELECT actor, entity, detail FROM partner_audit WHERE id = 'audit-1'")).rows[0];
    expect(audit.actor).toBe(anonymousPartnerId);
    expect(audit.entity).toBe(anonymousPartnerId);
    expect(String(audit.detail)).not.toContain(target);
  });

  it("tolerates genuinely optional tables being absent", async () => {
    const client = memoryClient();
    await client.executeMultiple(`
      CREATE TABLE profiles (id TEXT PRIMARY KEY);
      CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT);
      INSERT INTO profiles (id) VALUES ('u1');
      INSERT INTO auth_users (id, email) VALUES ('u1', 'u1@example.it');
    `);

    await expect(deleteUserAccount("u1", client)).resolves.toBeUndefined();
    expect(Number((await client.execute("SELECT COUNT(*) AS n FROM auth_users")).rows[0].n)).toBe(0);
  });

  it("propagates a real delete error and rolls back earlier changes", async () => {
    const client = memoryClient();
    await client.executeMultiple(`
      CREATE TABLE profiles (id TEXT PRIMARY KEY);
      CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT);
      CREATE TABLE licenses (code TEXT PRIMARY KEY, status TEXT, redeemed_by TEXT);
      CREATE TABLE sessions (id TEXT PRIMARY KEY, user_id TEXT);
      CREATE TRIGGER block_session_delete BEFORE DELETE ON sessions
      BEGIN SELECT RAISE(ABORT, 'blocked deletion'); END;
      INSERT INTO profiles (id) VALUES ('u1');
      INSERT INTO auth_users (id, email) VALUES ('u1', 'u1@example.it');
      INSERT INTO licenses (code, status, redeemed_by) VALUES ('CODE', 'redeemed', 'u1');
      INSERT INTO sessions (id, user_id) VALUES ('s1', 'u1');
    `);

    await expect(deleteUserAccount("u1", client)).rejects.toThrow(/blocked deletion/i);
    expect((await client.execute("SELECT redeemed_by FROM licenses WHERE code = 'CODE'")).rows[0].redeemed_by).toBe("u1");
    expect(Number((await client.execute("SELECT COUNT(*) AS n FROM auth_users WHERE id = 'u1'")).rows[0].n)).toBe(1);
  });
});
