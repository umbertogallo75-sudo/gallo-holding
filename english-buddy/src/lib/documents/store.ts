import { randomUUID } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import type { DocAnalysis } from "./analyse";

/**
 * The documents somebody trains on, minus the documents.
 *
 * Only what was made from the file is kept: the summary, the vocabulary, the
 * questions. The file itself is read once, in memory, and never written
 * anywhere — which is the honest answer to "where does my contract end up",
 * and it is also the only answer that stays true when nobody is looking.
 */

const SCHEMA = `CREATE TABLE IF NOT EXISTS documents (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  event_id TEXT,
  filename TEXT,
  pages INTEGER,
  analysis_json TEXT NOT NULL,
  created_at TEXT NOT NULL
);
CREATE INDEX IF NOT EXISTS idx_documents_user ON documents(user_id, created_at DESC);`;

let ensured = false;

export async function ensureDocumentSchema(client: Client = db()): Promise<void> {
  if (ensured) return;
  try {
    await client.execute("SELECT event_id FROM documents LIMIT 0");
    ensured = true;
    return;
  } catch {
    /* first use, or a table from before documents could belong to an event */
  }
  for (const statement of SCHEMA.split(";")) {
    const sql = statement.trim();
    if (sql) await client.execute(sql);
  }
  await client.execute("ALTER TABLE documents ADD COLUMN event_id TEXT").catch(() => {});
  ensured = true;
}

/** Only for tests, which rebuild the database between cases. */
export function resetDocumentSchemaCache(): void {
  ensured = false;
}

export type StoredDoc = {
  id: string;
  filename: string;
  pages: number;
  createdAt: string;
  eventId: string | null;
  analysis: DocAnalysis;
};

function toDoc(row: Record<string, unknown>): StoredDoc | null {
  try {
    return {
      id: String(row.id),
      filename: String(row.filename ?? ""),
      pages: Number(row.pages ?? 0),
      createdAt: String(row.created_at ?? ""),
      eventId: row.event_id ? String(row.event_id) : null,
      analysis: JSON.parse(String(row.analysis_json)) as DocAnalysis,
    };
  } catch {
    // A row whose analysis will not parse is worse than no row: it would show
    // as a document that opens onto nothing.
    return null;
  }
}

export async function saveDocument(
  userId: string,
  filename: string,
  analysis: DocAnalysis,
  eventId: string | null = null,
  client: Client = db()
): Promise<string> {
  await ensureDocumentSchema(client);
  const id = randomUUID();
  await client.execute({
    sql: `INSERT INTO documents (id, user_id, event_id, filename, pages, analysis_json, created_at)
          VALUES (?, ?, ?, ?, ?, ?, ?)`,
    args: [id, userId, eventId, filename.slice(0, 200), analysis.pages, JSON.stringify(analysis), new Date().toISOString()],
  });
  return id;
}

export async function listDocuments(userId: string, client: Client = db()): Promise<StoredDoc[]> {
  await ensureDocumentSchema(client);
  const result = await client.execute({
    sql: "SELECT * FROM documents WHERE user_id = ? ORDER BY created_at DESC LIMIT 50",
    args: [userId],
  });
  return result.rows.map((row) => toDoc(row as unknown as Record<string, unknown>)).filter((d): d is StoredDoc => d !== null);
}

export async function readDocument(id: string, userId: string, client: Client = db()): Promise<StoredDoc | null> {
  await ensureDocumentSchema(client);
  const result = await client.execute({
    sql: "SELECT * FROM documents WHERE id = ? AND user_id = ? LIMIT 1",
    args: [id, userId],
  });
  return result.rows.length ? toDoc(result.rows[0] as unknown as Record<string, unknown>) : null;
}

export async function documentsForEvent(eventId: string, userId: string, client: Client = db()): Promise<StoredDoc[]> {
  await ensureDocumentSchema(client);
  const result = await client.execute({
    sql: "SELECT * FROM documents WHERE event_id = ? AND user_id = ? ORDER BY created_at DESC",
    args: [eventId, userId],
  });
  return result.rows.map((row) => toDoc(row as unknown as Record<string, unknown>)).filter((d): d is StoredDoc => d !== null);
}

export async function deleteDocument(id: string, userId: string, client: Client = db()): Promise<void> {
  await client.execute({ sql: "DELETE FROM documents WHERE id = ? AND user_id = ?", args: [id, userId] });
}
