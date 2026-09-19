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

import { DELETE, POST } from "@/app/api/frasi/route";

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
    // Marked as theirs, so the phrasebook can show their choices apart from
    // the ones Sam recorded on their behalf.
    expect(mocks.saveExpression).toHaveBeenCalledWith("u1", "Let me get back to you on that", null, expect.anything(), true);
  });

  it("tidies the spacing so the same phrase is not kept twice", async () => {
    await POST(request({ text: "  Let me   get back \n to you  " }));
    expect(mocks.saveExpression).toHaveBeenCalledWith("u1", "Let me get back to you", null, expect.anything(), true);
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

describe("taking a phrase back out", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mocks.afterCalls.length = 0;
    mocks.getUserId.mockResolvedValue("u1");
    mocks.rateLimit.mockReturnValue({ allowed: true });
    mocks.dbExecute.mockResolvedValue({ rows: [] });
    mocks.db.mockReturnValue({ execute: mocks.dbExecute });
  });

  it("removes exactly the phrase asked for, and only this learner's", async () => {
    // A star that only fills is a trap: a phrase saved by a mistyped tap would
    // keep coming back in the reviews and in the gym for weeks.
    const response = await DELETE(
      new Request("https://www.execlingo.it/api/frasi", {
        method: "DELETE",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: "Let me get back to you" }),
      })
    );
    expect(response.status).toBe(200);
    const call = mocks.dbExecute.mock.calls[0][0];
    expect(call.sql).toContain("DELETE FROM expressions WHERE user_id = ? AND expression = ?");
    expect(call.args).toEqual(["u1", "Let me get back to you"]);
  });

  it("matches the phrase the way it was stored, spacing tidied", async () => {
    await DELETE(
      new Request("https://www.execlingo.it/api/frasi?text=Let%20me%20%20get%20back", { method: "DELETE" })
    );
    expect(mocks.dbExecute.mock.calls[0][0].args[1]).toBe("Let me get back");
  });

  it("turns away somebody who is not signed in", async () => {
    mocks.getUserId.mockResolvedValue(null);
    const response = await DELETE(
      new Request("https://www.execlingo.it/api/frasi?text=anything", { method: "DELETE" })
    );
    expect(response.status).toBe(401);
    expect(mocks.dbExecute).not.toHaveBeenCalled();
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

  it("and every star can be tapped again to take it back out", () => {
    const button = readFileSync("src/components/RememberPhrase.tsx", "utf8");
    expect(button).toContain('method: removing ? "DELETE" : "POST"');
    expect(button).toContain('aria-pressed={state === "saved"}');
    // Including in the phrasebook itself, where the row then disappears
    // rather than waiting for a reload.
    const row = readFileSync("src/components/PhraseRow.tsx", "utf8");
    expect(row).toContain("onChange={(saved) => setGone(!saved)}");
  });
});

describe("finding the phrasebook", () => {
  it("is one tap from both places phrases are made", () => {
    // "dov'è il menu, il frasario non lo si trova": it was a card a long way
    // down the home screen and a link at the foot of another page.
    expect(readFileSync("src/app/buddy/page.tsx", "utf8")).toContain('href="/phrasebook"');
    expect(readFileSync("src/app/voice/page.tsx", "utf8")).toContain('href="/phrasebook"');
  });

  it("sits with the sessions on the home screen, above the catalogue", () => {
    const home = readFileSync("src/app/home/page.tsx", "utf8");
    const phrases = home.indexOf('href="/phrasebook"');
    const catalogue = home.indexOf("The catalogue, shown rather than linked");
    expect(phrases).toBeGreaterThan(-1);
    expect(phrases).toBeLessThan(catalogue);
  });
});

describe("reopening a conversation from the archive", () => {
  it("offers it at the end of the transcript, which is where you decide", () => {
    const page = readFileSync("src/app/sessioni/[id]/page.tsx", "utf8");
    expect(page).toContain("Vuoi riaprire questa sessione?");
    expect(page).toContain("`/voice?riprendi=${encodeURIComponent(id)}`");
    expect(page).toContain("`/buddy?riprendi=${encodeURIComponent(id)}`");
  });

  it("goes straight into that conversation rather than offering a choice again", () => {
    const chatSource = readFileSync("src/components/BuddyChat.tsx", "utf8");
    expect(chatSource).toMatch(/if \(reopen\) \{\s*await resume\(reopen\);/);
  });

  it("but still waits for a tap before opening a microphone", () => {
    const voiceSource = readFileSync("src/app/voice/VoiceClient.tsx", "utf8");
    expect(voiceSource).toContain("setResumable({");
    expect(voiceSource).not.toMatch(/if \(reopen\)[\s\S]{0,200}void start\(/);
  });
});
