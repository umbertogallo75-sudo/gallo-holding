import type { GameWord } from "./words";

/**
 * Word Sprint: a tray of jumbled letters, one word to rebuild, a clock.
 *
 * The mechanic is the familiar one — tap letters to spell the word before the
 * timer runs out — and everything specific to ExecLingo is in where the words
 * come from and what happens afterwards: the ones you miss come back sooner,
 * because a wrong answer resets the spaced-repetition interval exactly as a
 * missed review does inside a session with Sam.
 */

export const ROUNDS_PER_GAME = 8;
export const ROUND_SECONDS = 30;
/** Points for a correct word, before the clock and the streak are added. */
export const BASE_POINTS = 100;
/** Every whole second left on the clock is worth this much. */
export const POINTS_PER_SECOND = 4;
/** Each consecutive correct word adds this, capped so a run stays winnable. */
export const STREAK_BONUS = 25;
export const MAX_STREAK_BONUS = 150;
/** Letters offered beyond the ones the word needs, by word length. */
export const MAX_TRAY = 12;

export type Round = {
  word: string;
  hint: string;
  /** Shuffled: the word's own letters plus decoys. */
  tray: string[];
  source: GameWord["source"];
  itemText: string | null;
};

/** A short word needs more decoys than a long one to stay interesting. */
export function decoyCount(wordLength: number): number {
  if (wordLength <= 5) return 4;
  if (wordLength <= 7) return 3;
  return 2;
}

// Frequencies close enough to written English that decoys do not stand out as
// a row of q/x/z, which would make them trivially ignorable.
const DECOY_POOL = "eeeeaaaorrriiinnttllssuudcmphgbfywkv";

/**
 * Deterministic shuffle: the caller passes the randomness, so a round can be
 * rebuilt exactly in a test.
 */
export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

export function buildRound(entry: GameWord, random: () => number): Round {
  const letters = entry.word.split("");
  const decoys = Math.min(decoyCount(letters.length), Math.max(0, MAX_TRAY - letters.length));
  for (let i = 0; i < decoys; i += 1) {
    letters.push(DECOY_POOL[Math.floor(random() * DECOY_POOL.length)]);
  }
  return {
    word: entry.word,
    hint: entry.hint,
    tray: shuffle(letters, random),
    source: entry.source,
    itemText: entry.itemText,
  };
}

/**
 * The tray must be able to spell the word — with decoys drawn at random it
 * always can, but a caller that builds trays another way should check.
 */
export function traySpells(tray: string[], word: string): boolean {
  const pool = new Map<string, number>();
  for (const letter of tray) pool.set(letter, (pool.get(letter) ?? 0) + 1);
  for (const letter of word) {
    const left = pool.get(letter) ?? 0;
    if (left === 0) return false;
    pool.set(letter, left - 1);
  }
  return true;
}

export function roundScore(secondsLeft: number, streak: number): number {
  const clock = Math.max(0, Math.floor(secondsLeft)) * POINTS_PER_SECOND;
  const run = Math.min(Math.max(0, streak) * STREAK_BONUS, MAX_STREAK_BONUS);
  return BASE_POINTS + clock + run;
}

/** A small, honest verdict for the end screen. */
export function verdict(correct: number, total: number): string {
  if (total === 0) return "Nessuna parola: riprova più tardi.";
  const share = correct / total;
  if (share === 1) return "Tutte. Queste parole non ti fermano più.";
  if (share >= 0.75) return "Quasi tutte. Quelle sbagliate torneranno presto.";
  if (share >= 0.4) return "Buon lavoro: le parole mancate tornano nei prossimi giorni.";
  return "Parole difficili. Le rivedrai prestissimo — è esattamente il punto.";
}
