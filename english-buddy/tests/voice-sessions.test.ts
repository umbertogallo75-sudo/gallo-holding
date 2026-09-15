import type { Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
  appendVoiceLines,
  ensureVoiceSession,
  resumeVoiceSession,
  voiceRecap,
} from "@/lib/learning/voice-sessions";

/**
 * A spoken call is saved by flushes that nobody can acknowledge — the last one
 * leaves on a beacon while the phone is locking. So the two properties that
 * matter are not about SQL: writing the same flush twice must change nothing,
 * and an id that is not yours must never be written into.
 */
type Query = { sql: string; args: unknown[] };

function fake(rowsFor: (sql: string, args: unknown[]) => Record<string, unknown>[]) {
  const queries: Query[] = [];
  const client = {
    execute: async (q: { sql: string; args?: unknown[] } | string) => {
      const sql = typeof q === "string" ? q : q.sql;
      const args = typeof q === "string" ? [] : (q.args ?? []);
      queries.push({ sql, args });
      return { rows: rowsFor(sql, args) };
    },
    batch: async (statements: { sql: string; args: unknown[] }[]) => {
      for (const s of statements) queries.push({ sql: s.sql, args: s.args });
      return statements.map(() => ({ rows: [] }));
    },
  } as unknown as Client;
  return { client, queries };
}

const MINE = "11111111-2222-3333-4444-555555555555";
const THEIRS = "99999999-8888-7777-6666-555555555555";

describe("ensureVoiceSession", () => {
  it("writes into the id the call chose, so a repeated flush finds the same row", async () => {
    const { client, queries } = fake((sql) => (/SELECT id FROM sessions/.test(sql) ? [{ id: MINE }] : []));
    expect(await ensureVoiceSession("u1", "voice", MINE, client)).toBe(MINE);
    // Nothing was created: the row was already there and belonged to them.
    expect(queries.some((q) => /INSERT/.test(q.sql))).toBe(false);
  });

  it("creates the row on the first flush, not when the call starts", async () => {
    let exists = false;
    const { client, queries } = fake((sql) => {
      if (/SELECT id FROM sessions/.test(sql)) return exists ? [{ id: MINE }] : [];
      if (/INSERT OR IGNORE INTO sessions/.test(sql)) exists = true;
      return [];
    });
    const id = await ensureVoiceSession("u1", "voice", MINE, client);
    expect(id).toBe(MINE);
    const insert = queries.find((q) => /INSERT OR IGNORE INTO sessions/.test(q.sql));
    expect(insert?.args[0]).toBe(MINE);
    expect(insert?.args[2]).toBe("voice");
  });

  it("never writes into somebody else's session", async () => {
    // Their row exists and is not ours, so OR IGNORE leaves it alone and the
    // ownership check keeps coming back empty.
    const { client, queries } = fake(() => []);
    const id = await ensureVoiceSession("u1", "voice", THEIRS, client);
    expect(id).not.toBe(THEIRS);
    expect(id.length).toBeGreaterThan(20);
    const inserts = queries.filter((q) => /INSERT OR IGNORE INTO sessions/.test(q.sql));
    expect(inserts[inserts.length - 1].args[0]).toBe(id);
  });

  it("refuses an id that is not shaped like one", async () => {
    const { client } = fake(() => []);
    const id = await ensureVoiceSession("u1", "voice", "'; DROP TABLE sessions--", client);
    expect(id).toMatch(/^[0-9a-f-]{36}$/);
  });

  it("keeps the spoken diary apart from an ordinary call", async () => {
    const { client, queries } = fake(() => []);
    await ensureVoiceSession("u1", "diary", null, client);
    expect(queries.find((q) => /INSERT OR IGNORE INTO sessions/.test(q.sql))?.args[2]).toBe("diary");
    const other = fake(() => []);
    await ensureVoiceSession("u1", "guided", null, other.client);
    // A written mode arriving here is a bug upstream, not a new kind of call.
    expect(other.queries.find((q) => /INSERT OR IGNORE INTO sessions/.test(q.sql))?.args[2]).toBe("voice");
  });
});

