import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  db: vi.fn(),
  dbExecute: vi.fn(),
  dbBatch: vi.fn(),
  ensureProfile: vi.fn(),
  recordDailyMetric: vi.fn(),
  saveExpression: vi.fn(),
  saveMistake: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/learning/service", () => ({
  ensureProfile: mocks.ensureProfile,
  recordDailyMetric: mocks.recordDailyMetric,
  saveExpression: mocks.saveExpression,
  saveMistake: mocks.saveMistake,
}));

import { POST } from "@/app/api/voice/end/route";

/**
 * Hanging up used to be the moment a spoken session came into existence: one
 * INSERT, at the end, or nothing at all. Now the row already exists, because
 * the transcript has been going in as it was spoken — so the one thing this
 * route must not do any more is create a second one. A call that counted
 * twice would tell the learner they had practised conversations they never
 * had.
 */
function request(body: Record<string, unknown>) {
  return new Request("https://www.execlingo.it/api/voice/end", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

const sql = () => mocks.dbExecute.mock.calls.map((call) => String(call[0]?.sql ?? call[0]));
const batched = () => mocks.dbBatch.mock.calls.flatMap((call) => (call[0] as { sql: string }[]).map((s) => s.sql));

describe("ending a voice call", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    delete process.env.OPENAI_API_KEY;
    mocks.getUserId.mockResolvedValue("u1");
    mocks.dbExecute.mockResolvedValue({ rows: [{ id: "s1" }] });
    mocks.dbBatch.mockResolvedValue([]);
    mocks.db.mockReturnValue({ execute: mocks.dbExecute, batch: mocks.dbBatch });
  });

  it("closes the session the call was already writing into", async () => {
    const response = await POST(request({ seconds: 300, sessionId: "11111111-2222-3333-4444-555555555555" }));
    expect(response.status).toBe(200);
    expect(sql().some((s) => /INSERT INTO sessions/.test(s))).toBe(false);
    expect(sql().some((s) => /UPDATE sessions SET ended_at = \?/.test(s))).toBe(true);
    expect(mocks.recordDailyMetric).toHaveBeenCalledWith("u1", { minutes: 5, interactions: 1 });
  });

  it("saves the last lines, which are the ones a hang-up used to lose", async () => {
    await POST(
      request({
        seconds: 120,
        sessionId: "11111111-2222-3333-4444-555555555555",
        from: 7,
        pending: [{ role: "you", text: "See you tomorrow" }],
      })
    );
    const inserts = batched().filter((s) => /INSERT OR IGNORE INTO messages/.test(s));
    expect(inserts).toHaveLength(1);
  });

  it("still writes a row when the call never managed to flush anything", async () => {
    mocks.dbExecute.mockResolvedValue({ rows: [] });
    await POST(request({ seconds: 90, from: 0, pending: [{ role: "you", text: "Hello Sam" }] }));
    expect(sql().some((s) => /INSERT OR IGNORE INTO sessions/.test(s))).toBe(true);
    expect(batched().some((s) => /INSERT OR IGNORE INTO messages/.test(s))).toBe(true);
  });

  it("credits the minutes of a call nobody could transcribe, as it always did", async () => {
    await POST(request({ seconds: 600 }));
    expect(sql().some((s) => /INSERT INTO sessions/.test(s))).toBe(true);
    expect(mocks.recordDailyMetric).toHaveBeenCalledWith("u1", { minutes: 10, interactions: 1 });
  });

  it("keeps the spoken diary labelled as itself", async () => {
    await POST(request({ seconds: 60, mode: "diary" }));
    const insert = mocks.dbExecute.mock.calls.find((call) => /INSERT INTO sessions/.test(String(call[0]?.sql)));
    expect(insert?.[0].args[2]).toBe("diary");
  });

  it("turns away somebody who is not signed in", async () => {
    mocks.getUserId.mockResolvedValue(null);
    expect((await POST(request({ seconds: 60 }))).status).toBe(401);
  });
});
