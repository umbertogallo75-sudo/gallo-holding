/**
 * Where a word game gets its words. Shared by every game in the department,
 * because the point is always the same: play on what this person actually got
 * wrong, and fall back to a business-English bank only when there is nothing
 * of their own yet.
 *
 * Pure functions here; the database reads live in the route.
 */

export type WordSource = "mistake" | "expression" | "bank";

export type GameWord = {
  /** The word to spell, lowercase a–z. */
  word: string;
  /** Shown to the player as the clue — Italian, never containing the answer. */
  hint: string;
  source: WordSource;
  /**
   * The exact text this came from in the learner's own data, so a result can
   * be fed back to spaced repetition. Null for bank words, which are nobody's.
   */
  itemText: string | null;
};

export const MIN_LETTERS = 4;
export const MAX_LETTERS = 9;

/**
 * Mistakes and expressions are stored as written — "I have 25 years",
 * "to touch base". A game needs one spellable word, so take the longest
 * alphabetic run in range and ignore the rest.
 */
export function extractWord(text: string): string | null {
  const candidates = text
    .toLowerCase()
    .split(/[^a-z]+/)
    .filter((part) => part.length >= MIN_LETTERS && part.length <= MAX_LETTERS);
  if (candidates.length === 0) return null;
  // Longest wins: in "to touch base" the interesting word is not "base".
  return candidates.reduce((best, part) => (part.length > best.length ? part : best));
}

/** A clue must never contain the answer, or the game plays itself. */
export function safeHint(hint: string | null | undefined, word: string, fallback: string): string {
  const text = (hint ?? "").trim();
  if (!text) return fallback;
  if (text.toLowerCase().includes(word.toLowerCase())) return fallback;
  return text.length > 90 ? `${text.slice(0, 87)}…` : text;
}

/** Drops repeats and anything unusable, keeping the order it was given. */
export function dedupe(words: GameWord[]): GameWord[] {
  const seen = new Set<string>();
  const out: GameWord[] = [];
  for (const candidate of words) {
    if (candidate.word.length < MIN_LETTERS || candidate.word.length > MAX_LETTERS) continue;
    if (!/^[a-z]+$/.test(candidate.word)) continue;
    if (seen.has(candidate.word)) continue;
    seen.add(candidate.word);
    out.push(candidate);
  }
  return out;
}
