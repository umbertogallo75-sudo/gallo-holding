import { FOUR_LETTER_WORDS, type Entry } from "./four-letters-words";

/**
 * Four letters, one clock.
 *
 * The rules are the ones the genre made familiar: you are dealt four letters,
 * you rearrange them into a real word, and any valid word those letters spell
 * scores — several trays have more than one answer. There are no levels and no
 * rounds. A single countdown runs the whole game, every word buys a little
 * time back, and the clock drains faster the longer you survive, so a run ends
 * when your reading stops keeping up with it.
 *
 * What is ours is what happens after: every word made comes back at the end
 * with what it means in Italian, so a run leaves something behind.
 */

export const LETTERS = 4;
export const START_SECONDS = 60;
/** Bought back by each word — less than a tray costs, so the clock still wins. */
export const BONUS_SECONDS = 4;
export const SKIP_PENALTY_SECONDS = 5;
/** The clock runs at this multiple of real time once a run is going well. */
export const MAX_DRAIN = 2.4;
/** Words needed to reach that ceiling. */
const DRAIN_RAMP = 26;

export type Tray = {
  /** The four letters, jumbled. */
  letters: string[];
  /** Every dictionary word these letters spell. At least one. */
  answers: string[];
};

export type Made = { word: string; it: string };

function key(word: string): string {
  return [...word].sort().join("");
}

/** Words grouped by the letters they share: the game's unit of difficulty. */
export function anagramGroups(entries: Entry[] = FOUR_LETTER_WORDS): Entry[][] {
  const byKey = new Map<string, Entry[]>();
  for (const entry of entries) {
    const k = key(entry.word);
    const group = byKey.get(k);
    if (group) group.push(entry);
    else byKey.set(k, [entry]);
  }
  return [...byKey.values()];
}

const GROUPS = anagramGroups();

export function meaningOf(word: string): string | null {
  return FOUR_LETTER_WORDS.find((entry) => entry.word === word)?.it ?? null;
}

/**
 * How fast the clock runs. One at the start, climbing to MAX_DRAIN — this is
 * the whole difficulty curve, and it is why a run ends.
 */
export function drainRate(score: number): number {
  const progress = Math.min(Math.max(score, 0) / DRAIN_RAMP, 1);
  return 1 + (MAX_DRAIN - 1) * progress;
}

export function shuffle<T>(items: T[], random: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(random() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/**
 * Deals a tray. Early on the game prefers letters with several answers, so the
 * first minute is generous; as the score climbs, single-answer trays come in.
 * `avoid` keeps a run from repeating letters it has already solved.
 */
export function dealTray(score: number, random: () => number, avoid: Set<string> = new Set()): Tray {
  const generous = score < 8;
  const fresh = GROUPS.filter((group) => !avoid.has(key(group[0].word)));
  const pool = fresh.length > 0 ? fresh : GROUPS;
  const preferred = generous ? pool.filter((group) => group.length > 1) : pool;
  const from = preferred.length > 0 ? preferred : pool;
  const group = from[Math.floor(random() * from.length)];
  return {
    letters: shuffle([...group[0].word], random),
    answers: group.map((entry) => entry.word),
  };
}

/** The tray's own letters, re-jumbled — the shuffle button, which is free. */
export function reshuffle(tray: Tray, random: () => number): Tray {
  if (tray.letters.length < 2) return tray;
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const letters = shuffle(tray.letters, random);
    // A shuffle that changes nothing looks like a broken button.
    if (letters.join("") !== tray.letters.join("")) return { ...tray, letters };
  }
  return tray;
}

export function isAnswer(tray: Tray, attempt: string): boolean {
  return tray.answers.includes(attempt.toLowerCase());
}

/** The key that identifies a tray, for the not-twice-in-a-run set. */
export function trayKey(tray: Tray): string {
  return key(tray.letters.join(""));
}

export function verdict(score: number): string {
  if (score === 0) return "Nessuna parola questa volta. Le lettere tornano subito.";
  if (score < 5) return "Un inizio. Il trucco è leggere le lettere ad alta voce.";
  if (score < 12) return "Buon ritmo. L'orologio accelera: da qui in poi è quello il vero avversario.";
  if (score < 22) return "Ottima corsa. Stai leggendo le lettere più in fretta di quanto scenda il tempo.";
  return "Corsa da campione. A questo punto l'orologio va al doppio della velocità.";
}
