/**
 * Numeri e cifre.
 *
 * The thing that actually stops an Italian executive in an English meeting is
 * rarely grammar — it is hearing "fifteen" when someone said "fifty", or
 * losing a zero in "one point four million". So this game only asks for the
 * number: Sam says it, you type the digits.
 *
 * Everything here is pure so it can be tested exhaustively, including the
 * words themselves — a number game that mispronounces a number is worse than
 * no game at all.
 */

export const QUESTIONS = 10;
export const RUN_SECONDS = 90;
export const BONUS_SECONDS = 4;

export type Kind = "plain" | "price" | "percent" | "year" | "decimal";

export type NumberQuestion = {
  kind: Kind;
  /** What Sam says, in English. */
  spoken: string;
  /** What the player has to type, as digits. */
  answer: string;
  /** Shown after answering, so the shape of it is learned too. */
  written: string;
  /** A word of Italian context, so it is a business number and not a riddle. */
  context: string;
};

const ONES = [
  "zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
  "ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen", "eighteen", "nineteen",
];
const TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];

/** Below a thousand, the part every larger number is built from. */
function underThousand(n: number): string {
  if (n < 20) return ONES[n];
  if (n < 100) {
    const tens = TENS[Math.floor(n / 10)];
    const rest = n % 10;
    return rest ? `${tens}-${ONES[rest]}` : tens;
  }
  const hundreds = `${ONES[Math.floor(n / 100)]} hundred`;
  const rest = n % 100;
  return rest ? `${hundreds} and ${underThousand(rest)}` : hundreds;
}

/** English for a whole number, the way it is said out loud. */
export function sayNumber(n: number): string {
  if (n < 0) return `minus ${sayNumber(-n)}`;
  if (n < 1000) return underThousand(n);
  if (n < 1_000_000) {
    const thousands = Math.floor(n / 1000);
    const rest = n % 1000;
    const head = `${underThousand(thousands)} thousand`;
    return rest ? `${head} ${rest < 100 ? "and " : ""}${underThousand(rest)}` : head;
  }
  const millions = Math.floor(n / 1_000_000);
  const rest = n % 1_000_000;
  const head = `${underThousand(millions)} million`;
  return rest ? `${head} ${sayNumber(rest)}` : head;
}

/** Years are said in pairs — nineteen ninety-eight, not one thousand… */
export function sayYear(year: number): string {
  if (year >= 2000 && year < 2010) return `two thousand ${year % 2000 ? ONES[year % 2000] : ""}`.trim();
  if (year >= 2010 && year < 2100) return `twenty ${underThousand(year % 100)}`;
  if (year >= 1000 && year < 2000) {
    const head = Math.floor(year / 100);
    const tail = year % 100;
    if (tail === 0) return `${underThousand(head)} hundred`;
    if (tail < 10) return `${underThousand(head)} oh ${ONES[tail]}`;
    return `${underThousand(head)} ${underThousand(tail)}`;
  }
  return sayNumber(year);
}

/** One decimal place, said the English way: point, then the digit. */
export function sayDecimal(value: number): string {
  const whole = Math.floor(value);
  const decimal = Math.round((value - whole) * 10);
  return `${sayNumber(whole)} point ${ONES[decimal]}`;
}

/**
 * Digits as typed, made comparable. People type 1,500 or 1.500 or 1 500 for
 * the same number, and a game that rejects any of those is just annoying;
 * a decimal comma and a decimal point are the same thing too.
 */
export function normalise(input: string): string {
  const cleaned = input.trim().replace(/[€$£%\s]/g, "").replace(/,/g, ".");
  // A separator with exactly one digit after it is a decimal; anything else is
  // a thousands separator and carries no meaning.
  const parts = cleaned.split(".");
  if (parts.length === 1) return parts[0].replace(/^0+(?=\d)/, "");
  const tail = parts[parts.length - 1];
  if (tail.length === 1) {
    const head = parts.slice(0, -1).join("").replace(/^0+(?=\d)/, "");
    return tail === "0" ? head : `${head}.${tail}`;
  }
  return parts.join("").replace(/^0+(?=\d)/, "");
}

export function isRight(typed: string, answer: string): boolean {
  return normalise(typed) === normalise(answer) && normalise(typed) !== "";
}

const CONTEXTS: Record<Kind, string[]> = {
  plain: ["pezzi ordinati", "clienti attivi", "dipendenti del gruppo", "unità in magazzino"],
  price: ["il prezzo dell'offerta", "il costo per licenza", "il totale della fattura", "il budget del progetto"],
  percent: ["la crescita sull'anno scorso", "il margine sul venduto", "lo sconto concesso", "la quota di mercato"],
  year: ["l'anno di fondazione", "l'anno del contratto", "l'anno di riferimento", "l'anno del bilancio"],
  decimal: ["il fatturato in milioni", "il moltiplicatore", "la valutazione in milioni", "il rapporto"],
};

const KINDS: Kind[] = ["plain", "price", "percent", "year", "decimal", "plain", "price", "percent"];

/** One question. `random` is passed in so a run can be reproduced in a test. */
export function makeQuestion(random: () => number, index = 0): NumberQuestion {
  const kind = KINDS[index % KINDS.length];
  const contexts = CONTEXTS[kind];
  const context = contexts[Math.floor(random() * contexts.length)];

  if (kind === "year") {
    const year = 1960 + Math.floor(random() * 66);
    return { kind, spoken: sayYear(year), answer: String(year), written: String(year), context };
  }
  if (kind === "percent") {
    const value = Math.round((1 + random() * 48) * 10) / 10;
    const whole = Number.isInteger(value);
    return {
      kind,
      spoken: `${whole ? sayNumber(value) : sayDecimal(value)} per cent`,
      answer: String(value),
      written: `${String(value).replace(".", ",")}%`,
      context,
    };
  }
  if (kind === "decimal") {
    const value = Math.round((1 + random() * 90) * 10) / 10;
    return { kind, spoken: sayDecimal(value), answer: String(value), written: String(value).replace(".", ","), context };
  }
  if (kind === "price") {
    // Round-ish money, the way a price is actually quoted.
    const value = (1 + Math.floor(random() * 40)) * 50;
    return {
      kind,
      spoken: `${sayNumber(value)} euros`,
      answer: String(value),
      written: `€ ${value.toLocaleString("it-IT")}`,
      context,
    };
  }
  const value = 11 + Math.floor(random() * 9800);
  return { kind, spoken: sayNumber(value), answer: String(value), written: value.toLocaleString("it-IT"), context };
}

export function buildRun(random: () => number, count = QUESTIONS): NumberQuestion[] {
  const out: NumberQuestion[] = [];
  const seen = new Set<string>();
  for (let i = 0; out.length < count && i < count * 8; i += 1) {
    const question = makeQuestion(random, out.length);
    if (seen.has(question.answer)) continue;
    seen.add(question.answer);
    out.push(question);
  }
  return out;
}

export function verdict(correct: number, total: number): string {
  if (total === 0) return "Nessuna domanda: riprova tra poco.";
  const share = correct / total;
  if (share === 1) return "Tutte. I numeri in inglese non ti fregano più.";
  if (share >= 0.7) return "Bene. Le sbagliate sono quasi sempre -teen contro -ty: quindici o cinquanta.";
  if (share >= 0.4) return "Ci siamo a metà. Riascolta la fine della parola: è lì che cambia tutto.";
  return "I numeri sono il pezzo più difficile dell'ascolto. Torna domani: si sblocca in fretta.";
}
