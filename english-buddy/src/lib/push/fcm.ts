import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { googleAccessToken, SCOPE_FIREBASE_MESSAGING, serviceAccountConfigured } from "@/lib/google-auth";

/**
 * Native Android push over Firebase Cloud Messaging, for the Kotlin app
 * (a WebView shell cannot receive Web Push the way the TWA did). Device
 * tokens are registered by the app through /api/push/fcm-register; delivery
 * uses the FCM HTTP v1 API with the same service account already configured
 * for Play purchases — only the OAuth scope differs.
 *
 * Env: PLAY_SERVICE_ACCOUNT_EMAIL, PLAY_SERVICE_ACCOUNT_KEY (shared with
 * Play billing) and FIREBASE_PROJECT_ID (defaults to the ExecLingo project).
 */

const PROJECT_ID = process.env.FIREBASE_PROJECT_ID || "execlingo";

export function fcmConfigured(): boolean {
  return serviceAccountConfigured();
}

export type FcmPayload = {
  title: string;
  body: string;
  image?: string;
  data: { url: string; nid?: string };
};

/** Errors that mean the token is gone for good and should be pruned. */
const DEAD_ERRORS = new Set(["UNREGISTERED", "INVALID_ARGUMENT", "SENDER_ID_MISMATCH"]);

async function sendToToken(token: string, payload: FcmPayload, accessToken: string): Promise<"delivered" | "dead" | "failed"> {
  const message = {
    message: {
      token,
      notification: { title: payload.title, body: payload.body, ...(payload.image ? { image: payload.image } : {}) },
      data: { url: payload.data.url, ...(payload.data.nid ? { nid: payload.data.nid } : {}) },
      android: { priority: "HIGH", notification: { sound: "default", click_action: "OPEN_EXECLINGO" } },
    },
  };
  const response = await fetch(`https://fcm.googleapis.com/v1/projects/${PROJECT_ID}/messages:send`, {
    method: "POST",
    headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json" },
    body: JSON.stringify(message),
  }).catch(() => null);
  if (!response) return "failed";
  if (response.ok) return "delivered";

  const detail = (await response.json().catch(() => null)) as
    | { error?: { status?: string; details?: { errorCode?: string }[] } }
    | null;
  const code = detail?.error?.details?.find((d) => d.errorCode)?.errorCode ?? detail?.error?.status ?? "";
  if (response.status === 404 || DEAD_ERRORS.has(code)) return "dead";
  console.error(`fcm delivery failed (${response.status}):`, code || "unknown");
  return "failed";
}

/**
 * Sends a payload to every FCM token of a user, pruning dead ones.
 * Returns the number of successful deliveries.
 */
export async function sendFcmToUser(userId: string, payload: FcmPayload, client: Client = db()): Promise<number> {
  if (!fcmConfigured()) return 0;
  const tokens = await client
    .execute({ sql: "SELECT token FROM fcm_tokens WHERE user_id = ?", args: [userId] })
    .catch(() => null);
  if (!tokens || tokens.rows.length === 0) return 0;

  const accessToken = await googleAccessToken(SCOPE_FIREBASE_MESSAGING);
  if (!accessToken) return 0;

  let delivered = 0;
  for (const row of tokens.rows) {
    const token = String(row.token);
    const outcome = await sendToToken(token, payload, accessToken);
    if (outcome === "delivered") delivered++;
    else if (outcome === "dead") {
      await client.execute({ sql: "DELETE FROM fcm_tokens WHERE token = ?", args: [token] }).catch(() => {});
    }
  }
  return delivered;
}
