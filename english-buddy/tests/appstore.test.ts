import { mkdtempSync, readdirSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { generateKeyPairSync, createVerify } from "node:crypto";
import { createClient, type Client } from "@libsql/client";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

process.env.SESSION_SECRET = "test-secret-that-is-definitely-32-characters-long";
const testKey = generateKeyPairSync("ec", { namedCurve: "P-256" });
const testPrivateKey = testKey.privateKey.export({ type: "pkcs8", format: "pem" }).toString();
process.env.APPSTORE_IAP_ISSUER_ID = "issuer-test";
process.env.APPSTORE_IAP_KEY_ID = "KEYID12345";
process.env.APPSTORE_IAP_PRIVATE_KEY = testPrivateKey;

import { APPLE_PRODUCTS, appStoreConfigured, appStoreServerToken, applyAppleTransaction, decodeJwsPayload, handleNotification, periodEndFor, verifyNotification } from "@/lib/appstore";
import { getBilling, saveBilling } from "@/lib/stripe";

let dir: string;
let client: Client;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "english-buddy-appstore-"));
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

const b64url = (s: string) => Buffer.from(s).toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

describe("App Store purchases", () => {
  it("maps every product to an existing plan", () => {
    expect(APPLE_PRODUCTS["it.execlingo.app.monthly"].plan).toBe("monthly");
    expect(APPLE_PRODUCTS["it.execlingo.app.annual"].plan).toBe("annual");
    expect(APPLE_PRODUCTS["it.execlingo.app.program"].plan).toBe("program");
    expect(APPLE_PRODUCTS["it.execlingo.app.maintenance"].plan).toBe("maintenance");
  });

  it("mints a well-formed ES256 server token", () => {
    const token = appStoreServerToken(1_700_000_000_000);
    const [h, p, s] = token.split(".");
    expect(s.length).toBeGreaterThan(10);
    const header = JSON.parse(Buffer.from(h, "base64").toString());
    const payload = JSON.parse(Buffer.from(p, "base64").toString());
    expect(header).toMatchObject({ alg: "ES256", kid: "KEYID12345" });
    expect(payload).toMatchObject({ iss: "issuer-test", aud: "appstoreconnect-v1", bid: "it.execlingo.app" });
    const verifier = createVerify("SHA256").update(`${h}.${p}`);
    const der = Buffer.from(s.replace(/-/g, "+").replace(/_/g, "/"), "base64");
    expect(verifier.verify({ key: testKey.publicKey, dsaEncoding: "ieee-p1363" }, der)).toBe(true);
  });

  it("keeps complete legacy APPSTORE credentials as an IAP-only fallback", () => {
    delete process.env.APPSTORE_IAP_ISSUER_ID;
    delete process.env.APPSTORE_IAP_KEY_ID;
    delete process.env.APPSTORE_IAP_PRIVATE_KEY;
    process.env.APPSTORE_ISSUER_ID = "legacy-iap-issuer";
    process.env.APPSTORE_KEY_ID = "LEGACYIAP";
    process.env.APPSTORE_PRIVATE_KEY = testPrivateKey;
    try {
      expect(appStoreConfigured()).toBe(true);
      const [, payloadPart] = appStoreServerToken(1_700_000_000_000).split(".");
      expect(JSON.parse(Buffer.from(payloadPart, "base64").toString())).toMatchObject({ iss: "legacy-iap-issuer" });
    } finally {
      delete process.env.APPSTORE_ISSUER_ID;
      delete process.env.APPSTORE_KEY_ID;
      delete process.env.APPSTORE_PRIVATE_KEY;
      process.env.APPSTORE_IAP_ISSUER_ID = "issuer-test";
      process.env.APPSTORE_IAP_KEY_ID = "KEYID12345";
      process.env.APPSTORE_IAP_PRIVATE_KEY = testPrivateKey;
    }
  });

  it("fails closed instead of mixing a partial new IAP key with legacy fields", () => {
    delete process.env.APPSTORE_IAP_KEY_ID;
    delete process.env.APPSTORE_IAP_PRIVATE_KEY;
    process.env.APPSTORE_ISSUER_ID = "legacy-iap-issuer";
    process.env.APPSTORE_KEY_ID = "LEGACYIAP";
    process.env.APPSTORE_PRIVATE_KEY = testPrivateKey;
    try {
      expect(appStoreConfigured()).toBe(false);
      expect(() => appStoreServerToken()).toThrow("IAP credentials are not configured");
    } finally {
      delete process.env.APPSTORE_ISSUER_ID;
      delete process.env.APPSTORE_KEY_ID;
      delete process.env.APPSTORE_PRIVATE_KEY;
      process.env.APPSTORE_IAP_KEY_ID = "KEYID12345";
      process.env.APPSTORE_IAP_PRIVATE_KEY = testPrivateKey;
    }
  });

  it("does not accept reporting credentials as App Store Server API credentials", () => {
    delete process.env.APPSTORE_IAP_ISSUER_ID;
    delete process.env.APPSTORE_IAP_KEY_ID;
    delete process.env.APPSTORE_IAP_PRIVATE_KEY;
    process.env.APPSTORE_REPORTING_ISSUER_ID = "reporting-issuer";
    process.env.APPSTORE_REPORTING_KEY_ID = "REPORTING1";
    process.env.APPSTORE_REPORTING_PRIVATE_KEY = testPrivateKey;
    try {
      expect(appStoreConfigured()).toBe(false);
    } finally {
      delete process.env.APPSTORE_REPORTING_ISSUER_ID;
      delete process.env.APPSTORE_REPORTING_KEY_ID;
      delete process.env.APPSTORE_REPORTING_PRIVATE_KEY;
      process.env.APPSTORE_IAP_ISSUER_ID = "issuer-test";
      process.env.APPSTORE_IAP_KEY_ID = "KEYID12345";
      process.env.APPSTORE_IAP_PRIVATE_KEY = testPrivateKey;
    }
  });

  it("computes period end from Apple expiry or program duration", () => {
    expect(periodEndFor({ productId: "it.execlingo.app.monthly", expiresDate: 1_700_000_000_000 })).toBe(new Date(1_700_000_000_000).toISOString());
    expect(periodEndFor({ productId: "it.execlingo.app.annual", expiresDate: 1_730_000_000_000 })).toBe(new Date(1_730_000_000_000).toISOString());
    const program = periodEndFor({ productId: "it.execlingo.app.program", purchaseDate: 1_700_000_000_000 });
    expect(program).toBe(new Date(1_700_000_000_000 + 98 * 86_400_000).toISOString());
    expect(periodEndFor({ productId: "sconosciuto" })).toBeNull();
  });

  it("decodes a JWS payload without verification", () => {
    const jws = `${b64url(JSON.stringify({ alg: "ES256" }))}.${b64url(JSON.stringify({ transactionId: "t1" }))}.${b64url("sig")}`;
    expect(decodeJwsPayload<{ transactionId: string }>(jws)?.transactionId).toBe("t1");
    expect(decodeJwsPayload("non-un-jws")).toBeNull();
  });

  it("applies a purchase to billing and processes a refund notification", async () => {
    const tx = {
      transactionId: "tx-1",
      originalTransactionId: "orig-1",
      productId: "it.execlingo.app.monthly",
      bundleId: "it.execlingo.app",
      purchaseDate: Date.now(),
      expiresDate: Date.now() + 30 * 86_400_000,
    };
    const applied = await applyAppleTransaction(tx, "user-apple-1", client);
    expect(applied).toMatchObject({ ok: true, plan: "monthly" });
    let billing = await getBilling("user-apple-1", client);
    expect(billing?.plan).toBe("monthly");
    expect(billing?.status).toBe("active");
    expect(billing?.stripeCustomerId).toBe("apple:orig-1");

    // Renewal notification maps back through apple:<originalTransactionId>.
    const renewal = await handleNotification(
      { notificationType: "DID_RENEW", data: { bundleId: "it.execlingo.app", signedTransactionInfo: `${b64url("{}")}.${b64url(JSON.stringify({ ...tx, expiresDate: tx.expiresDate + 30 * 86_400_000 }))}.${b64url("s")}` } },
      client
    );
    expect(renewal.handled).toBe(true);

    const refund = await handleNotification(
      { notificationType: "REFUND", data: { bundleId: "it.execlingo.app", signedTransactionInfo: `${b64url("{}")}.${b64url(JSON.stringify(tx))}.${b64url("s")}` } },
      client
    );
    expect(refund.handled).toBe(true);
    billing = await getBilling("user-apple-1", client);
    expect(billing?.status).toBe("canceled");
  });

  it("rejects replaying one Apple original transaction on a second account", async () => {
    const tx = {
      transactionId: "tx-replay-1",
      originalTransactionId: "orig-owned-by-one-account",
      productId: "it.execlingo.app.annual",
      bundleId: "it.execlingo.app",
      purchaseDate: Date.now(),
      expiresDate: Date.now() + 365 * 86_400_000,
    };

    await expect(applyAppleTransaction(tx, "apple-owner", client))
      .resolves.toEqual({ ok: true, plan: "annual", newlyRecorded: true });
    await expect(applyAppleTransaction({ ...tx, transactionId: "tx-replay-2" }, "apple-attacker", client))
      .resolves.toEqual({ ok: false, error: "owner" });

    const owner = (await client.execute({
      sql: "SELECT user_id FROM store_purchase_owners WHERE provider = 'apple' AND purchase_key = ?",
      args: ["orig-owned-by-one-account"],
    })).rows[0]?.user_id;
    expect(owner).toBe("apple-owner");
    expect(await getBilling("apple-attacker", client)).toBeNull();
  });

  it("rejects transactions for other bundles or unknown products", async () => {
    expect((await applyAppleTransaction({ productId: "it.execlingo.app.monthly", bundleId: "com.altro.app", transactionId: "x" }, "u", client)).ok).toBe(false);
    expect((await applyAppleTransaction({ productId: "prodotto-ignoto", bundleId: "it.execlingo.app", transactionId: "x" }, "u", client)).ok).toBe(false);
  });

  it("rejects notification payloads with invalid signatures", () => {
    const fake = `${b64url(JSON.stringify({ alg: "ES256", x5c: ["AAAA", "BBBB"] }))}.${b64url("{}")}.${b64url("sig")}`;
    expect(verifyNotification(fake)).toBeNull();
    expect(verifyNotification("garbage")).toBeNull();
  });

  it("keeps stripe rows untouched by apple lookups", async () => {
    await saveBilling({ userId: "user-stripe-1", stripeCustomerId: "cus_123", plan: "program", status: "active" }, client);
    const billing = await getBilling("user-stripe-1", client);
    expect(billing?.plan).toBe("program");
  });
});
