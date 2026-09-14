/**
 * The end of a session, in numbers.
 *
 * Testers asked two things at once: that a session should be able to end, and
 * that ending it should be worth something. A score answers both — it gives
 * the conversation a finish line, and it turns "we talked for a while" into
 * something you can watch improve.
 *
 * Everything here is computed from what is already stored, with no extra model
 * call: how much they said, how much of it needed correcting, and what they
 * took away. That matters beyond cost — a score that arrives instantly can be
 * shown the moment somebody taps "finish", and a score nobody waits for is a
 * score people actually read.
 */

export type SessionFacts = {
  /** Messages the learner wrote or said. */
  exchanges: number;
  /** Of those, how many came back with a correction. */
  corrected: number;
  /** Expressions Sam recorded as newly taught this session. */
  learned: number;
  /** Wall-clock minutes between the first and last message. */
  minutes: number;
};

export type SessionScore = {
  /** Out of 100. Never punishes for showing up. */
  points: number;
  /** Three or four words, in Italian. */
  headline: string;
  /** One line explaining the number, in Italian. */
  detail: string;
  /** Filled stars out of five, for the eye. */
  stars: number;
};

/** A session shorter than this is a false start, not a session. */
export const MIN_EXCHANGES = 3;
/** Beyond this the conversation has done its job; more adds nothing. */
export const FULL_EXCHANGES = 12;

function clamp(value: number, low: number, high: number): number {
  return Math.min(Math.max(value, low), high);
}

/**
 * Participation is most of the score, on purpose.
 *
 * The temptation is to score accuracy, and it would be the wrong lesson: a
 * learner who says little and says it safely would beat one who reaches for
 * harder sentences and gets them wrong. Accuracy is worth a fifth, and never
 * enough to make silence the winning strategy.
 */
export function scoreSession(facts: SessionFacts): SessionScore {
  const exchanges = Math.max(0, Math.round(facts.exchanges));
  const corrected = clamp(Math.round(facts.corrected), 0, exchanges);
  const learned = Math.max(0, Math.round(facts.learned));

  const participation = clamp(exchanges / FULL_EXCHANGES, 0, 1) * 60;
  // A corrected sentence is not a failure — it is the moment the lesson
  // happened — so the accuracy term starts generous and falls slowly.
  const accuracy = exchanges === 0 ? 0 : clamp(1 - (corrected / exchanges) * 0.8, 0, 1) * 20;
  const takeaway = clamp(learned / 3, 0, 1) * 20;

  const points = Math.round(clamp(participation + accuracy + takeaway, 0, 100));
  const stars = clamp(Math.round(points / 20), exchanges >= MIN_EXCHANGES ? 1 : 0, 5);

  return { points, stars, ...verdict(points, exchanges, learned, corrected) };
}

function verdict(points: number, exchanges: number, learned: number, corrected: number): { headline: string; detail: string } {
  if (exchanges < MIN_EXCHANGES) {
    return {
      headline: "Appena iniziata",
      detail: "Troppo breve per contare davvero. Bastano cinque minuti per farne una vera.",
    };
  }
  if (points >= 85) {
    return {
      headline: "Sessione piena",
      detail: `${exchanges} scambi e ${learned === 1 ? "un'espressione nuova" : `${learned} espressioni nuove`}. È esattamente il ritmo che in tre mesi cambia le cose.`,
    };
  }
  if (points >= 65) {
    return {
      headline: "Bella sessione",
      detail: corrected > 0
        ? `${exchanges} scambi, ${corrected === 1 ? "una correzione" : `${corrected} correzioni`}. Le correzioni sono il momento in cui si impara, non un errore.`
        : `${exchanges} scambi filati lisci. La prossima volta prova frasi più lunghe.`,
    };
  }
  if (points >= 40) {
    return {
      headline: "Buon inizio",
      detail: `${exchanges} scambi. Ancora qualche minuto e la sessione diventa piena — è lì che si sedimenta.`,
    };
  }
  return {
    headline: "Sessione breve",
    detail: `${exchanges} scambi. Meglio poco che niente: torna domani, la costanza conta più della durata.`,
  };
}

/**
 * Whether the conversation has run its course.
 *
 * Testers asked "does a session ever end?" and the honest answer was no: the
 * written coach would go on for as long as somebody kept typing. An endless
 * session has no finish line, so it has no sense of achievement either — and
 * no natural moment to say what was learned.
 */
export function shouldWrapUp(exchanges: number): boolean {
  return exchanges >= FULL_EXCHANGES;
}
