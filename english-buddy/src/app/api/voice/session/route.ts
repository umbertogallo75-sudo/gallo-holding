import { NextResponse } from "next/server";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { billingEnforced, getEntitlement, PAYWALL_MESSAGE } from "@/lib/stripe";
import { ANDROID_PAYWALL_MESSAGE, EMBEDDED_PAYWALL_MESSAGE, embeddedShellOf } from "@/lib/appclient";
import { PHASE_FOCUS, monthPhase } from "@/lib/learning/capabilities";
import { modelFor } from "@/lib/ai/models";
import { ensureTrial } from "@/lib/marketing/trial";

export const maxDuration = 30;

/**
 * Creates a short-lived OpenAI Realtime token so the browser can open a
 * WebRTC voice conversation directly, without our key ever leaving the
 * server. Instructions are personalized from the learning memory.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  // Same door as the written coach: somebody reaching for the microphone is
  // somebody the free trial is for, so it starts here too rather than only
  // from an email link they may never have opened.
  if (billingEnforced() && !(await getEntitlement(userId)).access) {
    await ensureTrial(userId).catch(() => null);
  }
  if (billingEnforced() && !(await getEntitlement(userId)).access) {
    return NextResponse.json({ error: embeddedShellOf(request) === "android" ? ANDROID_PAYWALL_MESSAGE : embeddedShellOf(request) === "ios" ? EMBEDDED_PAYWALL_MESSAGE : PAYWALL_MESSAGE, upgradeUrl: "/abbonamento" }, { status: 402 });
  }
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

  const instructions = `You are Sam, the warm spoken English coach of the ExecLingo app, talking with ${row?.display_name || "an Italian professional"} (level ${level}).
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
      // Comfortably longer than the 15 minutes the call itself lasts. When the
      // two numbers were equal, the seconds spent asking for the microphone
      // and negotiating the connection came out of the conversation's end —
      // and a call that dies on its own credential looks, from the sofa,
      // exactly like the crash the graceful ending exists to avoid.
      expires_after: { anchor: "created_at", seconds: 1800 },
      session: {
        type: "realtime",
        model: modelFor("voice"),
        instructions,
        audio: {
          input: {
            transcription: {
              model: modelFor("transcribe"),
              // Both languages, because that is what actually happens: they
              // speak English and drop into Italian when stuck. Left to guess,
              // the transcriber turned a burst of speaker echo into Chinese
              // characters and put them in the learner's mouth.
              languages: ["en", "it"],
              prompt:
                "An Italian professional practising business English with a coach. They speak English, and sometimes Italian when they are stuck. Never transcribe into any other language.",
            },
            // Far field, not near.
            //
            // Near field is the setting for a microphone next to a mouth — a
            // headset. It was chosen on the assumption of a phone held in the
            // hand, and the assumption was wrong: people put the phone on the
            // table and use the loudspeaker, which is a metre away, in a room,
            // with the coach's own voice coming out of it. That is precisely
            // the case far field exists for, and it is the case where the far
            // end kept hearing speech in a silent room and cutting itself off.
            //
            // On headphones this filters a little more than strictly needed,
            // which costs nothing: headphones were the configuration that
            // already worked.
            noise_reduction: { type: "far_field" },
            // Semantic rather than level-based: it judges whether the speaker
            // actually meant to take a turn instead of reacting to whatever
            // crossed a volume threshold.
            //
            // Medium, not low. Low was added to stop Sam being interrupted,
            // but the interruptions were speaker echo and echo cancellation
            // fixes that at the source. What low bought instead was a long
            // silence after the learner stopped talking — on speakerphone,
            // long enough that people asked whether the app had broken. A
            // coach who answers late is a worse problem than one who
            // occasionally answers early.
            turn_detection: { type: "semantic_vad", eagerness: "medium" },
          },
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

  return NextResponse.json({ clientSecret: json.value, model: modelFor("voice") });
}
