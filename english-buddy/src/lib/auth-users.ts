import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { accessCodeHash, OWNER_ID } from "@/lib/auth";

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
