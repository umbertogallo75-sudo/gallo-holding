import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { PHASE_FOCUS, monthPhase } from "@/lib/learning/capabilities";

export const maxDuration = 30;

const VOICE_MODEL = "gpt-realtime-mini";

/**
 * Creates a short-lived OpenAI Realtime token so the browser can open a
 * WebRTC voice conversation directly, without our key ever leaving the
 * server. Instructions are personalized from the learning memory.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const body = (await request.json().catch(() => ({}))) as { mode?: string };
  const diary = body?.mode === "diary";
  // Voice minutes are the most expensive resource: keep a sane per-user cap.
  if (!rateLimit(clientKey(request, "voice"), 6, 60 * 60_000).allowed) {
    return NextResponse.json({ error: "Voice limit reached for now. Try again in an hour. · Limite voce raggiunto, riprova tra un'ora." }, { status: 429 });
  }

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voice is not configured" }, { status: 500 });

  const result = await db().execute({
    sql: `SELECT p.display_name, p.professional_context, p.starting_level, p.translation_support, p.path_started_at, p.created_at, ls.cefr_level
          FROM profiles p LEFT JOIN learning_state ls ON ls.user_id = p.id WHERE p.id = ? LIMIT 1`,
    args: [userId],
  });
  const row = result.rows[0];
  const level = row?.cefr_level ? String(row.cefr_level) : "B1";
  const beginner = ["A1", "A2"].includes(level) || ["zero", "basics"].includes(String(row?.starting_level ?? ""));
  const phase = monthPhase(row?.path_started_at ? String(row.path_started_at) : row?.created_at ? String(row.created_at) : null);

  const instructions = `You are Sam, the warm spoken English coach of the English Buddy app, talking with ${row?.display_name || "an Italian professional"} (level ${level}).
Their 3-month mission: functional professional English for meetings, finance, negotiation, travel. Month ${phase} focus — ${PHASE_FOCUS[phase]}
${row?.professional_context ? `Their background: ${String(row.professional_context)}.` : ""}
Conversation rules:
- ${beginner ? "SPEAK SLOWLY and use short, simple sentences. If they are lost, explain briefly in Italian, then return to English." : "Speak naturally at a moderate pace. English only unless they are completely stuck."}
- Have a real conversation: one question at a time, react to what they say, keep turns short (max ~3 sentences).
- Gently correct only meaningful or repeated mistakes: say the natural version, let them try it ONCE, then MOVE ON no matter how the attempt went.
- HARD RULE — never loop: never ask them to repeat the same word or sentence more than once in the whole conversation. If the second attempt is still imperfect, TELL THEM transparently and warmly that it's not quite right yet and that you'll bring it back another time — e.g. "Not perfect yet, but don't worry: I'll make this come back in our next sessions. Let's move on."${beginner ? ' (for beginners, say it in Italian too: "Non è ancora perfetta, ma tranquillo: te la riproporrò nelle prossime sessioni. Andiamo avanti.")' : ""} — then continue the conversation. Communication always beats perfection.
- If you did not understand what they said twice in a row, do NOT say "repeat" again: assume a plausible meaning and continue, or ask a simpler question, or offer two options to choose from ("Did you mean X or Y?").
- Prefer topics that matter to them: their day, business, meetings, travel, numbers.
- Your delivery: warm, calm and gentle — a kind mentor, never rushed, never loud.
- Encourage without flattery. Never lecture about grammar.${
    diary
      ? `\nSPOKEN DIARY MODE: this session is their 1-minute spoken diary. Invite them warmly to tell you about their day (work, meetings, anything) for about a minute, in English. Listen with minimal interruptions — only short encouragements ("mm-hm", "go on"). When they finish: give a warm 3-part close: one thing they said well, at most 2 corrections (with the note that you'll bring them back another day), and a naturally-phrased version of one of their sentences. Then say goodbye — keep the whole session short.`
      : ""
  }`;

  const response = await fetch("https://api.openai.com/v1/realtime/client_secrets", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      expires_after: { anchor: "created_at", seconds: 900 },
      session: {
        type: "realtime",
        model: VOICE_MODEL,
        instructions,
        audio: {
          input: { transcription: { model: "gpt-4o-mini-transcribe" } },
          // Sam is male with a warm, gentle delivery: cedar is the natural
          // male voice in the GA Realtime lineup.
          output: { voice: "cedar" },
        },
      },
    }),
  });
  if (!response.ok) {
    console.error("voice session error:", response.status, (await response.text()).slice(0, 300));
    return NextResponse.json({ error: "Voice is temporarily unavailable" }, { status: 502 });
  }
  const json = (await response.json()) as { value?: string };
  if (!json.value) return NextResponse.json({ error: "Voice is temporarily unavailable" }, { status: 502 });

  return NextResponse.json({ clientSecret: json.value, model: VOICE_MODEL });
}
