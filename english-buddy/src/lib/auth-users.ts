import { randomBytes, randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { accessCodeHash, resetTokenHash, OWNER_ID } from "@/lib/auth";

/**
 * Account store for invite-based multi-user access. Every function takes an
 * optional client so tests can run against a local file database.
 */

/**
 * Self-healing schema (mirrors db/migrations/0015_password_login.sql): the
 * original table declared code_hmac UNIQUE, which clashes with per-account
 * password verification. SQLite can't drop a column-level UNIQUE, so on the
 * first write against an old database the table is rebuilt without it.
 */
const PASSWORD_SCHEMA_SQL = `
BEGIN IMMEDIATE;
CREATE TABLE IF NOT EXISTS auth_users_v2 (
  id TEXT PRIMARY KEY,
  display_name TEXT,
  code_hmac TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  email TEXT,
  reset_hmac TEXT,
  reset_expires_at TEXT,
  google_sub TEXT,
  apple_sub TEXT
);
INSERT OR IGNORE INTO auth_users_v2 (id, display_name, code_hmac, created_at, email, reset_hmac, reset_expires_at, google_sub, apple_sub)
  SELECT id, display_name, code_hmac, created_at, email, reset_hmac, reset_expires_at, google_sub, apple_sub FROM auth_users;
DROP TABLE auth_users;
ALTER TABLE auth_users_v2 RENAME TO auth_users;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_google_sub ON auth_users(google_sub) WHERE google_sub IS NOT NULL;
CREATE UNIQUE INDEX IF NOT EXISTS idx_auth_users_apple_sub ON auth_users(apple_sub) WHERE apple_sub IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_auth_users_email_lower ON auth_users(lower(email));
COMMIT;
`;

const passwordSchemaReady = new WeakSet<Client>();

async function ensurePasswordSchema(client: Client): Promise<void> {
  if (passwordSchemaReady.has(client)) return;
  const table = await client.execute("SELECT sql FROM sqlite_master WHERE type='table' AND name='auth_users' LIMIT 1");
  const createSql = String(table.rows[0]?.sql ?? "");
  if (/code_hmac\s+TEXT\s+NOT\s+NULL\s+UNIQUE/i.test(createSql)) {
    await client.executeMultiple(PASSWORD_SCHEMA_SQL);
  }
  passwordSchemaReady.add(client);
}

/** Resolves an access code to a user id: env-configured owner first, then registered users. */
export async function findUserIdByAccessCode(code: string, client: Client = db()): Promise<string | null> {
  const ownerCode = process.env.APP_ACCESS_CODE;
  if (ownerCode && code === ownerCode) return OWNER_ID;

  const result = await client.execute({
    sql: "SELECT id FROM auth_users WHERE code_hmac = ? LIMIT 1",
    args: [accessCodeHash(code)],
  });
  return result.rows.length ? String(result.rows[0].id) : null;
}

export async function accessCodeInUse(code: string, client: Client = db()): Promise<boolean> {
  return (await findUserIdByAccessCode(code, client)) !== null;
}

/**
 * Standard email + password login. The password is verified inside the
 * account that owns the email, so it does NOT need to be globally unique.
 * Order: env-configured owner → email match → grandfathered invite accounts
 * created without an email (their unique code keeps working).
 */
export async function findUserIdByEmailPassword(email: string, password: string, client: Client = db()): Promise<string | null> {
  const ownerCode = process.env.APP_ACCESS_CODE;
  if (ownerCode && password === ownerCode) return OWNER_ID;

  const hash = accessCodeHash(password);
  const byEmail = await client.execute({
    sql: "SELECT id, code_hmac FROM auth_users WHERE lower(email) = lower(?)",
    args: [email.trim()],
  });
  for (const row of byEmail.rows) {
    if (String(row.code_hmac) === hash) return String(row.id);
  }

  const legacy = await client.execute({
    sql: "SELECT id FROM auth_users WHERE code_hmac = ? AND (email IS NULL OR email = '') LIMIT 1",
    args: [hash],
  });
  return legacy.rows.length ? String(legacy.rows[0].id) : null;
}

/** Confirms the logged-in user's current password (scoped to their account). */
export async function verifyUserPassword(userId: string, password: string, client: Client = db()): Promise<boolean> {
  const result = await client.execute({ sql: "SELECT code_hmac FROM auth_users WHERE id = ? LIMIT 1", args: [userId] });
  return result.rows.length > 0 && String(result.rows[0].code_hmac) === accessCodeHash(password);
}

export async function createAuthUser(name: string, code: string, email: string | null = null, client: Client = db()): Promise<string> {
  await ensurePasswordSchema(client);
  const id = randomUUID();
  await client.execute({
    sql: "INSERT INTO auth_users (id, display_name, code_hmac, email) VALUES (?, ?, ?, ?)",
    args: [id, name, accessCodeHash(code), email],
  });
  return id;
}

/** Mints a one-time reset token (30 min) for the account with this email. */
export async function createResetToken(email: string, client: Client = db()): Promise<{ token: string; name: string } | null> {
  const result = await client.execute({ sql: "SELECT id, display_name FROM auth_users WHERE email = ? LIMIT 1", args: [email] });
  if (!result.rows.length) return null;
  const token = randomBytes(24).toString("hex");
  await client.execute({
    sql: "UPDATE auth_users SET reset_hmac = ?, reset_expires_at = ? WHERE id = ?",
    args: [resetTokenHash(token), new Date(Date.now() + 30 * 60_000).toISOString(), String(result.rows[0].id)],
  });
  return { token, name: String(result.rows[0].display_name ?? "") };
}

/** Sets a new password for a valid, unexpired reset token. */
export async function resetCodeWithToken(token: string, newCode: string, client: Client = db()): Promise<string | null> {
  await ensurePasswordSchema(client);
  const result = await client.execute({
    sql: "SELECT id, reset_expires_at FROM auth_users WHERE reset_hmac = ? LIMIT 1",
    args: [resetTokenHash(token)],
  });
  const row = result.rows[0];
  if (!row) return null;
  if (!row.reset_expires_at || Date.parse(String(row.reset_expires_at)) < Date.now()) return null;
  await client.execute({
    sql: "UPDATE auth_users SET code_hmac = ?, reset_hmac = NULL, reset_expires_at = NULL WHERE id = ?",
    args: [accessCodeHash(newCode), String(row.id)],
  });
  return String(row.id);
}

/** Changes a registered user's password (the env-based owner code lives in Vercel). */
export async function updateAccessCode(userId: string, newCode: string, client: Client = db()): Promise<boolean> {
  await ensurePasswordSchema(client);
  if (userId === OWNER_ID) return false;
  const result = await client.execute({
    sql: "UPDATE auth_users SET code_hmac = ? WHERE id = ?",
    args: [accessCodeHash(newCode), userId],
  });
  return result.rowsAffected > 0;
}

/** Admin fallback: sets a readable temporary password and returns it (shown once). */
export async function adminResetCode(userId: string, client: Client = db()): Promise<string | null> {
  await ensurePasswordSchema(client);
  if (userId === OWNER_ID) return null;
  const temp = `buddy-${randomBytes(2).toString("hex")}-${randomBytes(2).toString("hex")}`;
  const result = await client.execute({
    sql: "UPDATE auth_users SET code_hmac = ?, reset_hmac = NULL, reset_expires_at = NULL WHERE id = ?",
    args: [accessCodeHash(temp), userId],
  });
  return result.rowsAffected > 0 ? temp : null;
}
