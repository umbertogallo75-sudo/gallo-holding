import { GLOSSARY, type Entry } from "./glossary";
import { OPTIONS, shuffle, tooClose } from "./listen";

/**
 * Flash IT↔EN.
 *
 * Sixty seconds, questions as fast as you can answer them, and the direction
 * flips constantly: sometimes the Italian is shown and you pick the English,
 * sometimes the reverse. Recognising a word and producing it are two different
 * skills, and a game that only ever asks one of them trains half a vocabulary.
 */

export const RUN_SECONDS = 60;
/** Wrong answers cost time; there is no other penalty. */
export const WRONG_SECONDS = 3;

export type Direction = "it-en" | "en-it";

export type Card = {
  direction: Direction;
  /** What is shown. */
  prompt: string;
  /** Three answers, already shuffled. */
  options: string[];
  answer: number;
  /** The pair, for the end screen. */
  word: string;
  it: string;
  itemText: string | null;
};

/** Alternates the two directions, so neither becomes the habit. */
export function directionFor(index: number): Direction {
  return index % 2 === 0 ? "en-it" : "it-en";
}

function decoysFor(entry: Entry, direction: Direction, random: () => number): string[] {
  const decoys: string[] = [];
  for (let attempt = 0; attempt < 60 && decoys.length < OPTIONS - 1; attempt += 1) {
    const candidate = GLOSSARY[Math.floor(random() * GLOSSARY.length)];
    if (candidate.word.toLowerCase() === entry.word.toLowerCase()) continue;
    if (direction === "en-it") {
      if (tooClose(candidate.it, entry.it)) continue;
      if (decoys.some((decoy) => tooClose(decoy, candidate.it))) continue;
      decoys.push(candidate.it);
    } else {
      if (decoys.includes(candidate.word)) continue;
      decoys.push(candidate.word);
    }
  }
  // A glossary that runs out of distinct decoys must not hang the game.
  let filler = 0;
  while (decoys.length < OPTIONS - 1) {
    const candidate = GLOSSARY[(filler * 41 + entry.word.length) % GLOSSARY.length];
    const value = direction === "en-it" ? candidate.it : candidate.word;
    if (value !== (direction === "en-it" ? entry.it : entry.word) && !decoys.includes(value)) decoys.push(value);
    filler += 1;
    if (filler > GLOSSARY.length) break;
  }
  return decoys;
}

export function buildCard(entry: Entry, index: number, random: () => number, own = false): Card {
  const direction = directionFor(index);
  const right = direction === "en-it" ? entry.it : entry.word;
  const options = shuffle([right, ...decoysFor(entry, direction, random)], random);
  return {
    direction,
    prompt: direction === "en-it" ? entry.word : entry.it,
    options,
    answer: options.indexOf(right),
    word: entry.word,
    it: entry.it,
    itemText: own ? entry.word : null,
  };
}

/**
 * A deck long enough that nobody reaches the end inside a minute, with the
 * learner's own expressions dealt first.
 */
export function buildDeck(own: Entry[], random: () => number, size = 40): Card[] {
  const usable = own.filter((entry) => entry.word.trim() !== "" && entry.it.trim() !== "");
  const pool = [...usable, ...shuffle(GLOSSARY, random)];
  const seen = new Set<string>();
  const cards: Card[] = [];
  for (const entry of pool) {
    const key = entry.word.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    cards.push(buildCard(entry, cards.length, random, usable.includes(entry)));
    if (cards.length === size) break;
  }
  return cards;
}

/**
 * When the English is spoken.
 *
 * The first version said it after every answer, which felt like being told
 * what to do a moment too late — and worse, the word was still being spoken
 * when the next card appeared, so you heard one word while reading another.
 *
 * It depends on the direction. When the English is the prompt it is already on
 * screen, so it is spoken as the card appears and never again. When the
 * English is the answer, saying it back is the whole payoff, so it is spoken
 * after the tap — and the card is then held long enough for it to finish.
 */
export function speaksOnAppear(direction: Direction): boolean {
  return direction === "en-it";
}

export function speaksAfterAnswer(direction: Direction): boolean {
  return direction === "it-en";
}

/** How long the answered card stays up before the next one. */
export function advanceDelayMs(direction: Direction, correct: boolean): number {
  // Long enough for a spoken word to finish, so nothing bleeds into the next
  // card; otherwise just long enough to read the result.
  if (speaksAfterAnswer(direction)) return 1200;
  return correct ? 420 : 900;
}

export function verdict(correct: number): string {
  if (correct === 0) return "Nessuna. Riprova: la prima partita serve solo a capire il ritmo.";
  if (correct < 8) return "Un inizio. Il trucco è non rileggere: la prima risposta che ti viene è quasi sempre giusta.";
  if (correct < 16) return "Buon ritmo. Le due direzioni insieme sono più difficili di una sola.";
  if (correct < 26) return "Ottima corsa: riconosci e produci alla stessa velocità.";
  return "Velocità da madrelingua. Le parole ti vengono senza passare dall'italiano.";
}
