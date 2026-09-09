/**
 * Trova l'errore.
 *
 * A sentence with one wrong word in it; tap the word. The sentences that
 * matter are the learner's own — mistakes stores what they said and what they
 * should have said, and the difference between the two is exactly the word to
 * tap. Nothing else in the games department is this personal, and nothing else
 * is as hard for anyone to copy: it needs the learner's own history.
 *
 * When there is no usable history yet, the bank carries the errors Italian
 * speakers make in English, which is a better first game than a generic one.
 */

export const QUESTIONS = 8;
export const RUN_SECONDS = 90;
export const BONUS_SECONDS = 4;

export type Puzzle = {
  /** The sentence, split into tappable words. */
  words: string[];
  /** Index into `words` of the one that is wrong. */
  wrong: number;
  /** What it should have been. */
  right: string;
  /** Why, in Italian. Short: it is read in two seconds, mid-run. */
  why: string;
  /** The learner's own sentence this came from, for spaced repetition. */
  itemText: string | null;
};

/** Words as a person sees them, with the punctuation left attached. */
export function splitWords(sentence: string): string[] {
  return sentence.trim().split(/\s+/).filter(Boolean);
}

function bare(word: string): string {
  return word.toLowerCase().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
}

/**
 * The one word that changed between what was said and what was correct.
 *
 * Only a single-word substitution makes a fair puzzle: if two words moved, or
 * the sentence was rebuilt, there is no one word to tap and the pair is
 * skipped rather than guessed at.
 */
export function singleWordDiff(said: string, correct: string): { index: number; right: string } | null {
  const from = splitWords(said);
  const to = splitWords(correct);
  if (from.length !== to.length || from.length < 3 || from.length > 14) return null;
  let found: { index: number; right: string } | null = null;
  for (let i = 0; i < from.length; i += 1) {
    if (bare(from[i]) === bare(to[i])) continue;
    if (found) return null; // more than one word moved
    if (bare(from[i]) === "" || bare(to[i]) === "") return null;
    found = { index: i, right: to[i] };
  }
  return found;
}

export function puzzleFrom(said: string, correct: string, why: string | null): Puzzle | null {
  const diff = singleWordDiff(said, correct);
  if (!diff) return null;
  return {
    words: splitWords(said),
    wrong: diff.index,
    right: diff.right,
    why: (why ?? "").trim() || `Si dice «${diff.right}».`,
    itemText: correct,
  };
}

/** The errors Italian speakers actually make, for a learner with no history. */
const BANK: { said: string; correct: string; why: string }[] = [
  { said: "I have 25 years old", correct: "I am 25 years old", why: "L'età in inglese si è, non si ha." },
  { said: "She is working here from 2019", correct: "She is working here since 2019", why: "«Since» indica il punto di partenza nel tempo." },
  { said: "We can discuss it in the next meeting", correct: "We can discuss it at the next meeting", why: "Alle riunioni si è «at», non «in»." },
  { said: "We are five people in the team", correct: "There are five people in the team", why: "Per dire quanti sono si usa «there are»." },
  { said: "I need some informations about the offer", correct: "I need some information about the offer", why: "«Information» non ha plurale." },
  { said: "We arrived at Milan yesterday evening", correct: "We arrived in Milan yesterday evening", why: "Nelle città si arriva «in»." },
  { said: "I have forgot my laptop", correct: "I have forgotten my laptop", why: "Il participio di «forget» è «forgotten»." },
  { said: "She said me that it was late", correct: "She told me that it was late", why: "«Say» non vuole la persona; «tell» sì." },
  { said: "Can you borrow me your pen", correct: "Can you lend me your pen", why: "Chi presta «lends»; chi prende in prestito «borrows»." },
  { said: "Let's fix a date for the call", correct: "Let's set a date for the call", why: "Una data si «sets»: «fix» è riparare." },
  { said: "I look forward to hear from you", correct: "I look forward to hearing from you", why: "Dopo «look forward to» ci va il gerundio." },
  { said: "He is responsible of the project", correct: "He is responsible for the project", why: "«Responsible» regge «for»." },
  { said: "I did a mistake in the report", correct: "I made a mistake in the report", why: "Gli errori si «make», non si «do»." },
  { said: "Please, make attention to the dates", correct: "Please pay attention to the dates", why: "All'attenzione si «pays»." },
  { said: "The meeting is at Monday at nine", correct: "The meeting is on Monday at nine", why: "I giorni della settimana vogliono «on»." },
  { said: "I am interested to your proposal", correct: "I am interested in your proposal", why: "«Interested» regge «in»." },
  { said: "It depends from the client", correct: "It depends on the client", why: "«Depend» regge «on»." },
  { said: "I have a doubt about this clause", correct: "I have a question about this clause", why: "In inglese si fa una domanda, non si ha un dubbio." },
  { said: "This report is very more detailed", correct: "This report is much more detailed", why: "Il comparativo si rafforza con «much», non con «very»." },
  { said: "He suggested me to call the client", correct: "He advised me to call the client", why: "«Suggest» non regge la persona; «advise» sì." },
  { said: "This is the more important point", correct: "This is the most important point", why: "Il superlativo lungo vuole «most»." },
  { said: "Actually I work in Milan", correct: "Currently I work in Milan", why: "«Actually» significa «in realtà», non «attualmente»." },
  { said: "I will send you the invoice eventually", correct: "I will send you the invoice later", why: "«Eventually» significa «alla fine», non «eventualmente»." },
  { said: "Our society has forty employees", correct: "Our company has forty employees", why: "L'azienda è «company»; «society» è la società civile." },
  { said: "The team is composed by five people", correct: "The team is composed of five people", why: "«Composed» regge «of»." },
];

export function bankPuzzles(): Puzzle[] {
  const out: Puzzle[] = [];
  for (const entry of BANK) {
    const puzzle = puzzleFrom(entry.said, entry.correct, entry.why);
    // A bank entry that is not a single-word swap is a bug in the bank, not
    // something to show: the test below fails on it rather than hiding it.
    if (puzzle) out.push({ ...puzzle, itemText: null });
  }
  return out;
}

export const BANK_SIZE = BANK.length;

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Their own mistakes first; the bank fills whatever is left. */
export function buildRun(own: Puzzle[], random: () => number, count = QUESTIONS): Puzzle[] {
  const seen = new Set<string>();
  const out: Puzzle[] = [];
  for (const puzzle of [...own, ...shuffle(bankPuzzles(), random)]) {
    const key = puzzle.words.join(" ").toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(puzzle);
    if (out.length === count) break;
  }
  return out;
}

export function verdict(correct: number, total: number): string {
  if (total === 0) return "Nessuna frase: riprova tra poco.";
  const share = correct / total;
  if (share === 1) return "Tutte. Gli errori li vedi prima di farli.";
  if (share >= 0.7) return "Bene. Vedere l'errore è il primo passo per non ripeterlo.";
  if (share >= 0.4) return "Metà. Le frasi che hai sbagliato tornano nei prossimi giorni.";
  return "Frasi difficili. Sono proprio quelle su cui vale la pena tornare.";
}
