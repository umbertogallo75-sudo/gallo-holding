import { createClient } from "@libsql/client";

let client: ReturnType<typeof createClient> | null = null;

export function db() {
  if (client) return client;
  const url = process.env.TURSO_DATABASE_URL;
  const authToken = process.env.TURSO_AUTH_TOKEN;
  if (!url) throw new Error("TURSO_DATABASE_URL is missing");
  client = createClient({ url, authToken });
  return client;
}

export function row<T extends Record<string, unknown>>(value: unknown): T | null {
  return (value as T | undefined) ?? null;
}

export function rows<T extends Record<string, unknown>>(values: unknown[]): T[] {
  return values as T[];
}
