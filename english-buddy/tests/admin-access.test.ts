import { createClient, type Client } from "@libsql/client";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { adminEmails, isAdminUser } from "@/lib/admin-access";

let client: Client;

beforeEach(async () => {
  client = createClient({ url: ":memory:" });
  await client.execute("CREATE TABLE auth_users (id TEXT PRIMARY KEY, email TEXT, google_sub TEXT, code_hmac TEXT)");
  await client.execute({
    sql: "INSERT INTO auth_users (id, email, google_sub, code_hmac) VALUES (?, ?, ?, ?), (?, ?, ?, ?), (?, ?, ?, ?)",
    args: [
      "umberto-google", "Umberto.Gallo75@GMAIL.COM", "google-owner-sub", "oauth:generated",
      "other-user", "other@example.com", "google-other-sub", "oauth:generated",
      "spoofed-email", "umberto.gallo75@gmail.com", null, "password-hash",
    ],
  });
});

afterEach(() => client.close());

describe("admin access", () => {
  it("always authorizes the legacy owner id", async () => {
    expect(await isAdminUser("owner", "password", client, new Set())).toBe(true);
  });

  it("authorizes Umberto only through a verified Google session", async () => {
    expect(adminEmails("")).toEqual(new Set(["umberto.gallo75@gmail.com"]));
    expect(await isAdminUser("umberto-google", "google", client, adminEmails(""))).toBe(true);
    expect(await isAdminUser("umberto-google", "password", client, adminEmails(""))).toBe(false);
    expect(await isAdminUser("spoofed-email", "google", client, adminEmails(""))).toBe(false);
  });

  it("does not authorize any other account", async () => {
    expect(await isAdminUser("other-user", "google", client, adminEmails(""))).toBe(false);
    expect(await isAdminUser("missing-user", "google", client, adminEmails(""))).toBe(false);
    expect(await isAdminUser(null, "google", client, adminEmails(""))).toBe(false);
  });

  it("supports an explicit ADMIN_EMAILS allowlist", async () => {
    const allowed = adminEmails("other@example.com; second@example.com");
    expect(await isAdminUser("other-user", "google", client, allowed)).toBe(true);
    expect(await isAdminUser("umberto-google", "google", client, allowed)).toBe(false);
  });

  it("accepts a pre-upgrade token only for an account originally created by Google", async () => {
    expect(await isAdminUser("umberto-google", "legacy", client, adminEmails(""))).toBe(true);
    expect(await isAdminUser("spoofed-email", "legacy", client, adminEmails(""))).toBe(false);
  });
});
