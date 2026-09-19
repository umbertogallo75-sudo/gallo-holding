import { GLOSSARY, type Entry } from "./glossary";

/**
 * Ascolta e scegli: ten questions in a row, each one a word spoken in English
 * and three Italian meanings to choose between. One clock for the lot, so it
 * is a run rather than ten separate decisions.
 *
 * The hard part of a multiple-choice question is not the right answer, it is
 * the wrong ones: two decoys that are plainly absurd teach nothing, and two
 * that are near-synonyms are unfair. These are drawn at random from the rest
 * of the glossary and only rejected when they say the same thing.
 */

export const QUESTIONS = 10;
export const RUN_SECONDS = 75;
export const OPTIONS = 3;
/** Seconds a right answer buys back, so a good run breathes. */
export const BONUS_SECONDS = 3;

export type Question = {
  /** The English word, spoken aloud rather than shown. */
  word: string;
  /** The three Italian meanings, already shuffled. */
  options: string[];
  /** Index into `options`. */
  answer: number;
  /** Where it came from, so a review can be written back. */
  itemText: string | null;
};

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Two meanings that share a word are too close to be told apart fairly. */
export function tooClose(a: string, b: string): boolean {
  const parts = (text: string) =>
    new Set(
      text
        .toLowerCase()
        .split(/[^a-zàèéìòù]+/)
        .filter((part) => part.length > 3)
    );
  const left = parts(a);
  for (const word of parts(b)) if (left.has(word)) return true;
  return false;
}

/**
 * How near two Italian glosses are, without being the same thing.
 *
 * Shared letter-triples plus a similar length: crude, but it is enough to put
 * "fattura" beside "preventivo" instead of beside "ordine del giorno", and
 * that is the whole difference between a question and a giveaway.
 */
export function nearness(a: string, b: string): number {
  const grams = (text: string) => {
    const clean = text.toLowerCase().replace(/[^a-zàèéìòù ]/g, "");
    const out = new Set<string>();
    for (let i = 0; i < clean.length - 2; i += 1) out.add(clean.slice(i, i + 3));
    return out;
  };
  const left = grams(a);
  const right = grams(b);
  let shared = 0;
  for (const gram of right) if (left.has(gram)) shared += 1;
  const overlap = shared / Math.max(1, Math.min(left.size, right.size));
  const lengthGap = Math.abs(a.length - b.length) / Math.max(a.length, b.length, 1);
  return overlap - lengthGap * 0.5;
}

/**
 * Builds a run. `own` are the learner's own expressions, which go in first so
 * the game reviews what they are actually learning; the glossary fills the
 * rest.
 */
export function buildRun(own: Entry[], random: () => number, count = QUESTIONS): Question[] {
  const ownUsable = own.filter((entry) => entry.word.trim() !== "" && entry.it.trim() !== "");
  const pool = [...ownUsable, ...shuffle(GLOSSARY, random)];

  const chosen: Entry[] = [];
  const used = new Set<string>();
  for (const entry of pool) {
    const key = entry.word.toLowerCase();
    if (used.has(key)) continue;
    used.add(key);
    chosen.push(entry);
    if (chosen.length === count) break;
  }

  return chosen.map((entry) => {
    const decoys: string[] = [];
    // The wrong answers are the exercise.
    //
    // They used to be picked at random from the whole glossary, which meant a
    // word about invoices sat beside one about airports and the answer could
    // be found without hearing anything — "troppo semplice individuare la
    // risposta esatta", as a tester put it. Candidates are now ranked by how
    // near they are to the right answer, and the nearest ones that are still
    // fairly distinguishable are the ones offered.
    const ranked = shuffle(GLOSSARY, random)
      .filter((candidate) => candidate.word.toLowerCase() !== entry.word.toLowerCase())
      .filter((candidate) => !tooClose(candidate.it, entry.it))
      .map((candidate) => ({ candidate, near: nearness(candidate.it, entry.it) }))
      .sort((a, b) => b.near - a.near);
    for (const { candidate } of ranked) {
      if (decoys.length >= OPTIONS - 1) break;
      if (decoys.some((decoy) => tooClose(decoy, candidate.it))) continue;
      decoys.push(candidate.it);
    }
    while (decoys.length < OPTIONS - 1) {
      const filler = GLOSSARY[(decoys.length * 37 + entry.word.length) % GLOSSARY.length].it;
      if (filler !== entry.it && !decoys.includes(filler)) decoys.push(filler);
      else decoys.push(`${filler} ·`);
    }
    const options = shuffle([entry.it, ...decoys], random);
    return {
      word: entry.word,
      options,
      answer: options.indexOf(entry.it),
      itemText: ownUsable.includes(entry) ? entry.word : null,
    };
  });
}

export function verdict(correct: number, total: number): string {
  if (total === 0) return "Nessuna domanda: riprova tra poco.";
  const share = correct / total;
  if (share === 1) return "Dieci su dieci. L'orecchio c'è.";
  if (share >= 0.8) return "Quasi tutte. Le due mancate erano quelle veloci.";
  if (share >= 0.5) return "Metà buona. Riascoltare la parola prima di scegliere aiuta più di quanto sembri.";
  return "Difficile. È normale all'inizio: l'ascolto è il muscolo che ci mette di più.";
}
