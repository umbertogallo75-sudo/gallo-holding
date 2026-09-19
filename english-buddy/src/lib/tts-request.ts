/**
 * The body of an OpenAI speech request for Sam's voice.
 *
 * Extracted from the route for one reason: `instructions` is rejected by
 * `tts-1`, and `OPENAI_TTS_MODEL` is an environment variable, so a value set
 * in the dashboard could turn every listen button into a 400 without anyone
 * touching the code. The branch is worth a test.
 */
export type TtsLang = "en-US" | "en-GB" | "en-AU" | "en-IE" | "en-SCT";

/**
 * The accents Sam can be asked for.
 *
 * Named rather than coded, because the accent travels in the delivery note
 * the model reads. The reason they exist at all is a tester's: the English
 * you will actually have to understand belongs to somebody in particular —
 * the Scottish supplier, the Australian client — and somebody who has only
 * ever heard one accent has not learned to listen, only to recognise.
 */
const ACCENT_NAMES: Record<TtsLang, string> = {
  "en-US": "standard American English",
  "en-GB": "standard British English (RP)",
  "en-AU": "Australian English",
  "en-IE": "Irish English",
  "en-SCT": "Scottish English",
};

export function isLegacyTts(model: string): boolean {
  return model.startsWith("tts-1");
}

/** How Sam should sound. Only the newer speech models can be told this. */
export function delivery(slow: boolean, lang: TtsLang): string {
  return [
    "Voice: a warm, calm male mentor. Encouraging, never rushed, never loud.",
    `Accent: ${ACCENT_NAMES[lang] ?? ACCENT_NAMES["en-US"]}. Keep it natural and clear, never a caricature.`,
    slow
      ? "Delivery: distinctly slower than conversation, every syllable articulated, a small pause between words. An Italian learner is repeating after you."
      : "Delivery: natural conversational pace, but crisp — no mumbling, no swallowed word endings. This audio is the pronunciation model the learner copies.",
    "Read the text exactly as written. Add nothing: no greeting, no comment, no spelling out.",
  ].join("\n");
}

/**
 * Sam's voice. `cedar` is the same voice the realtime call uses, which is the
 * point: before this, the listen buttons and the voice conversation were two
 * different men, and the app's own coach did not sound like himself.
 */
export const SAM_VOICE = "cedar";

export function ttsRequest(opts: { model: string; voice: string; text: string; rate?: number; lang?: TtsLang }) {
  // The turtle button, from the server's side: anything below conversational.
  const slow = (opts.rate ?? 1) < 0.9;
  const legacy = isLegacyTts(opts.model);
  return {
    model: opts.model,
    voice: opts.voice,
    // Italian glosses in brackets are for the eye, not the ear.
    input: opts.text.replace(/\([^)]*\)/g, ""),
    // On the new model the slowness is carried by the delivery note, so the
    // speed dial only nudges: asking for both at once sounds dragged.
    speed: legacy ? (opts.rate ?? 0.95) : slow ? 0.9 : 1,
    response_format: "mp3",
    ...(legacy ? {} : { instructions: delivery(slow, opts.lang ?? "en-US") }),
  };
}
