import type { Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import {
  closeSession,
  recentSessions,
  resumableSession,
  sessionReport,
  sessionTranscript,
} from "@/lib/learning/sessions";

/**
 * The part worth proving is not the SQL, it is what happens on a database
 * that has not run the migration yet.
 *
 * closed_at arrives with 0028. Production runs the new code the moment the
 * deploy lands, which is before anybody applies the migration. If the missing
 * column threw, the first thing a returning learner would see is an error on
 * the screen that exists to stop them losing their place — the feature would
 * fail exactly in the situation it was built for.
 */
type Call = { sql: string; args: unknown[] };

/**
 * `canAlter` is the difference between the two databases this has to work on:
 * one where adding the column succeeds (production, before anybody runs the
 * migration) and one where it does not (a read-only replica), where the read
 * still has to answer instead of throwing.
 */
function fakeClient(
  rowsFor: (sql: string) => Record<string, unknown>[],
  opts: { missingColumn?: boolean; canAlter?: boolean } = {}
) {
  const { missingColumn = false, canAlter = true } = opts;
  let hasColumn = !missingColumn;
  const calls: Call[] = [];
  const client = {
    execute: async (q: { sql: string; args: unknown[] } | string) => {
      const sql = typeof q === "string" ? q : q.sql;
      calls.push({ sql, args: typeof q === "string" ? [] : q.args });
      if (/ALTER TABLE/.test(sql)) {
        if (!canAlter) throw new Error("read-only");
        hasColumn = true;
        return { rows: [] };
      }
      if (!hasColumn && /closed_at/.test(sql) && !/NULL AS closed_at/.test(sql)) {
        throw new Error("no such column: closed_at");
      }
      return { rows: rowsFor(sql) };
    },
  } as unknown as Client;
  return { client, calls };
}

const session = {
  id: "s1",
  mode: "guided",
  started_at: "2026-09-14T09:00:00.000Z",
  closed_at: null,
  last_at: "2026-09-14T09:12:00.000Z",
  turns: 8,
  first_user: "We had the budget meeting yesterday",
  first_coach: "Tell me how it went!",
};

describe("resumableSession", () => {
  it("offers back the session that was left open", async () => {
    const { client, calls } = fakeClient(() => [session]);
    const found = await resumableSession("u1", {}, client);
    expect(found?.id).toBe("s1");
    expect(found?.exchanges).toBe(8);
    expect(calls[0].sql).toContain("s.closed_at IS NULL");
  });

  it("adds the missing column itself rather than waiting for the migration", async () => {
    const { client, calls } = fakeClient(() => [session], { missingColumn: true });
    const found = await resumableSession("u1", {}, client);
    expect(found?.id).toBe("s1");
    expect(calls[1].sql).toContain("ALTER TABLE sessions ADD COLUMN closed_at");
    expect(calls[2].sql).toContain("s.closed_at IS NULL");
  });

  it("still answers when it cannot add the column either", async () => {
    const { client, calls } = fakeClient(() => [session], { missingColumn: true, canAlter: false });
    const found = await resumableSession("u1", {}, client);
    expect(found?.id).toBe("s1");
    expect(calls[calls.length - 1].sql).not.toContain("s.closed_at IS NULL");
  });

  it("offers nothing when there is nothing to come back to", async () => {
    const { client } = fakeClient(() => []);
    expect(await resumableSession("u1", {}, client)).toBeNull();
  });
});

describe("what a row in the archive says", () => {
  it("shows the first thing the learner actually said", async () => {
    const { client } = fakeClient(() => [session]);
    const [row] = await recentSessions("u1", {}, client);
    expect(row.preview).toBe("We had the budget meeting yesterday");
    expect(row.minutes).toBe(12);
  });

  it("falls back to Sam's answer when the first line is the old instruction", async () => {
    // Conversations recorded before the instruction stopped being stored open
    // with a sentence in English nobody wrote. Showing it as the preview is
    // exactly what made the list unreadable.
    const { client } = fakeClient(() => [
      { ...session, first_user: "Start a short natural English conversation with me." },
    ]);
    const [row] = await recentSessions("u1", {}, client);
    expect(row.preview).toBe("Tell me how it went!");
  });

  it("counts turns taken, not messages exchanged", async () => {
    const { client, calls } = fakeClient(() => [session]);
    const [row] = await recentSessions("u1", {}, client);
    expect(row.exchanges).toBe(8);
    expect(calls[0].sql).toContain("COUNT(CASE WHEN m.role = 'user' THEN 1 END) AS turns");
    // Two turns, so a session opened and abandoned never reaches the archive.
    expect(calls[0].sql).toContain("HAVING turns >= ?");
    expect(calls[0].args).toContain(2);
  });

  it("finds a conversation by something said in it", async () => {
    const { client, calls } = fakeClient(() => [session]);
    await recentSessions("u1", { search: "budget" }, client);
    expect(calls[0].sql).toContain("mm.content LIKE ?");
    expect(calls[0].args).toContain("%budget%");
  });

  it("does not let a search term act as a wildcard", async () => {
    const { client, calls } = fakeClient(() => []);
    await recentSessions("u1", { search: "%_%" }, client);
    expect(calls[0].args).toContain("%   %");
  });

  it("asks for nothing extra when nobody is searching", async () => {
    const { client, calls } = fakeClient(() => [session]);
    await recentSessions("u1", {}, client);
    expect(calls[0].sql).not.toContain("mm.content LIKE");
  });
});

describe("the line between spoken and written", () => {
  it("never offers the chat a conversation that happened at the microphone", async () => {
    const { client, calls } = fakeClient(() => [session]);
    await resumableSession("u1", { kind: "text" }, client);
    expect(calls[0].sql).toContain("s.mode NOT IN ('voice', 'diary')");
  });

  it("never offers the microphone a conversation that happened in writing", async () => {
    const { client, calls } = fakeClient(() => [session]);
    await resumableSession("u1", { kind: "voice" }, client);
    expect(calls[0].sql).toContain("s.mode IN ('voice', 'diary')");
  });

  it("keeps one history when nobody asked for half of it", async () => {
    const { client, calls } = fakeClient(() => [session]);
    await recentSessions("u1", {}, client);
    expect(calls[0].sql).not.toContain("s.mode IN");
    expect(calls[0].sql).not.toContain("s.mode NOT IN");
  });

  it("says which way each session happened, so the list can show it", async () => {
    const { client } = fakeClient(() => [
      { ...session, mode: "voice" },
      { ...session, id: "s2", mode: "diary" },
      { ...session, id: "s3", mode: "guided" },
    ]);
    expect((await recentSessions("u1", {}, client)).map((s) => s.voice)).toEqual([true, true, false]);
  });

  it("asks for no more than a screenful, whatever it is told", async () => {
    const { client, calls } = fakeClient(() => []);
    await recentSessions("u1", { limit: 5000 }, client);
    expect(calls[0].args[calls[0].args.length - 1]).toBe(100);
  });
});

describe("recentSessions", () => {
  it("marks the ones that were finished on purpose", async () => {
    const { client } = fakeClient(() => [
      { ...session, closed_at: "2026-09-14T09:20:00.000Z" },
      { ...session, id: "s2", closed_at: null },
    ]);
    const list = await recentSessions("u1", {}, client);
    expect(list.map((s) => s.closed)).toEqual([true, false]);
  });

  it("degrades to 'nothing was closed' rather than failing", async () => {
    const { client } = fakeClient(() => [session], { missingColumn: true, canAlter: false });
    const list = await recentSessions("u1", {}, client);
    expect(list).toHaveLength(1);
    expect(list[0].closed).toBe(false);
  });
});

describe("sessionTranscript", () => {
  it("reads the conversation back with its corrections", async () => {
    const { client } = fakeClient(() => [
      { role: "user", content: "I go yesterday", correction: "I went yesterday", created_at: "2026-09-14T09:01:00.000Z" },
      { role: "assistant", content: "Nice try!", correction: null, created_at: "2026-09-14T09:01:20.000Z" },
    ]);
    const lines = await sessionTranscript("u1", "s1", client);
    expect(lines[0].correction).toBe("I went yesterday");
    expect(lines[1].correction).toBeNull();
  });
});

describe("closeSession", () => {
  it("never fails the request that ends a session", async () => {
    const client = {
      execute: async () => {
        throw new Error("no such column: closed_at");
      },
    } as unknown as Client;
    await expect(closeSession("u1", "s1", client)).resolves.toBeUndefined();
  });

  it("adds the column and writes the close when the migration has not run", async () => {
    const { client, calls } = fakeClient(() => [], { missingColumn: true });
    await closeSession("u1", "s1", client);
    expect(calls[1].sql).toContain("ALTER TABLE sessions ADD COLUMN closed_at");
    expect(calls[2].sql).toContain("UPDATE sessions SET closed_at");
    expect(calls[2].args).toContain("s1");
  });

  it("keeps the first close when it happens twice", async () => {
    const { client, calls } = fakeClient(() => []);
    await closeSession("u1", "s1", client);
    expect(calls[0].sql).toContain("COALESCE(closed_at");
  });
});

describe("sessionReport", () => {
  it("counts what the learner did, not what Sam said", async () => {
    const { client } = fakeClient((sql) =>
      /FROM expressions/.test(sql)
        ? [{ n: 3 }]
        : [
            { role: "user", correction: "I went", created_at: "2026-09-14T09:00:00.000Z" },
            { role: "assistant", correction: null, created_at: "2026-09-14T09:00:30.000Z" },
            { role: "user", correction: null, created_at: "2026-09-14T09:10:00.000Z" },
          ]
    );
    const { facts, score } = await sessionReport("u1", "s1", client);
    expect(facts.exchanges).toBe(2);
    expect(facts.corrected).toBe(1);
    expect(facts.learned).toBe(3);
    expect(facts.minutes).toBe(10);
    expect(score.points).toBeGreaterThan(0);
  });

  it("still reports when the expressions table cannot be read", async () => {
    const client = {
      execute: async (q: { sql: string }) => {
        if (/FROM expressions/.test(q.sql)) throw new Error("no such table: expressions");
        return { rows: [{ role: "user", correction: null, created_at: "2026-09-14T09:00:00.000Z" }] };
      },
    } as unknown as Client;
    const { facts } = await sessionReport("u1", "s1", client);
    expect(facts.learned).toBe(0);
    expect(facts.exchanges).toBe(1);
  });
});
