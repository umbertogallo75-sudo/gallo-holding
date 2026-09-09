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
    // Bounded: after enough tries any remaining collision is accepted rather
    // than looping forever on a glossary that has run out of distinct meanings.
    for (let attempt = 0; attempt < 60 && decoys.length < OPTIONS - 1; attempt += 1) {
      const candidate = GLOSSARY[Math.floor(random() * GLOSSARY.length)];
      if (candidate.word.toLowerCase() === entry.word.toLowerCase()) continue;
      if (tooClose(candidate.it, entry.it)) continue;
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
