import { NextResponse } from "next/server";
import { z } from "zod";
import { getUserId } from "@/lib/auth";
import { clientKey, rateLimit } from "@/lib/rate-limit";

export const maxDuration = 30;

const bodySchema = z.object({
  text: z.string().trim().min(1).max(400),
  rate: z.number().min(0.5).max(1.2).optional(),
  lang: z.enum(["en-US", "en-GB"]).optional(),
});

/**
 * Sam's voice, spoken by the server.
 *
 * The listen buttons normally use the device's own speech synthesis, which is
 * free and instant. Inside the Android app there is no synthesis behind the
 * API — the object exists, the button appears, and nothing is heard. This is
 * the fallback the browser calls when that happens, so an English phrase can
 * always be heard whatever the phone is running.
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
    body: JSON.stringify({
      model: process.env.OPENAI_TTS_MODEL || "tts-1",
      // Male and warm, to match the voice Sam already has on iOS.
      voice: process.env.SAM_TTS_VOICE || "onyx",
      input: parsed.data.text.replace(/\([^)]*\)/g, ""),
      speed: parsed.data.rate ?? 0.95,
      response_format: "mp3",
    }),
  }).catch(() => null);

  if (!response?.ok) {
    console.error(`TTS upstream ${response?.status ?? "network"}`);
    return NextResponse.json({ error: "Voce non disponibile ora." }, { status: 502 });
  }

  return new NextResponse(response.body, {
    headers: {
      "Content-Type": "audio/mpeg",
      // Same phrase, same audio: worth keeping for a day on the device.
      "Cache-Control": "private, max-age=86400",
    },
  });
}
