import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { VOICE_MODES } from "@/lib/learning/sessions";

/**
 * Whether the voice is alive, asked of the only thing that knows: the calls.
 *
 * On 26 October the spoken conversation was dead for an unknown number of
 * hours and nothing noticed. The daily check looked at the pages, and the
 * pages were perfect — the call screen opened, the timer ran, the microphone
 * light came on. It was silent, and no request anybody can make from outside
 * can see that: the failure was inside a WebRTC session, between a browser
 * and OpenAI, and our server was not on that path at all.
 *
 * What our server does know is two things, and the gap between them is the
 * whole signal. It knows how many calls it authorised, because it mints the
 * credential for every one. And it knows how many conversations were actually
 * had, because the transcript is written down while it is still happening.
 *
 * A call that connects always writes something: both sides are transcribed,
 * and nobody opens the microphone to say nothing. So a credential minted that
 * never becomes a line is a call that went nowhere — and when nearly all of
 * them do, the voice is broken, whatever the pages say.
 */

/**
 * Below this, silence means nothing.
 *
 * Someone opens the voice page at midnight, denies the microphone and closes
 * it: one call authorised, nothing said, and on a quiet night that is the
 * whole sample. An alarm that fires on it is an alarm that gets ignored.
 */
export const MIN_CALLS = 5;

/**
 * How much silence is normal.
 *
 * Not zero, on purpose: a denied microphone, a closed tab, a change of mind
 * are all calls authorised that never say a word, and the row is deliberately
 * not created for them. A third is well under the floor of a working day and
 * well over that noise. It is a judgement, not a measurement — if it ever
 * cries wolf, move it here, where one reads why it exists.
 */
export const MIN_SPOKEN_SHARE = 0.34;

export type VoiceHealth = {
  /** Calls the server authorised in the window. */
  opened: number;
  /** Calls that produced at least one spoken line. */
  spoke: number;
  ok: boolean;
  /** Why, in one word, for a reader who cannot see the numbers. */
  reason: "ok" | "quiet" | "silent-calls";
};

/** The verdict, separated from the database so it can be tested at the edges. */
export function voiceVerdict(opened: number, spoke: number): VoiceHealth {
  if (opened < MIN_CALLS) return { opened, spoke, ok: true, reason: "quiet" };
  const ok = spoke / opened >= MIN_SPOKEN_SHARE;
  return { opened, spoke, ok, reason: ok ? "ok" : "silent-calls" };
}

const VOICE_LIST = VOICE_MODES.map((mode) => `'${mode}'`).join(", ");

/**
 * The two counts, over the last `hours`.
 *
 * A database that cannot answer must not be reported as a broken voice: an
 * alarm that fires when the alarm itself is broken teaches people to ignore
 * it. Unreadable counts come back as quiet.
 */
export async function readVoiceHealth(hours = 24, client: Client = db()): Promise<VoiceHealth> {
  const since = new Date(Date.now() - hours * 60 * 60_000).toISOString();

  const opened = await client
    .execute({
      sql: "SELECT COUNT(*) AS n FROM analytics_events WHERE name = 'voice_call_opened' AND created_at >= ?",
      args: [since],
    })
    .catch(() => null);

  const spoke = await client
    .execute({
      sql: `SELECT COUNT(DISTINCT s.id) AS n FROM sessions s
            JOIN messages m ON m.session_id = s.id
            WHERE s.mode IN (${VOICE_LIST}) AND s.started_at >= ?`,
      args: [since],
    })
    .catch(() => null);

  if (!opened || !spoke) return { opened: 0, spoke: 0, ok: true, reason: "quiet" };
  return voiceVerdict(Number(opened.rows[0]?.n ?? 0), Number(spoke.rows[0]?.n ?? 0));
}
