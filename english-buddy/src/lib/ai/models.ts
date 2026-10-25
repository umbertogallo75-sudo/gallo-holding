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
    best: "gpt-6.1-sol",
    label: "Testo — Sam scritto, correzioni, riepiloghi",
    why: "La pagina di gpt-6-sol rimanda qui: stesso prezzo, conoscenza più recente, e la cache costa metà. Resta la scelta di non prendere Astra, che è costruito per ricerca e codice - lavori che qui non facciamo - e si pagherebbe in latenza, l'unica cosa che una conversazione non può pagare. A ragionamento basso, per restare veloci: il default di questo modello è medio.",
  },
  voice: {
    env: "VOICE_MODEL",
    best: "gpt-realtime-2.1",
    label: "Voce in tempo reale — modalità classica",
    why: "Il modello pieno, non il mini: su un'app di pronuncia la voce non è dove si risparmia.",
  },
  voiceLive: {
    env: "VOICE_LIVE_MODEL",
    best: "gpt-live-1",
    label: "Voce full-duplex — modalità avanzata, a scelta dell'utente",
    why: "Ascolta mentre parla: scioglie il compromesso fra interrompere e rispondere tardi. Nuovo, quindi offerto e non imposto.",
  },
  voiceBrain: {
    env: "VOICE_BRAIN_MODEL",
    best: "gpt-6.1-sol",
    label: "Cervello della voce avanzata — pensa prima di ogni frase di Sam",
    why: "La modalità avanzata non risponde da sé: delega ogni battuta a questo modello, che deve pensare prima che Sam apra bocca. Era la stessa casella del testo scritto, e le due cose non hanno lo stesso bisogno — la chat può permettersi di pensare, una conversazione a voce no. Separata per poter tarare la voce senza toccare la chat.",
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
    why: "SCADE IL 6 GENNAIO 2027. Il 1° ottobre OpenAI ha deprecato tutti i modelli di /v1/audio/speech - tts-1, tts-1-hd e questo - e indica come sostituto gpt-realtime-2.1-mini, che però su quell'endpoint non esiste: è un modello dell'API Realtime. Quindi non è un cambio di nome, è un'altra strada da costruire, e questa casella smette di funzionare da sola a quella data. Su un'app di pronuncia è la voce che il cliente imita: va rifatta prima, non dopo.",
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
  voiceLive: () => process.env.VOICE_LIVE_MODEL,
  voiceBrain: () => process.env.VOICE_BRAIN_MODEL,
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
