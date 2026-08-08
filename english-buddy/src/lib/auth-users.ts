import { randomBytes, randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { accessCodeHash, resetTokenHash, OWNER_ID } from "@/lib/auth";

/**
 * Account store for invite-based multi-user access. Every function takes an
 * optional client so tests can run against a local file database.
 */

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

export async function createAuthUser(name: string, code: string, email: string | null = null, client: Client = db()): Promise<string> {
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

/** Sets a new access code for a valid, unexpired reset token. Returns the user id. */
export async function resetCodeWithToken(token: string, newCode: string, client: Client = db()): Promise<string | null> {
  const result = await client.execute({
    sql: "SELECT id, reset_expires_at FROM auth_users WHERE reset_hmac = ? LIMIT 1",
    args: [resetTokenHash(token)],
  });
  const row = result.rows[0];
  if (!row) return null;
  if (!row.reset_expires_at || Date.parse(String(row.reset_expires_at)) < Date.now()) return null;
  if (await accessCodeInUse(newCode, client)) return null;
  await client.execute({
    sql: "UPDATE auth_users SET code_hmac = ?, reset_hmac = NULL, reset_expires_at = NULL WHERE id = ?",
    args: [accessCodeHash(newCode), String(row.id)],
  });
  return String(row.id);
}

/** Changes a registered user's code (the env-based owner code lives in Vercel). */
export async function updateAccessCode(userId: string, newCode: string, client: Client = db()): Promise<boolean> {
  if (userId === OWNER_ID) return false;
  if (await accessCodeInUse(newCode, client)) return false;
  const result = await client.execute({
    sql: "UPDATE auth_users SET code_hmac = ? WHERE id = ?",
    args: [accessCodeHash(newCode), userId],
  });
  return result.rowsAffected > 0;
}

/** Admin fallback: sets a readable temporary code and returns it (shown once). */
export async function adminResetCode(userId: string, client: Client = db()): Promise<string | null> {
  if (userId === OWNER_ID) return null;
  for (let attempt = 0; attempt < 5; attempt++) {
    const temp = `buddy-${randomBytes(2).toString("hex")}-${randomBytes(2).toString("hex")}`;
    if (await accessCodeInUse(temp, client)) continue;
    const result = await client.execute({
      sql: "UPDATE auth_users SET code_hmac = ?, reset_hmac = NULL, reset_expires_at = NULL WHERE id = ?",
      args: [accessCodeHash(temp), userId],
    });
    return result.rowsAffected > 0 ? temp : null;
  }
  return null;
}
