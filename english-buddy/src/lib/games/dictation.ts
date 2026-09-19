/**
 * Ascolta e scrivi, as a game.
 *
 * It was a coaching mode: Sam sent a sentence hidden inside a chat turn and
 * you typed it back. A tester asked for the obvious thing — make it a game.
 * Ten sentences, a clock on each, a score, and a level that goes up when you
 * get all ten. And take the microphone out of it: a written dictation with a
 * "speak" button is a name that lies about what the exercise is.
 *
 * The accents are his idea and the best one in the document: the English you
 * will actually have to understand belongs to somebody in particular — the
 * Scottish supplier, the Australian client — and a learner who only ever
 * hears one accent has not learned to listen, only to recognise.
 */

export type Accent = "en-GB" | "en-US" | "en-AU" | "en-IE" | "en-SCT";

export const ACCENTS: { key: Accent; flag: string; label: string; note: string }[] = [
  { key: "en-GB", flag: "🇬🇧", label: "Britannico", note: "Londra, Home Counties" },
  { key: "en-US", flag: "🇺🇸", label: "Americano", note: "Il più comune nelle call" },
  { key: "en-AU", flag: "🇦🇺", label: "Australiano", note: "Vocali lunghe, ritmo piatto" },
  { key: "en-IE", flag: "🇮🇪", label: "Irlandese", note: "Musicale, consonanti dolci" },
  { key: "en-SCT", flag: "🏴󠁧󠁢󠁳󠁣󠁴󠁿", label: "Scozzese", note: "Il più duro: provalo all'ultimo" },
];

export function isAccent(value: string | null | undefined): value is Accent {
  return ACCENTS.some((accent) => accent.key === value);
}

export const SENTENCES_PER_GAME = 10;
/** Seconds to write one sentence. Enough to think, not enough to look it up. */
export const SECONDS_PER_SENTENCE = 30;
/** Levels: the sentences get longer and the English less forgiving. */
export const MAX_LEVEL = 5;

type Level = 1 | 2 | 3 | 4 | 5;

const BANK: Record<Level, string[]> = {
  1: [
    "The meeting starts at ten.",
    "Can you send me the file?",
    "The price is forty euros.",
    "I work in sales.",
    "See you on Monday.",
    "My flight is at six.",
    "Could you repeat that?",
    "The hotel is near the station.",
    "We need two rooms.",
    "I would like a coffee.",
    "The office is closed today.",
    "Let me check my calendar.",
  ],
  2: [
    "I will send the offer tomorrow morning.",
    "The invoice is due in thirty days.",
    "We are meeting the supplier on Thursday.",
    "Could you speak a little more slowly, please?",
    "The delivery will take about three weeks.",
    "I am afraid that date does not work for me.",
    "Let me introduce my colleague from the finance team.",
    "The contract is ready for your signature.",
    "We booked a table for seven o'clock.",
    "Our revenue grew by twelve per cent last year.",
    "I will get back to you by the end of the week.",
    "The flight was delayed by two hours.",
  ],
  3: [
    "We would need a firm commitment before we can hold that price.",
    "I am not sure I follow — could you walk me through it again?",
    "The proposal looks fine, but the payment terms are a problem.",
    "Let us park that for now and come back to it at the end.",
    "Our margins have been under pressure since the spring.",
    "I would rather agree the scope first and the budget afterwards.",
    "Could we push the call back to Wednesday afternoon?",
    "We are happy with the product, less so with the lead time.",
    "That figure includes shipping but not installation.",
    "I will need to run this past my board before I can confirm.",
  ],
  4: [
    "If we commit to a twelve-month contract, what can you do on the unit price?",
    "The forecast assumes we keep the same volumes through the second half.",
    "I appreciate the offer, but it is still some way from where we need to be.",
    "We have been burned by a supplier on deadlines before, so I will be blunt about penalties.",
    "Let me be clear: the deadline is not negotiable, everything else is.",
    "The cash flow is healthy, but the working capital ties up more than I would like.",
    "Before we go further, I would like to understand how you handle a shortfall.",
    "That was not what we agreed in the last call, and I have the notes in front of me.",
  ],
  5: [
    "Assuming the due diligence throws up nothing unexpected, we could close before the end of the quarter.",
    "What I would push back on is the assumption that volumes hold up in a softer market.",
    "We are prepared to move on price, provided the payment terms come down to thirty days.",
    "The board will want to see the downside case before signing off on anything of this size.",
    "I would rather we were honest about the risk now than discover it halfway through the project.",
    "There is a gap between what the contract says and what has actually been happening on site.",
  ],
};

