import { createHmac, timingSafeEqual } from "node:crypto";

/**
 * Proving that an inbound message really came from the mail service.
 *
 * The endpoint is a public URL that writes into somebody's account, so
 * "nobody knows the address" is not a control. Resend signs each delivery in
 * the Svix scheme, which every service of this kind now uses: an HMAC over
 * the message id, the timestamp and the exact bytes of the body.
 *
 * Two details are the whole point of doing it here rather than trusting a
 * library later. The signature covers the *raw* body, so it has to be checked
 * before anything parses the JSON — re-serialising changes the bytes and the
 * signature stops matching. And the timestamp is checked as well, because a
 * signature stays valid forever: without it, one captured delivery could be
 * replayed into the account indefinitely.
 */

/** How far out of date a delivery may be before it is treated as a replay. */
export const TOLERANCE_SECONDS = 300;

export type SignatureHeaders = {
  id: string | null;
  timestamp: string | null;
  signature: string | null;
};

function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && timingSafeEqual(left, right);
}

export function verifySvixSignature(
  rawBody: string,
  headers: SignatureHeaders,
  secret: string,
  now: Date = new Date()
): boolean {
  const { id, timestamp, signature } = headers;
  if (!id || !timestamp || !signature || !secret) return false;

  const sent = Number(timestamp);
  if (!Number.isFinite(sent)) return false;
  if (Math.abs(Math.floor(now.getTime() / 1000) - sent) > TOLERANCE_SECONDS) return false;

  // The dashboard shows the secret with a prefix; the key is what follows it.
  const key = Buffer.from(secret.startsWith("whsec_") ? secret.slice(6) : secret, "base64");
  if (!key.length) return false;

  const expected = createHmac("sha256", key).update(`${id}.${timestamp}.${rawBody}`).digest("base64");

  // The header carries every currently valid signature, space separated, each
  // tagged with its version — a secret being rotated has two at once.
  for (const entry of signature.split(" ")) {
    const [version, value] = entry.split(",");
    if (version === "v1" && value && safeEqual(value, expected)) return true;
  }
  return false;
}

export function readSignatureHeaders(request: Request): SignatureHeaders {
  return {
    id: request.headers.get("svix-id"),
    timestamp: request.headers.get("svix-timestamp"),
    signature: request.headers.get("svix-signature"),
  };
}
