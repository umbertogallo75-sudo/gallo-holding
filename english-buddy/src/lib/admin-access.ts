import type { Client } from "@libsql/client";
import { OWNER_ID, type AuthMethod } from "@/lib/auth";
import { db } from "@/lib/db";

const FALLBACK_ADMIN_EMAIL = "umberto.gallo75@gmail.com";

function normaliseEmail(value: string) {
  return value.trim().toLowerCase();
}

/**
 * Admin emails are an explicit allowlist. ADMIN_EMAILS accepts comma,
 * semicolon or newline-separated addresses; when it is absent or empty, the
 * owner's Google account remains the sole email-based administrator.
 */
export function adminEmails(value = process.env.ADMIN_EMAILS): ReadonlySet<string> {
  const configured = (value ?? "")
    .split(/[,;\n]/)
    .map(normaliseEmail)
    .filter((email) => /^[^\s@]+@[^\s@]+$/.test(email));

  return new Set(configured.length > 0 ? configured : [FALLBACK_ADMIN_EMAIL]);
}

/**
 * Server-side admin check. The legacy owner id is always accepted; every
 * other session must resolve to an exact email in the explicit allowlist.
 * Database errors fail closed.
 */
export async function isAdminUser(
  userId: string | null | undefined,
  authMethod: AuthMethod,
  client?: Client,
  allowedEmails: ReadonlySet<string> = adminEmails()
): Promise<boolean> {
  if (!userId) return false;
  if (userId === OWNER_ID) return true;

  try {
    const result = await (client ?? db()).execute({
      sql: "SELECT email, google_sub, code_hmac FROM auth_users WHERE id = ? LIMIT 1",
      args: [userId],
    });
    const row = result.rows[0];
    const email = row?.email;
    const providerVerified = typeof row?.google_sub === "string" && row.google_sub.length > 0;
    const currentGoogleSession = authMethod === "google";
    const preUpgradeGoogleSession = authMethod === "legacy" && String(row?.code_hmac ?? "").startsWith("oauth:");
    return (
      typeof email === "string" &&
      allowedEmails.has(normaliseEmail(email)) &&
      providerVerified &&
      (currentGoogleSession || preUpgradeGoogleSession)
    );
  } catch {
    return false;
  }
}
