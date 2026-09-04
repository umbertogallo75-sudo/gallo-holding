import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";

import { baseUrl, createOauthState, verifyOauthState, findOrCreateOAuthUser, decodeIdToken, validClaims } from "@/lib/oauth";
import { createAuthUser } from "@/lib/auth-users";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-oauth-"));
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

describe("social sign-in", () => {
  it("keeps the canonical www host when APP_BASE_URL is absent", () => {
    const configured = process.env.APP_BASE_URL;
    delete process.env.APP_BASE_URL;
    try {
      expect(baseUrl()).toBe("https://www.execlingo.it");
    } finally {
      if (configured === undefined) delete process.env.APP_BASE_URL;
      else process.env.APP_BASE_URL = configured;
    }
  });

  it("signs and verifies CSRF state, rejecting tampered or stale values", () => {
    const state = createOauthState();
    expect(verifyOauthState(state)).toBe(true);
    expect(verifyOauthState(state + "x")).toBe(false);
    expect(verifyOauthState(null)).toBe(false);
    const old = createOauthState(Date.now() - 11 * 60_000);
    expect(verifyOauthState(old)).toBe(false);
  });

  it("creates an account on first Google login and reuses it afterwards", async () => {
    const first = await findOrCreateOAuthUser("google", "goog-sub-1", "mario@example.com", "Mario Rossi", client);
    const again = await findOrCreateOAuthUser("google", "goog-sub-1", "mario@example.com", "Mario Rossi", client);
    expect(again.userId).toBe(first.userId);
    // Only the first click is a registration: the second is a login, and
    // counting it would inflate every acquisition number downstream.
    expect(first.created).toBe(true);
    expect(again.created).toBe(false);
    const row = (await client.execute({ sql: "SELECT display_name, email FROM auth_users WHERE id = ?", args: [first.userId] })).rows[0];
    expect(String(row.display_name)).toBe("Mario Rossi");
    expect(String(row.email)).toBe("mario@example.com");
  });

  it("links a provider to an existing code-based account via email", async () => {
    const existing = await createAuthUser("Lucia", "codice-di-lucia-123", "lucia@example.com", client);
    const linked = await findOrCreateOAuthUser("apple", "apple-sub-9", "lucia@example.com", null, client);
    expect(linked.userId).toBe(existing);
    // An existing customer adding a second way in, not a new one.
    expect(linked.created).toBe(false);
    const row = (await client.execute({ sql: "SELECT apple_sub FROM auth_users WHERE id = ?", args: [existing] })).rows[0];
    expect(String(row.apple_sub)).toBe("apple-sub-9");
  });

  it("validates id_token claims strictly", () => {
    const payload = Buffer.from(JSON.stringify({ sub: "s1", aud: "client-1", iss: "https://accounts.google.com", exp: Math.floor(Date.now() / 1000) + 60 })).toString("base64url");
    const claims = decodeIdToken(`x.${payload}.y`);
    expect(validClaims(claims, "client-1", ["https://accounts.google.com"])).toBe(true);
    expect(validClaims(claims, "other-client", ["https://accounts.google.com"])).toBe(false);
    expect(validClaims(claims, "client-1", ["https://appleid.apple.com"])).toBe(false);
    expect(validClaims(null, "client-1", ["https://accounts.google.com"])).toBe(false);
  });
});
