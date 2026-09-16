import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { isSyntheticOpener } from "./openers";

/**
 * What happened last time.
 *
 * Sam's memory held everything except the one thing a returning learner
 * notices: the conversation they had yesterday. He knew their level, their
 * mistakes, their due reviews and their capabilities — and opened every
 * single session as though they had just been introduced, asking again what
 * they do for a living and what they want to work on. Testers put it exactly:
 * "riparte da zero e ti dice sempre le stesse cose", and concluded the
 * sessions were not building a path at all.
 *
 * Nothing here is generated or summarised. It is the end of the last
 * conversation and the lines he has already opened with, which is all that
 * was missing — and it costs two indexed queries rather than a model call.
 */
export type Continuity = {
  /** How the previous conversation ended, oldest first. */
  lastLines: { role: string; content: string }[];
  /** When it was, so "yesterday" and "two weeks ago" sound different. */
  daysAgo: number;
  mode: string;
  /** The openings already used, so the next one is not the same again. */
  recentOpenings: string[];
};

const LOOKBACK_SESSIONS = 5;
const TAIL_LINES = 6;

function daysBetween(iso: string): number {
  const then = Date.parse(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(then)) return 0;
  return Math.max(0, Math.floor((Date.now() - then) / 86_400_000));
}

/**
 * The previous conversations, excluding the one being had right now.
 *
 * Returns null for somebody genuinely new — a first session should sound like
 * a first session.
 */
export async function readContinuity(
  userId: string,
  currentSessionId: string | null,
  client: Client = db()
): Promise<Continuity | null> {
  const sessions = await client
    .execute({
      sql: `SELECT s.id, s.mode, MAX(m.created_at) AS last_at,
                   (SELECT content FROM messages WHERE session_id = s.id AND role = 'assistant'
                    ORDER BY created_at ASC, rowid ASC LIMIT 1) AS opening
            FROM sessions s JOIN messages m ON m.session_id = s.id
            WHERE s.user_id = ? AND s.id != ?
            GROUP BY s.id
            HAVING COUNT(CASE WHEN m.role = 'user' THEN 1 END) >= 1
            ORDER BY last_at DESC
            LIMIT ?`,
      args: [userId, currentSessionId ?? "", LOOKBACK_SESSIONS],
    })
    .catch(() => null);

  const rows = sessions?.rows ?? [];
  if (!rows.length) return null;

  const previous = rows[0];
  const tail = await client
    .execute({
      sql: `SELECT role, content FROM messages WHERE session_id = ?
            ORDER BY created_at DESC, rowid DESC LIMIT ?`,
      args: [String(previous.id), TAIL_LINES],
    })
    .catch(() => null);

  const lastLines = (tail?.rows ?? [])
    .map((row) => ({ role: String(row.role), content: String(row.content) }))
    .filter((line) => !(line.role === "user" && isSyntheticOpener(line.content)))
    .reverse();

  return {
    lastLines,
    daysAgo: daysBetween(String(previous.last_at)),
    mode: String(previous.mode),
    recentOpenings: rows
      .map((row) => (row.opening ? String(row.opening) : ""))
      .filter(Boolean)
      .map((line) => line.slice(0, 220)),
  };
}

/** How long ago, in the words a person would use. */
function whenInWords(daysAgo: number): string {
  if (daysAgo <= 0) return "earlier today";
  if (daysAgo === 1) return "yesterday";
  if (daysAgo < 7) return `${daysAgo} days ago`;
  if (daysAgo < 14) return "about a week ago";
  if (daysAgo < 45) return `about ${Math.round(daysAgo / 7)} weeks ago`;
  return "a while ago";
}

/**
 * The part of the prompt that makes a session the next one rather than
 * another first one. Empty for a learner who has never been here.
 */
export function continuityBlock(continuity: Continuity | null): string {
  if (!continuity || !continuity.lastLines.length) return "";
  return `
CONTINUITY — you have met this person before, and this governs your opening line above all else:
- Your last conversation with them was ${whenInWords(continuity.daysAgo)} (mode: ${continuity.mode}). This is how it ended:
${JSON.stringify(continuity.lastLines)}
- Open by picking that thread up: refer to one concrete thing from it — something they told you, or what the two of you were practising — and then move forward. ONE short line. Never summarise the transcript back to them, and never say "last time we..." as a preamble to the same lesson you always give.
- If that thread is finished, take the next step from it rather than starting a new subject from nothing.
- These are opening lines you have already used with this person. Do not reuse them, and do not ask again anything they answer:
${JSON.stringify(continuity.recentOpenings)}
- Never ask again for something they have already told you — their job, their city, their goal, what they want to work on. It is in your memory above. Asking again is the single thing that makes this feel like an app that does not remember them.
- They are following a three-month path, and each session is the next step in it, not a standalone lesson. Make the progression audible: what you worked on last time should visibly lead to what you do today.`;
}
