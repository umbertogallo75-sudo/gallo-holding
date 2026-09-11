/**
 * The two conversation engines, and the choice between them.
 *
 * ExecLingo's voice has run on OpenAI's turn-based Realtime API since the
 * start. GPT-Live is full-duplex — it listens while it speaks — which
 * dissolves a trade-off this app already lost once: with turns you must pick
 * between a coach who interrupts and a coach who answers late, and both are
 * bad for somebody groping for a word in a second language.
 *
 * The new one is not made the default. It is offered, with the difference
 * explained plainly, and the learner decides — which is also the only honest
 * way to evaluate it, since whether a conversation feels natural cannot be
 * measured from a server.
 */
export const VOICE_ENGINES = ["realtime", "live"] as const;
export type VoiceEngine = (typeof VOICE_ENGINES)[number];

/** What runs unless somebody chooses otherwise: the one with the mileage. */
export const DEFAULT_ENGINE: VoiceEngine = "realtime";

export function isVoiceEngine(value: unknown): value is VoiceEngine {
  return typeof value === "string" && (VOICE_ENGINES as readonly string[]).includes(value);
}

export type EngineCard = {
  engine: VoiceEngine;
  name: string;
  /** One line, on the button. */
  summary: string;
};

export const ENGINE_CARDS: Record<VoiceEngine, EngineCard> = {
  realtime: {
    engine: "realtime",
    name: "Classica",
    summary: "Parli tu, poi risponde Sam. È quella che usi da sempre.",
  },
  live: {
    engine: "live",
    name: "Avanzata",
    summary: "Sam ti ascolta mentre parla: ti lascia finire, anche se ti fermi a pensare.",
  },
};

/**
 * The comparison shown before the choice. Rows are written to be read in
 * fifteen seconds by somebody who wants to start talking, and the last one is
 * the one that would be tempting to leave out.
 */
export const COMPARISON: { label: string; realtime: string; live: string }[] = [
  { label: "Come funziona", realtime: "A turni: uno parla, l'altro ascolta", live: "Ascolta e parla insieme, come al telefono" },
  { label: "Se ti fermi a pensare", realtime: "Sam può partire prima che tu abbia finito", live: "Ti lascia il tempo, e aspetta" },
  { label: "Quanto ci mette a rispondere", realtime: "Subito", live: "Subito" },
  { label: "Interruzioni", realtime: "Capitano, soprattutto a viva voce", live: "Molto più rare" },
  { label: "Da quanto è in uso", realtime: "Mesi, su tutti gli utenti", live: "Nuova: può avere qualche spigolo" },
];

/** Where the choice is kept: on the device, like the theme. */
export const ENGINE_KEY = "execlingo:voice-engine";
