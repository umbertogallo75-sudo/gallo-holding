import { createClient, type Client } from "@libsql/client";
import { afterEach, describe, expect, it } from "vitest";
import { claimStorePurchase, storePurchaseOwner } from "@/lib/store-purchases";

let client: Client | null = null;

function memoryClient(): Client {
  client = createClient({ url: ":memory:" });
  return client;
}

afterEach(() => {
  client?.close();
  client = null;
});

describe("store purchase ownership", () => {
  it("self-creates its ledger and returns null for an unclaimed transaction", async () => {
    const db = memoryClient();

    await expect(storePurchaseOwner("apple", "original-new", db)).resolves.toBeNull();
  });

  it("keeps the first account as owner and rejects replay by another account", async () => {
    const db = memoryClient();

    await expect(claimStorePurchase("apple", "original-1", "user-a", "monthly", db)).resolves.toBe(true);
    await expect(claimStorePurchase("apple", "original-1", "user-a", "annual", db)).resolves.toBe(true);
    await expect(claimStorePurchase("apple", "original-1", "user-b", "monthly", db)).resolves.toBe(false);
    await expect(storePurchaseOwner("apple", "original-1", db)).resolves.toBe("user-a");

    const row = (await db.execute({
      sql: "SELECT user_id, product_id FROM store_purchase_owners WHERE provider = ? AND purchase_key = ?",
      args: ["apple", "original-1"],
    })).rows[0];
    expect(row).toMatchObject({ user_id: "user-a", product_id: "annual" });
  });

  it("namespaces identical transaction keys by store provider", async () => {
    const db = memoryClient();

    await expect(claimStorePurchase("apple", "shared-key", "apple-user", "monthly", db)).resolves.toBe(true);
    await expect(claimStorePurchase("google", "shared-key", "google-user", "monthly", db)).resolves.toBe(true);
    await expect(storePurchaseOwner("apple", "shared-key", db)).resolves.toBe("apple-user");
    await expect(storePurchaseOwner("google", "shared-key", db)).resolves.toBe("google-user");
  });
});
