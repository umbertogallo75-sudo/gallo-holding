import type { Client } from "@libsql/client";
import { describe, expect, it } from "vitest";
import { continuityBlock, readContinuity } from "@/lib/learning/continuity";

/**
 * The complaint this exists to answer, in the testers' words: "riparte da zero
 * e ti dice sempre le stesse cose". Sam's memory held their level, their
 * mistakes and their due reviews — everything except the conversation they had
 * yesterday — so every session opened as a first meeting.
 */
type Query = { sql: string; args: unknown[] };

function fake(rowsFor: (sql: string) => Record<string, unknown>[]) {
  const queries: Query[] = [];
  const client = {
    execute: async (q: { sql: string; args?: unknown[] }) => {
      queries.push({ sql: q.sql, args: q.args ?? [] });
      return { rows: rowsFor(q.sql) };
    },
  } as unknown as Client;
  return { client, queries };
}

const yesterday = new Date(Date.now() - 26 * 3_600_000).toISOString();

function withHistory(sessions: Record<string, unknown>[], tail: Record<string, unknown>[]) {
  return fake((sql) => (/FROM sessions s JOIN messages/.test(sql) ? sessions : tail));
}

describe("readContinuity", () => {
  const sessions = [
    { id: "prev", mode: "guided", last_at: yesterday, opening: "Hi! Shall we talk about your week?" },
    { id: "older", mode: "text-5", last_at: yesterday, opening: "Hello! How was your day?" },
  ];
  const tail = [
    { role: "assistant", content: "Good. Try it with 'by Friday'." },
    { role: "user", content: "I will send the offer tomorrow" },
  ];

  it("gives back how the last conversation ended, in the order it was said", async () => {
    const { client } = withHistory(sessions, tail);
    const found = await readContinuity("u1", "current", client);
    expect(found?.lastLines.map((l) => l.content)).toEqual([
      "I will send the offer tomorrow",
      "Good. Try it with 'by Friday'.",
    ]);
    expect(found?.daysAgo).toBe(1);
    expect(found?.mode).toBe("guided");
  });

  it("collects the openings already used, so the next one is not the same again", async () => {
    const { client } = withHistory(sessions, tail);
    const found = await readContinuity("u1", "current", client);
    expect(found?.recentOpenings).toEqual(["Hi! Shall we talk about your week?", "Hello! How was your day?"]);
  });

  it("never treats the conversation being had right now as history", async () => {
    const { client, queries } = withHistory(sessions, tail);
    await readContinuity("u1", "current", client);
    expect(queries[0].sql).toContain("s.id != ?");
    expect(queries[0].args).toContain("current");
  });

  it("only counts a session the learner actually spoke in", async () => {
    const { client, queries } = withHistory(sessions, tail);
    await readContinuity("u1", null, client);
    expect(queries[0].sql).toContain("COUNT(CASE WHEN m.role = 'user' THEN 1 END) >= 1");
  });

  it("hides the instruction that used to open every conversation", async () => {
    const { client } = withHistory(sessions, [
      { role: "assistant", content: "Let's begin." },
      { role: "user", content: "Start a short natural English conversation with me." },
    ]);
    const found = await readContinuity("u1", null, client);
    expect(found?.lastLines.map((l) => l.content)).toEqual(["Let's begin."]);
  });

  it("says nothing about somebody who has never been here", async () => {
    const { client } = withHistory([], []);
    expect(await readContinuity("u1", null, client)).toBeNull();
  });

  it("stays quiet rather than failing when the history cannot be read", async () => {
    const client = { execute: async () => { throw new Error("down"); } } as unknown as Client;
    expect(await readContinuity("u1", null, client)).toBeNull();
  });
});

describe("continuityBlock", () => {
  const continuity = {
    lastLines: [{ role: "user", content: "I will send the offer tomorrow" }],
    daysAgo: 1,
    mode: "guided",
    recentOpenings: ["Hello! How was your day?"],
  };

  it("tells the coach to pick the thread up instead of opening again", () => {
    const block = continuityBlock(continuity);
    expect(block).toContain("you have met this person before");
    expect(block).toContain("yesterday");
    expect(block).toContain("I will send the offer tomorrow");
    // The two failures testers actually described.
    expect(block).toContain("Do not reuse them");
    expect(block).toContain("Never ask again for something they have already told you");
  });

  it("puts the session inside the three-month path rather than on its own", () => {
    expect(continuityBlock(continuity)).toContain("three-month path");
  });

  it("says nothing at all on a genuine first session", () => {
    expect(continuityBlock(null)).toBe("");
    expect(continuityBlock({ ...continuity, lastLines: [] })).toBe("");
  });

  it("uses words a person would use for how long ago it was", () => {
    expect(continuityBlock({ ...continuity, daysAgo: 0 })).toContain("earlier today");
    expect(continuityBlock({ ...continuity, daysAgo: 3 })).toContain("3 days ago");
    expect(continuityBlock({ ...continuity, daysAgo: 9 })).toContain("about a week ago");
    expect(continuityBlock({ ...continuity, daysAgo: 200 })).toContain("a while ago");
  });
});
