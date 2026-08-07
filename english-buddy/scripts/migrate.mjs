#!/usr/bin/env node
/**
 * Applies db/migrations/*.sql in order against the configured libSQL database.
 * Tracks applied files in schema_migrations so re-running is safe.
 *
 * Usage:
 *   npm run db:migrate                    (uses .env.local / environment)
 *   TURSO_DATABASE_URL=file:local.db npm run db:migrate
 */
import { createClient } from "@libsql/client";
import { readFileSync, readdirSync, existsSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

// Minimal .env.local loader so the script works without extra dependencies.
for (const file of [".env.local", ".env"]) {
  const path = join(root, file);
  if (!existsSync(path)) continue;
  for (const line of readFileSync(path, "utf8").split("\n")) {
    const match = line.match(/^\s*([A-Z0-9_]+)\s*=\s*(.*)\s*$/);
    if (match && !(match[1] in process.env)) {
      process.env[match[1]] = match[2].replace(/^["']|["']$/g, "");
    }
  }
}

const url = process.env.TURSO_DATABASE_URL;
if (!url) {
  console.error("TURSO_DATABASE_URL is not set (in the environment or .env.local).");
  process.exit(1);
}

const client = createClient({ url, authToken: process.env.TURSO_AUTH_TOKEN });

await client.execute(
  "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
);

const applied = new Set(
  (await client.execute("SELECT name FROM schema_migrations")).rows.map((r) => r.name)
);

const dir = join(root, "db", "migrations");
const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

let ran = 0;
for (const file of files) {
  if (applied.has(file)) continue;
  const sql = readFileSync(join(dir, file), "utf8");
  console.log(`Applying ${file}…`);
  await client.executeMultiple(sql);
  await client.execute({ sql: "INSERT INTO schema_migrations (name) VALUES (?)", args: [file] });
  ran++;
}

console.log(ran ? `Done. Applied ${ran} migration(s).` : "Database already up to date.");
client.close();
