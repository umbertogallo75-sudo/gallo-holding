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

function fakeClient(rowsFor: (sql: string) => Record<string, unknown>[], missingColumn = false) {
  const calls: Call[] = [];
  const client = {
    execute: async (q: { sql: string; args: unknown[] }) => {
      calls.push({ sql: q.sql, args: q.args });
      if (missingColumn && /s\.closed_at/.test(q.sql)) throw new Error("no such column: closed_at");
      return { rows: rowsFor(q.sql) };
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
  n: 8,
};

describe("resumableSession", () => {
  it("offers back the session that was left open", async () => {
    const { client, calls } = fakeClient(() => [session]);
    const found = await resumableSession("u1", client);
    expect(found?.id).toBe("s1");
    expect(found?.exchanges).toBe(8);
    expect(calls[0].sql).toContain("s.closed_at IS NULL");
  });

  it("still answers on a database that has not got the column yet", async () => {
    const { client, calls } = fakeClient(() => [session], true);
    const found = await resumableSession("u1", client);
    expect(found?.id).toBe("s1");
    expect(calls).toHaveLength(2);
    expect(calls[1].sql).not.toContain("s.closed_at IS NULL");
  });

  it("offers nothing when there is nothing to come back to", async () => {
    const { client } = fakeClient(() => []);
    expect(await resumableSession("u1", client)).toBeNull();
  });
});

describe("recentSessions", () => {
  it("marks the ones that were finished on purpose", async () => {
    const { client } = fakeClient(() => [
      { ...session, closed_at: "2026-09-14T09:20:00.000Z" },
      { ...session, id: "s2", closed_at: null },
    ]);
    const list = await recentSessions("u1", 25, client);
    expect(list.map((s) => s.closed)).toEqual([true, false]);
  });

  it("degrades to 'nothing was closed' rather than failing", async () => {
    const { client } = fakeClient(() => [session], true);
    const list = await recentSessions("u1", 25, client);
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
