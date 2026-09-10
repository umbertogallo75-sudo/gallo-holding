import { GLOSSARY, type Entry } from "./glossary";

/**
 * Parola lunga.
 *
 * Quattro lettere chiede una parola e passa oltre. Questo dà sette, otto o
 * nove lettere e chiede tutte le parole che ci stanno dentro: quelle corte
 * comprano secondi e ti tengono in vita, quella che usa tutte le lettere è il
 * colpo grosso e apre il gruppo successivo.
 *
 * The letters are always a real word's letters, so a full-length answer always
 * exists — the tray is never a dead end. Which words are findable is computed
 * from the glossary at load, not written by hand, so every word added to the
 * dictionary enriches every tray at once.
 */

export const MIN_WORD = 4;
export const START_SECONDS = 120;
/** Bought back by any word found. */
export const WORD_SECONDS = 3;
/** Bought back by the word that uses every letter. */
export const FULL_SECONDS = 15;
/** The cost of walking away from a tray. */
export const SKIP_SECONDS = 10;
/** A tray needs at least this many findable words to be worth playing. */
export const MIN_FINDABLE = 5;

export type Tray = {
  /** The letters, jumbled. Always some real word's letters. */
  letters: string[];
  /** The word that uses all of them. */
  full: string;
  /** Every glossary word these letters can spell, longest first. */
  findable: Entry[];
};

export type Found = { word: string; it: string; points: number; full: boolean };

function letterCount(word: string): Map<string, number> {
  const out = new Map<string, number>();
  for (const letter of word) out.set(letter, (out.get(letter) ?? 0) + 1);
  return out;
}

/** True when `word` can be spelled from `letters`, each letter used once. */
export function fitsIn(word: string, letters: string): boolean {
  const pool = letterCount(letters);
  for (const letter of word) {
    const left = pool.get(letter) ?? 0;
    if (left === 0) return false;
    pool.set(letter, left - 1);
  }
  return true;
}

/** Longer words are worth disproportionately more: that is the whole pull. */
export function pointsFor(length: number): number {
  if (length <= 4) return 50;
  if (length === 5) return 90;
  if (length === 6) return 140;
  if (length === 7) return 200;
  if (length === 8) return 280;
  // Trays go up to nine, so nine has to be worth more than eight — otherwise
  // the biggest tray pays the same as the one below it.
  return 380;
}

function findableFor(mother: string): Entry[] {
  return GLOSSARY.filter(
    (entry) => entry.word !== mother && entry.word.length >= MIN_WORD && fitsIn(entry.word, mother)
  ).sort((a, b) => b.word.length - a.word.length || a.word.localeCompare(b.word));
}

/**
 * The trays worth dealing, worked out once at load. A mother word qualifies on
 * length and on how much it hides: a tray with two answers is a puzzle, not a
 * round.
 */
export const TRAYS: Tray[] = GLOSSARY.filter((entry) => entry.word.length >= 6 && entry.word.length <= 9)
  .map((entry) => ({ letters: entry.word.split(""), full: entry.word, findable: findableFor(entry.word) }))
  .filter((tray) => tray.findable.length >= MIN_FINDABLE);

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function dealTray(random: () => number, avoid: Set<string> = new Set()): Tray {
  const fresh = TRAYS.filter((tray) => !avoid.has(tray.full));
  const pool = fresh.length > 0 ? fresh : TRAYS;
  const tray = pool[Math.floor(random() * pool.length)];
  return { ...tray, letters: shuffle(tray.letters, random) };
}

/** Re-jumbles the same letters — the free button, which must visibly change. */
export function reshuffle(tray: Tray, random: () => number): Tray {
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const letters = shuffle(tray.letters, random);
    if (letters.join("") !== tray.letters.join("")) return { ...tray, letters };
  }
  return tray;
}

export type Attempt =
  | { ok: true; word: string; it: string; points: number; full: boolean }
  | { ok: false; reason: "too_short" | "already_found" | "not_a_word" };

export function judge(tray: Tray, attempt: string, alreadyFound: string[]): Attempt {
  const word = attempt.toLowerCase();
  if (word.length < MIN_WORD) return { ok: false, reason: "too_short" };
  if (alreadyFound.includes(word)) return { ok: false, reason: "already_found" };
  if (word === tray.full) {
    return { ok: true, word, it: GLOSSARY.find((e) => e.word === word)?.it ?? "", points: pointsFor(word.length) * 2, full: true };
  }
  const entry = tray.findable.find((candidate) => candidate.word === word);
  if (!entry) return { ok: false, reason: "not_a_word" };
  return { ok: true, word, it: entry.it, points: pointsFor(word.length), full: false };
}

/** How much of a tray a player actually got, for the end screen. */
export function coverage(tray: Tray, found: string[]): { got: number; outOf: number } {
  return { got: found.length, outOf: tray.findable.length + 1 };
}

export function verdict(score: number, fulls: number): string {
  if (score === 0) return "Nessuna parola. Il trucco è cominciare dalle corte: comprano tempo.";
  if (fulls >= 3) return "Tre parole intere o più. Vedi le lettere come le vede un madrelingua.";
  if (fulls >= 1) return "Hai trovato la parola lunga. È quella che vale il doppio.";
  if (score < 400) return "Buon inizio. Le parole da quattro tengono in vita, quelle lunghe fanno il punteggio.";
  return "Ottimo bottino, tutto con parole corte. Ora prova a vedere quella che usa tutte le lettere.";
}
