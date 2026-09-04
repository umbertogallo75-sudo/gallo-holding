import { createClient } from "@libsql/client";
import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it } from "vitest";
import { COACH_MODES, MODE_MINUTES } from "@/lib/learning/modes";
import { countPagesRoughly, MAX_BYTES, MAX_PAGES, trainingContext, type DocAnalysis } from "@/lib/documents/analyse";
import {
  deleteDocument,
  documentsForEvent,
  ensureDocumentSchema,
  listDocuments,
  readDocument,
  resetDocumentSchemaCache,
  saveDocument,
} from "@/lib/documents/store";

const client = createClient({ url: ":memory:" });

beforeEach(async () => {
  await client.execute("DROP TABLE IF EXISTS documents");
  resetDocumentSchemaCache();
  await ensureDocumentSchema(client);
});

const analysis: DocAnalysis = {
  pages: 4,
  titleIt: "Offerta fornitura Q3",
  summaryIt: "Prezzo a 12 euro, consegna a giugno, pagamento a 60 giorni.",
  kind: "offerta",
  terms: [{ term: "lead time", meaning: "tempo di consegna" }],
  questions: ["Can you hold that price for twelve months?"],
  scenario: "You are the supplier; the user must defend the price.",
};

describe("i documenti su cui ci si allena", () => {
  it("keeps each person's documents to themselves", async () => {
    const mine = await saveDocument("u1", "offerta.pdf", analysis, null, client);
    await saveDocument("u2", "altro.pdf", analysis, null, client);
    expect((await listDocuments("u1", client)).map((d) => d.id)).toEqual([mine]);
    expect(await readDocument(mine, "u2", client)).toBeNull();
    expect(await readDocument(mine, "u1", client)).not.toBeNull();
  });

  it("refuses to delete somebody else's", async () => {
    const mine = await saveDocument("u1", "offerta.pdf", analysis, null, client);
    await deleteDocument(mine, "u2", client);
    expect(await readDocument(mine, "u1", client)).not.toBeNull();
  });

  it("finds the documents attached to an appointment", async () => {
    await saveDocument("u1", "a.pdf", analysis, "evt-1", client);
    await saveDocument("u1", "b.pdf", analysis, null, client);
    expect(await documentsForEvent("evt-1", "u1", client)).toHaveLength(1);
    expect(await documentsForEvent("evt-1", "u2", client)).toHaveLength(0);
  });

  it("survives a stored analysis it cannot read", async () => {
    // Better a missing row than a document that opens onto nothing.
    await client.execute({
      sql: "INSERT INTO documents (id, user_id, filename, pages, analysis_json, created_at) VALUES ('x','u1','a.pdf',1,'not json','2026-01-01')",
      args: [],
    });
    expect(await listDocuments("u1", client)).toHaveLength(0);
  });
});

describe("il materiale che finisce nella lezione", () => {
  it("carries the words, the questions and the scene", () => {
    const context = trainingContext(analysis);
    expect(context).toContain("lead time");
    expect(context).toContain("tempo di consegna");
    expect(context).toContain("Can you hold that price");
    expect(context).toContain(analysis.scenario);
    // And the instruction that stops it drifting into a generic lesson.
    expect(context).toContain("Do not drift");
  });

  it("is a mode the coach API will accept", () => {
    // The drift that once rejected somebody's very first session: a mode the
    // client can ask for and the server has never heard of.
    expect(COACH_MODES as readonly string[]).toContain("doc");
    expect(MODE_MINUTES.doc).toBeGreaterThan(0);
    expect(readFileSync("src/lib/ai/prompt.ts", "utf8")).toContain("doc: `Session built on a document");
  });
});

describe("quanto documento accettiamo", () => {
  it("counts pages when the file says so, and admits when it does not", () => {
    const three = Buffer.from("%PDF-1.4 /Type /Page x /Type /Page y /Type /Page z /Type /Pages", "latin1");
    expect(countPagesRoughly(three)).toBe(3);
    // A compressed PDF gives nothing away — and guessing would refuse good files.
    expect(countPagesRoughly(Buffer.from("%PDF-1.7 compressed object streams"))).toBeNull();
  });

  it("does not count the page tree as a page", () => {
    expect(countPagesRoughly(Buffer.from("/Type /Pages /Type /Pages", "latin1"))).toBeNull();
  });

  it("keeps the limits somewhere both the server and the screen can read them", () => {
    expect(MAX_PAGES).toBe(10);
    expect(MAX_BYTES).toBeGreaterThan(1_000_000);
    expect(readFileSync("src/app/documenti/Upload.tsx", "utf8")).toContain("MAX_PAGES");
  });
});