export type Round = { sentence: string; level: number };

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function levelOf(value: number): Level {
  return Math.min(MAX_LEVEL, Math.max(1, Math.round(value || 1))) as Level;
}

/**
 * A game's worth of sentences at this level, with a couple from the level
 * below so it opens in the hand rather than at the throat.
 */
export function buildGame(level: number, random: () => number, count = SENTENCES_PER_GAME): Round[] {
  const current = levelOf(level);
  const easier = levelOf(current - 1);
  const warmUp = current === easier ? [] : shuffle(BANK[easier], random).slice(0, 2);
  const main = shuffle(BANK[current], random);
  const rounds = [...warmUp, ...main].slice(0, count);
  return rounds.map((sentence) => ({ sentence, level: BANK[current].includes(sentence) ? current : easier }));
}

/** Words as a dictation should compare them: case, commas and full stops are not the exercise. */
export function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[’']/g, "'")
    .replace(/[^a-z' ]/g, " ")
    .split(/\s+/)
    .filter(Boolean);
}

export type Judgement = {
  /** 0 to 1: the share of the sentence they actually caught. */
  share: number;
  perfect: boolean;
  /** Points for this sentence. */
  points: number;
  /** The words they missed, for the review at the end. */
  missed: string[];
};

/**
 * Marks one sentence.
 *
 * Word by word, in order, and not all-or-nothing: a dictation graded as
 * pass/fail tells somebody who caught nine words out of ten exactly the same
 * thing as somebody who caught none, which is both wrong and discouraging.
 */
export function judge(expected: string, typed: string, secondsLeft = 0): Judgement {
  const want = words(expected);
  const got = new Set(words(typed));
  const missed = want.filter((word) => !got.has(word));
  const share = want.length === 0 ? 0 : (want.length - missed.length) / want.length;
  const perfect = missed.length === 0 && words(typed).length === want.length;
  // The clock pays only for a sentence actually caught, so racing through
  // with nonsense earns nothing.
  const speed = perfect ? Math.round(Math.max(0, secondsLeft) / 3) : 0;
  const points = Math.round(share * 100) + (perfect ? 40 : 0) + speed;
  return { share, perfect, points, missed };
}

export function verdict(perfect: number, total: number, levelUp: boolean): string {
  if (total === 0) return "Nessuna frase: riprova fra poco.";
  if (levelUp) return "Dieci su dieci. Livello superato: la prossima partita è più dura.";
  const share = perfect / total;
  if (share >= 0.8) return "Quasi tutte perfette. Ti sfugge ancora qualche finale di parola.";
  if (share >= 0.5) return "Metà buona. Le frasi lunghe sono quelle che ti scappano: riascoltale due volte.";
  if (share >= 0.2) return "Si sente che l'accento ti mette in difficoltà. È esattamente per questo che serve.";
  return "Duro. Prova a scendere di livello o a cambiare accento: si comincia da dove si capisce.";
}

/** All ten perfect is what moves the level, nothing else. */
export function nextLevel(level: number, perfect: number, total: number): number {
  return perfect === total && total >= SENTENCES_PER_GAME ? Math.min(MAX_LEVEL, levelOf(level) + 1) : levelOf(level);
}
