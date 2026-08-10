import { createPrivateKey } from "node:crypto";
import { NextResponse } from "next/server";
import { appleClientSecret } from "@/lib/oauth";

/**
 * Configuration self-check for Sign in with Apple. Returns only booleans,
 * lengths and error messages — never any secret material.
 */
export async function GET() {
  const raw = process.env.APPLE_PRIVATE_KEY ?? "";
  const normalized = raw.replace(/\\n/g, "\n");
  const report: Record<string, unknown> = {
    clientId: Boolean(process.env.APPLE_CLIENT_ID),
    teamIdLength: (process.env.APPLE_TEAM_ID ?? "").trim().length,
    keyIdLength: (process.env.APPLE_KEY_ID ?? "").trim().length,
    keyLength: raw.length,
    keyLines: normalized.split("\n").filter(Boolean).length,
    hasBegin: normalized.includes("-----BEGIN PRIVATE KEY-----"),
    hasEnd: normalized.includes("-----END PRIVATE KEY-----"),
    hasLiteralBackslashN: raw.includes("\\n"),
    startsWithQuote: raw.trimStart().startsWith('"') || raw.trimStart().startsWith("'"),
  };
  try {
    const key = createPrivateKey(normalized);
    report.keyParses = true;
    report.keyType = key.asymmetricKeyType;
  } catch (error) {
    report.keyParses = false;
    report.parseError = error instanceof Error ? error.message.slice(0, 200) : "unknown";
  }
  try {
    appleClientSecret();
    report.secretSigns = true;
  } catch (error) {
    report.secretSigns = false;
    report.signError = error instanceof Error ? error.message.slice(0, 200) : "unknown";
  }
  return NextResponse.json(report);
}
