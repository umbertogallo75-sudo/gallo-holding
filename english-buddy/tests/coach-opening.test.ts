import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { coachResultJsonSchema } from "@/lib/ai/types";

const openai = readFileSync("src/lib/ai/openai.ts", "utf8");
const route = readFileSync("src/app/api/coach/route.ts", "utf8");
const chat = readFileSync("src/components/BuddyChat.tsx", "utf8");

/**
 * Opening the Sam tab was the slowest thing left in the app, and none of it
 * was the app: a coaching turn asks the model for seven things, and on the
 * greeting six of them are empty by definition, because the person has not
 * said anything yet. We were waiting for all seven before they could type.
 */
describe("la prima frase di una sessione", () => {
  it("asks for a great deal less than a coaching turn does", () => {
    const full = (coachResultJsonSchema as { required: string[] }).required;
    expect(full.length).toBeGreaterThan(5);
    const opening = openai.slice(openai.indexOf("const openingSchema"));
    expect(opening).toContain('required: ["reply"]');
    // And a budget to match: the old one is spent on fields nobody reads here.
    expect(opening).toMatch(/runStructured\([\s\S]*?500\s*\n?\s*\)/);
  });

  it("is used only for the automatic first line of a new session", () => {
    // Never for a real turn: that would silently stop recording corrections,
    // expressions and level evidence — the whole point of the coach.
    expect(route).toContain("parsed.data.opening && !parsed.data.sessionId");
    expect(route).toContain("runOpening");
    expect(route).toContain("runCoach");
  });

  it("still never shows the raw answer when the structure slips", () => {
    const opening = openai.slice(openai.indexOf("export async function runOpening"));
    expect(opening).toContain("salvageReply");
  });
});

/**
 * And the second half of the complaint: the send button was dead for as long
 * as Sam took to say hello, which is exactly when people type.
 */
describe("scrivere mentre Sam sta ancora aprendo", () => {
  it("keeps the send button alive", () => {
    expect(chat).toContain('disabled={!text.trim()}');
    expect(chat).not.toContain("disabled={loading || !text.trim()}");
  });

  it("holds what was typed and sends it the moment he lands", () => {
    expect(chat).toContain("queued.current = message");
    expect(chat).toContain("queued.current = undefined; void send(waiting, false)");
  });

  it("shows it straight away rather than making it vanish for two seconds", () => {
    const queueing = chat.slice(chat.indexOf("if (loading) {"), chat.indexOf("setLoading(true)"));
    expect(queueing).toContain('setMessages(v => [...v, { role: "user", content: message }])');
  });
});
