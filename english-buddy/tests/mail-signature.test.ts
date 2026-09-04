import { createHmac } from "node:crypto";
import { describe, expect, it } from "vitest";
import { TOLERANCE_SECONDS, verifySvixSignature } from "@/lib/mail/signature";

const SECRET = "whsec_" + Buffer.from("a-thirty-two-byte-secret-for-test").toString("base64");
const BODY = JSON.stringify({ type: "email.received", data: { email_id: "e_1" } });

function sign(body: string, id: string, timestamp: number, secret = SECRET): string {
  const key = Buffer.from(secret.slice(6), "base64");
  return "v1," + createHmac("sha256", key).update(`${id}.${timestamp}.${body}`).digest("base64");
}

const NOW = new Date("2026-09-04T12:00:00Z");
const TS = Math.floor(NOW.getTime() / 1000);

/**
 * The webhook is a public URL that writes into somebody's account. These are
 * the cases that decide whether a stranger can put an email in it.
 */
describe("la firma della posta in arrivo", () => {
  it("accepts a delivery that is really from the mail service", () => {
    const headers = { id: "msg_1", timestamp: String(TS), signature: sign(BODY, "msg_1", TS) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toBe(true);
  });

  it("rejects a body that was changed after signing", () => {
    const headers = { id: "msg_1", timestamp: String(TS), signature: sign(BODY, "msg_1", TS) };
    expect(verifySvixSignature(BODY + " ", headers, SECRET, NOW)).toBe(false);
  });

  it("rejects a signature made with another secret", () => {
    const other = "whsec_" + Buffer.from("a-completely-different-secret-32b").toString("base64");
    const headers = { id: "msg_1", timestamp: String(TS), signature: sign(BODY, "msg_1", TS, other) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toBe(false);
  });

  it("rejects a delivery replayed later", () => {
    // A signature never expires on its own: without the timestamp check, one
    // captured request could be posted into the account forever.
    const old = TS - TOLERANCE_SECONDS - 1;
    const headers = { id: "msg_1", timestamp: String(old), signature: sign(BODY, "msg_1", old) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toBe(false);
  });

  it("rejects a signature bound to a different message id", () => {
    const headers = { id: "msg_2", timestamp: String(TS), signature: sign(BODY, "msg_1", TS) };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toBe(false);
  });

  it("accepts one valid signature among several, as during a rotation", () => {
    const wrong = "v1," + Buffer.from("nonsense").toString("base64");
    const headers = { id: "msg_1", timestamp: String(TS), signature: `${wrong} ${sign(BODY, "msg_1", TS)}` };
    expect(verifySvixSignature(BODY, headers, SECRET, NOW)).toBe(true);
  });

  it("refuses everything when a piece is missing", () => {
    const good = sign(BODY, "msg_1", TS);
    expect(verifySvixSignature(BODY, { id: null, timestamp: String(TS), signature: good }, SECRET, NOW)).toBe(false);
    expect(verifySvixSignature(BODY, { id: "msg_1", timestamp: null, signature: good }, SECRET, NOW)).toBe(false);
    expect(verifySvixSignature(BODY, { id: "msg_1", timestamp: String(TS), signature: null }, SECRET, NOW)).toBe(false);
    expect(verifySvixSignature(BODY, { id: "msg_1", timestamp: String(TS), signature: good }, "", NOW)).toBe(false);
    expect(verifySvixSignature(BODY, { id: "msg_1", timestamp: "not-a-number", signature: good }, SECRET, NOW)).toBe(false);
  });
});