describe("appendVoiceLines", () => {
  it("derives row ids from the line numbers, so the same flush twice writes the same rows", async () => {
    const first = fake(() => []);
    await appendVoiceLines("u1", MINE, "b", 4, [{ role: "you", text: "I go to Milan" }, { role: "coach", text: "I went!" }], first.client);
    const second = fake(() => []);
    await appendVoiceLines("u1", MINE, "b", 4, [{ role: "you", text: "I go to Milan" }, { role: "coach", text: "I went!" }], second.client);

    const ids = (q: Query[]) => q.filter((x) => /INSERT OR IGNORE INTO messages/.test(x.sql)).map((x) => x.args[0]);
    expect(ids(first.queries)).toEqual([`${MINE}-b-4`, `${MINE}-b-5`]);
    expect(ids(second.queries)).toEqual(ids(first.queries));
    expect(first.queries.every((q) => /INSERT OR IGNORE/.test(q.sql))).toBe(true);
  });

  it("does not let the second half of a conversation overwrite the first", async () => {
    // Both legs number their lines from zero. Without a namespace each, line 0
    // of the resumed call would claim the row line 0 of the first call has,
    // and OR IGNORE would drop it — losing lines in the name of not
    // duplicating them.
    const first = fake(() => []);
    await appendVoiceLines("u1", MINE, "aa11", 0, [{ role: "you", text: "Before the phone rang" }], first.client);
    const second = fake(() => []);
    await appendVoiceLines("u1", MINE, "bb22", 0, [{ role: "you", text: "After I came back" }], second.client);
    const id = (q: Query[]) => q.find((x) => /INSERT OR IGNORE INTO messages/.test(x.sql))?.args[0];
    expect(id(first.queries)).not.toBe(id(second.queries));
  });

  it("reduces whatever it is given as a leg to something safe", async () => {
    const { queries, client } = fake(() => []);
    await appendVoiceLines("u1", MINE, "../../etc/passwd", 0, [{ role: "you", text: "hi" }], client);
    expect(String(queries[0].args[0])).toBe(`${MINE}-etcpasswd-0`);
    const empty = fake(() => []);
    await appendVoiceLines("u1", MINE, "", 0, [{ role: "you", text: "hi" }], empty.client);
    expect(String(empty.queries[0].args[0])).toBe(`${MINE}-a-0`);
  });

  it("stores the learner as the author of their own words", async () => {
    const { queries, client } = fake(() => []);
    await appendVoiceLines("u1", MINE, "a", 0, [{ role: "you", text: "hello" }, { role: "coach", text: "hi" }], client);
    expect(queries.map((q) => q.args[3])).toEqual(["user", "assistant"]);
  });

  it("keeps the lines in the order they were spoken", async () => {
    const { queries, client } = fake(() => []);
    await appendVoiceLines("u1", MINE, "a", 0, [
      { role: "you", text: "one" },
      { role: "coach", text: "two" },
      { role: "you", text: "three" },
    ], client);
    const times = queries.map((q) => String(q.args[5]));
    expect([...times].sort()).toEqual(times);
    expect(new Set(times).size).toBe(3);
  });

  it("does nothing at all when there is nothing to save", async () => {
    const { queries, client } = fake(() => []);
    expect(await appendVoiceLines("u1", MINE, "a", 0, [], client)).toBe(0);
    expect(queries).toHaveLength(0);
  });
});

describe("resumeVoiceSession", () => {
  const now = new Date().toISOString();

  function withSession(row: Record<string, unknown> | null, spoken = true) {
    return fake((sql) => {
      if (/SELECT id, mode, started_at FROM sessions/.test(sql)) return row ? [row] : [];
      if (/SELECT role, content FROM messages/.test(sql)) {
        return spoken
          ? [
              { role: "assistant", content: "And then?" },
              { role: "user", content: "I met the client" },
            ]
          : [];
      }
      return [];
    });
  }

  it("gives back the conversation with its tail the right way round", async () => {
    const { client } = withSession({ id: MINE, mode: "voice", started_at: now });
    const found = await resumeVoiceSession("u1", MINE, client);
    expect(found?.id).toBe(MINE);
    // The query reads newest-first; what Sam is given must read oldest-first.
    expect(found?.recap.map((l) => l.text)).toEqual(["I met the client", "And then?"]);
    expect(found?.recap[0].role).toBe("you");
  });

  it("marks it unfinished again, because somebody came back to it", async () => {
    const { client, queries } = withSession({ id: MINE, mode: "voice", started_at: now });
    await resumeVoiceSession("u1", MINE, client);
    expect(queries.some((q) => /SET ended_at = NULL/.test(q.sql))).toBe(true);
  });

  it("refuses a written conversation — that is not something to resume at the microphone", async () => {
    const { client } = withSession({ id: MINE, mode: "guided", started_at: now });
    expect(await resumeVoiceSession("u1", MINE, client)).toBeNull();
  });

  it("refuses one that is too old to be picking up", async () => {
    const old = new Date(Date.now() - 5 * 86_400_000).toISOString();
    const { client } = withSession({ id: MINE, mode: "voice", started_at: old });
    expect(await resumeVoiceSession("u1", MINE, client)).toBeNull();
  });

  it("refuses one that is not this learner's", async () => {
    const { client } = withSession(null);
    expect(await resumeVoiceSession("u1", THEIRS, client)).toBeNull();
  });

  it("offers nothing back when nothing was ever said", async () => {
    const { client } = withSession({ id: MINE, mode: "voice", started_at: now }, false);
    expect(await resumeVoiceSession("u1", MINE, client)).toBeNull();
  });
});

describe("voiceRecap", () => {
  it("survives a database that cannot answer", async () => {
    const client = { execute: async () => { throw new Error("down"); } } as unknown as Client;
    expect(await voiceRecap("x", 8, client)).toEqual([]);
  });
});
