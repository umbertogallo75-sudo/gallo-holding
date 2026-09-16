import { readFileSync } from "node:fs";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  afterCalls: [] as (() => Promise<void> | void)[],
  getUserId: vi.fn(),
  db: vi.fn(),
  dbExecute: vi.fn(),
  ensureProfile: vi.fn(),
  saveExpression: vi.fn(),
  runStructured: vi.fn(),
  rateLimit: vi.fn(),
}));

vi.mock("next/server", async (importOriginal) => {
  const actual = await importOriginal<typeof import("next/server")>();
  // `after` needs a request scope that does not exist in a unit test. Held
  // instead, so the part that runs once the answer has left can be run on
  // purpose.
  return { ...actual, after: (fn: () => Promise<void> | void) => { mocks.afterCalls.push(fn); } };
});
vi.mock("@/lib/auth", () => ({ getUserId: mocks.getUserId }));
vi.mock("@/lib/db", () => ({ db: mocks.db }));
vi.mock("@/lib/learning/service", () => ({ ensureProfile: mocks.ensureProfile, saveExpression: mocks.saveExpression }));
vi.mock("@/lib/ai/openai", () => ({ runStructured: mocks.runStructured }));
vi.mock("@/lib/rate-limit", () => ({ rateLimit: mocks.rateLimit, clientKey: () => "k" }));

import { POST } from "@/app/api/frasi/route";

/**
 * "Ricorda frase", asked for by testers in both places English happens.
 *
 * The rule that matters: the phrase is kept whatever else fails. A save that
 * waits on a translation is a save that can be lost, and the sentence
 * somebody just reached for is the last thing to gamble.
 */
function request(body: unknown) {
  return new Request("https://www.execlingo.it/api/frasi", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
}

describe("keeping a phrase", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCalls.length = 0;
    mocks.getUserId.mockResolvedValue("u1");
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.dbExecute.mockResolvedValue({ rows: [] });
    mocks.db.mockReturnValue({ execute: mocks.dbExecute });
    mocks.saveExpression.mockResolvedValue(undefined);
  });

  it("keeps it straight away, before anything else is attempted", async () => {
    const response = await POST(request({ text: "Let me get back to you on that", from: "voice" }));
    expect(response.status).toBe(200);
    expect(mocks.saveExpression).toHaveBeenCalledWith("u1", "Let me get back to you on that", null);
  });

  it("tidies the spacing so the same phrase is not kept twice", async () => {
    await POST(request({ text: "  Let me   get back \n to you  " }));
    expect(mocks.saveExpression).toHaveBeenCalledWith("u1", "Let me get back to you", null);
  });

  it("fills in the Italian afterwards, and never over one already there", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mocks.runStructured.mockResolvedValue(JSON.stringify({ italian: "Ti faccio sapere" }));
    await POST(request({ text: "Let me get back to you" }));
    // Answered before the translation was even attempted.
    expect(mocks.runStructured).not.toHaveBeenCalled();

    for (const run of mocks.afterCalls) await run();
    const update = mocks.dbExecute.mock.calls.find((call) => /UPDATE expressions/.test(String(call[0]?.sql)));
    expect(update?.[0].sql).toContain("COALESCE(meaning, ?)");
    expect(update?.[0].args[0]).toBe("Ti faccio sapere");
    delete process.env.OPENAI_API_KEY;
  });

  it("keeps the phrase even when the translation fails", async () => {
    process.env.OPENAI_API_KEY = "test-key";
    mocks.runStructured.mockRejectedValue(new Error("upstream down"));
    const response = await POST(request({ text: "Could you walk me through it?" }));
    expect(response.status).toBe(200);
    expect(mocks.saveExpression).toHaveBeenCalled();
    for (const run of mocks.afterCalls) await expect(run()).resolves.toBeUndefined();
    delete process.env.OPENAI_API_KEY;
  });

  it("turns away an empty one, and one too long to be a phrase", async () => {
    expect((await POST(request({ text: "a" }))).status).toBe(400);
    expect((await POST(request({ text: "x".repeat(400) }))).status).toBe(400);
    expect(mocks.saveExpression).not.toHaveBeenCalled();
  });

  it("turns away somebody who is not signed in", async () => {
    mocks.getUserId.mockResolvedValue(null);
    expect((await POST(request({ text: "Nice to meet you" }))).status).toBe(401);
  });

  it("holds the door against a runaway client", async () => {
    mocks.rateLimit.mockReturnValue({ allowed: false });
    expect((await POST(request({ text: "Nice to meet you" }))).status).toBe(429);
  });
});

describe("where a phrase can be kept from", () => {
  const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");
  const voice = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
  const transcript = readFileSync("src/app/sessioni/[id]/page.tsx", "utf8");

  it("from anything Sam said in writing", () => {
    expect(chat).toContain('<RememberPhrase text={m.content} from="chat" />');
  });

  it("from a correction, which is the phrase they actually needed", () => {
    expect(chat).toContain('<RememberPhrase text={m.mistake.correct} from="chat" compact />');
    expect(chat).toContain('<RememberPhrase text={m.correction} from="chat" compact />');
  });

  it("from a line heard during a call, which is the hardest kind to keep", () => {
    expect(voice).toContain('<RememberPhrase text={l.text} from="voice" compact />');
  });

  it("and from a conversation being reread later", () => {
    expect(transcript).toContain('from="transcript"');
  });
});
