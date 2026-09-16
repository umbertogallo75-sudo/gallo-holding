import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  getUserId: vi.fn(),
  db: vi.fn(),
  dbExecute: vi.fn(),
  dbMulti: vi.fn(),
  runStructured: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/ai/openai", () => ({ runStructured: mocks.runStructured }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, clientKey: () => "k" }));

import { GET } from "@/app/api/pagella/route";

/**
 * The written verdict. Two things matter more than the words: it is not paid
 * for twice when nothing has changed, and the page is never left with nothing
 * when it cannot be written at all.
 */
const REPORT = {
  body: "Sei migliorato nelle riunioni: reggi il filo anche quando ti interrompono.",
  strengths: ["Presentarti senza esitare"],
  focus: ["I numeri detti ad alta voce"],
};

function stored(overrides: Record<string, unknown> = {}) {
  return {
    body: REPORT.body,
    strengths: JSON.stringify(REPORT.strengths),
    focus: JSON.stringify(REPORT.focus),
    interactions: 100,
    created_at: new Date().toISOString(),
    ...overrides,
  };
}

function request() {
  return new Request("https://www.execlingo.it/api/pagella");
}

describe("il giudizio di Sam", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    process.env.OPENAI_API_KEY = "test-key";
    mocks.getUserId.mockResolvedValue("u1");
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.dbMulti.mockResolvedValue(undefined);
    mocks.db.mockReturnValue({ execute: mocks.dbExecute, executeMultiple: mocks.dbMulti });
  });

  it("serves the one already written rather than paying for it again", async () => {
    mocks.dbExecute.mockImplementation(async (q: { sql: string }) => {
      if (/FROM coach_reports/.test(q.sql)) return { rows: [stored()] };
      if (/COUNT\(\*\) AS n FROM messages/.test(q.sql)) return { rows: [{ n: 105 }] };
      return { rows: [] };
    });
    const response = await GET(request());
    const data = await response.json();
    expect(data.report.body).toBe(REPORT.body);
    expect(data.report.strengths).toEqual(REPORT.strengths);
    expect(mocks.runStructured).not.toHaveBeenCalled();
  });

  it("writes a new one once it is old and there has been real practice since", async () => {
    mocks.dbExecute.mockImplementation(async (q: { sql: string }) => {
      if (/FROM coach_reports/.test(q.sql)) {
        return { rows: [stored({ created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(), interactions: 40 })] };
      }
      if (/COUNT\(\*\) AS n FROM messages/.test(q.sql)) return { rows: [{ n: 90 }] };
      return { rows: [] };
    });
    mocks.runStructured.mockResolvedValue(JSON.stringify(REPORT));
    const response = await GET(request());
    expect((await response.json()).report.fresh).toBe(true);
    expect(mocks.runStructured).toHaveBeenCalled();
  });

  it("leaves an old verdict alone when nothing has been practised since", async () => {
    // Age alone is not a reason: a verdict on a learner who has not spoken
    // since still describes them exactly.
    mocks.dbExecute.mockImplementation(async (q: { sql: string }) => {
      if (/FROM coach_reports/.test(q.sql)) {
        return { rows: [stored({ created_at: new Date(Date.now() - 30 * 86_400_000).toISOString(), interactions: 88 })] };
      }
      if (/COUNT\(\*\) AS n FROM messages/.test(q.sql)) return { rows: [{ n: 90 }] };
      return { rows: [] };
    });
    await GET(request());
    expect(mocks.runStructured).not.toHaveBeenCalled();
  });

  it("keeps showing the old one when a new one cannot be written", async () => {
    mocks.dbExecute.mockImplementation(async (q: { sql: string }) => {
      if (/FROM coach_reports/.test(q.sql)) {
        return { rows: [stored({ created_at: new Date(Date.now() - 10 * 86_400_000).toISOString(), interactions: 10 })] };
      }
      if (/COUNT\(\*\) AS n FROM messages/.test(q.sql)) return { rows: [{ n: 90 }] };
      return { rows: [] };
    });
    mocks.runStructured.mockRejectedValue(new Error("upstream down"));
    const response = await GET(request());
    expect(response.status).toBe(200);
    expect((await response.json()).report.body).toBe(REPORT.body);
  });

  it("answers with nothing, not an error, for somebody who has never practised", async () => {
    mocks.dbExecute.mockResolvedValue({ rows: [] });
    mocks.runStructured.mockResolvedValue(JSON.stringify(REPORT));
    const response = await GET(request());
    expect(response.status).toBe(200);
  });

  it("turns away somebody who is not signed in", async () => {
    mocks.getUserId.mockResolvedValue(null);
    expect((await GET(request())).status).toBe(401);
  });
});
