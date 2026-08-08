import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { NextResponse } from "next/server";
import { db } from "@/lib/db";

export const maxDuration = 60;

/**
 * Applies pending db/migrations/*.sql using the server's own database
 * credentials. Same convention as scripts/migrate.mjs (schema_migrations
 * tracking), so the two are interchangeable. Protected by CRON_SECRET.
 * The migration files are bundled via outputFileTracingIncludes.
 */
export async function POST(request: Request) {
  const secret = (process.env.CRON_SECRET ?? "").trim();
  const authorization = (request.headers.get("authorization") ?? "").trim();
  if (!secret || authorization !== `Bearer ${secret}`) {
    return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  }

  const client = db();
  await client.execute(
    "CREATE TABLE IF NOT EXISTS schema_migrations (name TEXT PRIMARY KEY, applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
  );
  const applied = new Set((await client.execute("SELECT name FROM schema_migrations")).rows.map((r) => String(r.name)));

  const dir = join(process.cwd(), "db", "migrations");
  const files = readdirSync(dir).filter((f) => f.endsWith(".sql")).sort();

  const ran: string[] = [];
  for (const file of files) {
    if (applied.has(file)) continue;
    await client.executeMultiple(readFileSync(join(dir, file), "utf8"));
    await client.execute({ sql: "INSERT INTO schema_migrations (name) VALUES (?)", args: [file] });
    ran.push(file);
  }

  return NextResponse.json({ ok: true, applied: ran, alreadyApplied: files.length - ran.length });
}
