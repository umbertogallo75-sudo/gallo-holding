import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { modelFor } from "@/lib/ai/models";
import { SAM_VOICE, ttsRequest } from "@/lib/tts-request";

export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(400),
  rate: z.number().min(0.5).max(1.2).optional(),
  lang: z.enum(["en-US", "en-GB", "en-AU", "en-IE", "en-SCT"]).optional(),
});

/**
 * Sam's voice, spoken by the server.
 *
 * This is what the listen buttons play — the normal case, not a fallback.
 * The comment here used to say the opposite, describing an older arrangement
 * where the device's own synthesis came first and this was the rescue for
 * phones without one. That changed in the component and not here, which is
 * how a stale comment becomes a wrong one: read today it understates what
 * this route is for, which is every listen button in the app.
 *
 * The device's synthesis is now the last resort, reached only when the
 * network is gone — and good riddance as the default: it varies from phone to
 * phone, and an Italian iPhone reads English with an Italian accent. On a
 * product about pronunciation, the model voice has to be the same for
 * everyone.
 */
export async function POST(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  if (!rateLimit(clientKey(request, "tts"), 40, 60_000).allowed) {
    return NextResponse.json({ error: "Troppe richieste." }, { status: 429 });
  }

  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });

  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) return NextResponse.json({ error: "Voce non configurata" }, { status: 503 });

  const response = await fetch("https://api.openai.com/v1/audio/speech", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify(
      ttsRequest({
        model: modelFor("speech"),
        voice: process.env.SAM_TTS_VOICE || SAM_VOICE,
        text: parsed.data.text,
        rate: parsed.data.rate,
        lang: parsed.data.lang,
      })
    ),
  }).catch(() => null);

  if (!response?.ok) {
    console.error(`TTS upstream ${response?.status ?? "network"}`);
    return NextResponse.json({ error: "Voce non disponibile ora." }, { status: 502 });
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "audio/wav",
      // Same phrase, same audio: worth keeping for a day on the device.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
