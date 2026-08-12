import { connect } from "node:http2";
import { createPrivateKey, createSign } from "node:crypto";
import type { Client } from "@libsql/client";
import { db } from "@/lib/db";

/**
 * Native iOS push over APNs for the store-app wrapper. Device tokens are
 * registered by the app through /api/push/apns-register; delivery uses the
 * provider API with an ES256 token (the same key style as the App Store
 * Server API, but a dedicated APNs key).
 *
 * Env (Apple Developer → Certificates, IDs & Profiles → Keys, APNs enabled):
 * APNS_KEY_ID, APNS_TEAM_ID, APNS_PRIVATE_KEY (p8 content).
 */

const APNS_TOPIC = process.env.APNS_TOPIC || "it.execlingo.app";

export function apnsConfigured(): boolean {
  return Boolean(process.env.APNS_KEY_ID && process.env.APNS_TEAM_ID && process.env.APNS_PRIVATE_KEY);
}

const b64url = (buf: Buffer) => buf.toString("base64").replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");

function privateKeyPem(): string {
  const raw = (process.env.APNS_PRIVATE_KEY ?? "").trim();
  if (raw.includes("BEGIN")) return raw.replace(/\\n/g, "\n");
  const body = raw.replace(/\s+/g, "");
  const lines = body.match(/.{1,64}/g)?.join("\n") ?? body;
  return `-----BEGIN PRIVATE KEY-----\n${lines}\n-----END PRIVATE KEY-----`;
}

let cachedToken: { value: string; issuedAt: number } | null = null;

/** Provider token, reused for ~45 minutes (Apple allows 20-60). */
function providerToken(now: number = Date.now()): string {
  if (cachedToken && now - cachedToken.issuedAt < 45 * 60_000) return cachedToken.value;
  const header = { alg: "ES256", kid: process.env.APNS_KEY_ID };
  const payload = { iss: process.env.APNS_TEAM_ID, iat: Math.floor(now / 1000) };
  const signingInput = `${b64url(Buffer.from(JSON.stringify(header)))}.${b64url(Buffer.from(JSON.stringify(payload)))}`;
  const signer = createSign("SHA256");
  signer.update(signingInput);
  const signature = signer.sign({ key: createPrivateKey(privateKeyPem()), dsaEncoding: "ieee-p1363" });
  const token = `${signingInput}.${b64url(signature)}`;
  cachedToken = { value: token, issuedAt: now };
  return token;
}

type ApnsResult = { status: number; reason?: string };

/** One HTTP/2 request to an APNs host. */
function apnsRequest(host: string, deviceToken: string, body: string): Promise<ApnsResult> {
  return new Promise((resolve, reject) => {
    const session = connect(`https://${host}`);
    session.on("error", reject);
    const request = session.request({
      ":method": "POST",
      ":path": `/3/device/${deviceToken}`,
      authorization: `bearer ${providerToken()}`,
      "apns-topic": APNS_TOPIC,
      "apns-push-type": "alert",
      "apns-priority": "10",
      "content-type": "application/json",
    });
    let status = 0;
    let data = "";
    request.on("response", (headers) => { status = Number(headers[":status"] ?? 0); });
    request.on("data", (chunk) => { data += chunk; });
    request.on("end", () => {
      session.close();
      let reason: string | undefined;
      try { reason = (JSON.parse(data) as { reason?: string }).reason; } catch { /* empty body on 200 */ }
      resolve({ status, reason });
    });
    request.on("error", (error) => { session.close(); reject(error); });
    request.setTimeout(10_000, () => { request.close(); session.close(); reject(new Error("apns-timeout")); });
    request.end(body);
  });
}

/**
 * Sends an alert to one device. App Store/TestFlight builds live on the
 * production host; Xcode development builds on the sandbox host — a token
 * unknown to production is retried there before being declared dead.
 */
async function sendToDevice(deviceToken: string, body: string): Promise<"delivered" | "dead" | "failed"> {
  for (const host of ["api.push.apple.com", "api.sandbox.push.apple.com"]) {
    const result = await apnsRequest(host, deviceToken, body).catch(() => null);
    if (!result) return "failed";
    if (result.status === 200) return "delivered";
    if (result.status === 410) return "dead";
    if (result.reason === "BadDeviceToken" || result.reason === "DeviceTokenNotForTopic") continue;
    return "failed";
  }
  return "dead";
}

export type ApnsPayload = {
  title: string;
  body: string;
  data: { url: string; nid?: string };
};

/**
 * Sends a payload to every APNs token of a user, pruning dead tokens.
 * Returns the number of successful deliveries.
 */
export async function sendApnsToUser(userId: string, payload: ApnsPayload, client: Client = db()): Promise<number> {
  if (!apnsConfigured()) return 0;
  const tokens = await client
    .execute({ sql: "SELECT token FROM apns_tokens WHERE user_id = ?", args: [userId] })
    .catch(() => null);
  if (!tokens || tokens.rows.length === 0) return 0;

  const body = JSON.stringify({
    aps: { alert: { title: payload.title, body: payload.body }, sound: "default" },
    url: payload.data.url,
    nid: payload.data.nid,
  });

  let delivered = 0;
  for (const row of tokens.rows) {
    const token = String(row.token);
    const outcome = await sendToDevice(token, body);
    if (outcome === "delivered") delivered++;
    else if (outcome === "dead") {
      await client.execute({ sql: "DELETE FROM apns_tokens WHERE token = ?", args: [token] }).catch(() => {});
    }
  }
  return delivered;
}
