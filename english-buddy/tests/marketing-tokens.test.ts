import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { emailToken, readEmailToken, unsubscribeUrl } from "@/lib/marketing/tokens";

beforeEach(() => { process.env.SESSION_SECRET = "test-secret-at-least-32-characters-long"; });
afterEach(() => { delete process.env.SESSION_SECRET; delete process.env.APP_BASE_URL; });

describe("email tokens", () => {
  it("round-trips a user id", () => {
    expect(readEmailToken(emailToken("user-42", "unsub"), "unsub")).toBe("user-42");
  });

  it("does not let an unsubscribe link hand out a free trial", () => {
    // Mail clients are given the unsubscribe URL and may fetch it on their
    // own. If that token also opened the trial, every scanned message would
    // start somebody's 24-hour clock.
    const token = emailToken("user-42", "unsub");
    expect(readEmailToken(token, "trial")).toBeNull();
  });

  it("rejects a tampered signature", () => {
    const token = emailToken("user-42", "unsub");
    const [head] = token.split(".");
    expect(readEmailToken(`${head}.${"0".repeat(32)}`, "unsub")).toBeNull();
  });

  it("rejects a swapped identity", () => {
    const mine = emailToken("user-42", "unsub");
    const theirs = emailToken("user-99", "unsub");
    const forged = `${theirs.split(".")[0]}.${mine.split(".")[1]}`;
    expect(readEmailToken(forged, "unsub")).toBeNull();
  });

  it("survives the shapes a mail client can mangle a link into", () => {
    for (const bad of ["", "   ", "no-dot", ".", "a.", ".b", "!!!.###"]) {
      expect(readEmailToken(bad, "unsub"), bad).toBeNull();
    }
    expect(readEmailToken(undefined, "unsub")).toBeNull();
    expect(readEmailToken(null, "unsub")).toBeNull();
  });

  it("builds an absolute unsubscribe URL, because a relative one is dead in an inbox", () => {
    process.env.APP_BASE_URL = "https://www.execlingo.it/";
    expect(unsubscribeUrl("user-42")).toMatch(/^https:\/\/www\.execlingo\.it\/disiscriviti\/[A-Za-z0-9_-]+\.[0-9a-f]{32}$/);
  });
});
