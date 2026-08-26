/**
 * Which OpenAI model each part of Sam runs on, in one place.
 *
 * This file exists because of a question that could not be answered from
 * outside: the defaults live in code, but any of them can be overridden by a
 * variable in the hosting dashboard — and that dashboard also holds the real
 * secrets, so it is not a page to go rummaging through to check a model name.
 * The app now answers it itself, on the owner-only admin page.
 *
 * `best` is the deliberate choice, and the reason is written next to it. When
 * a newer model arrives, this is the only file that has to change.
 */
export const MODELS = {
  text: {
    env: "OPENAI_MODEL",
    best: "gpt-5.6-sol",
    label: "Testo — Sam scritto, correzioni, riepiloghi",
    why: "Il modello di punta della famiglia attuale, a ragionamento basso per restare veloce.",
  },
  voice: {
    env: "VOICE_MODEL",
    best: "gpt-realtime-2.1",
    label: "Voce in tempo reale",
    why: "Il modello pieno, non il mini: su un'app di pronuncia la voce non è dove si risparmia.",
  },
  transcribe: {
    env: "VOICE_TRANSCRIBE_MODEL",
    best: "gpt-transcribe",
    label: "Trascrizione durante la chiamata",
    why: "L'opzione ad alta accuratezza; gpt-live-transcribe baratterebbe precisione per latenza.",
  },
  speech: {
    env: "OPENAI_TTS_MODEL",
    best: "gpt-4o-mini-tts",
    label: "Voce dei pulsanti «ascolta»",
    why: "L'unico modello vocale attuale, e il solo che accetta indicazioni di lettura.",
  },
} as const;

export type ModelSlot = keyof typeof MODELS;

/**
 * Read statically, one getter per variable. Bundlers may rewrite
 * `process.env.NAME` but cannot rewrite `process.env[name]`, and a model name
 * silently resolving to undefined in production is exactly the failure this
 * file is meant to make impossible.
 */
const OVERRIDE: Record<ModelSlot, () => string | undefined> = {
  text: () => process.env.OPENAI_MODEL,
  voice: () => process.env.VOICE_MODEL,
  transcribe: () => process.env.VOICE_TRANSCRIBE_MODEL,
  speech: () => process.env.OPENAI_TTS_MODEL,
};

/** The model actually in use: an environment override wins over the default. */
export function modelFor(slot: ModelSlot): string {
  return OVERRIDE[slot]()?.trim() || MODELS[slot].best;
}

export type ModelRow = (typeof MODELS)[ModelSlot] & {
  slot: ModelSlot;
  inUse: string;
  /** True when a dashboard variable is quietly holding back a code change. */
  overridden: boolean;
};

/** Every slot, with whether what is running is what was intended. */
export function modelStatus(): ModelRow[] {
  return (Object.keys(MODELS) as ModelSlot[]).map((slot) => {
    const inUse = modelFor(slot);
    return { slot, ...MODELS[slot], inUse, overridden: inUse !== MODELS[slot].best };
  });
}
