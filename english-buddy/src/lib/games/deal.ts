import type { Client } from "@libsql/client";
import { db } from "@/lib/db";
import { bankWords } from "./bank";
import { dedupe, extractWord, safeHint, type GameWord } from "./words";
import { buildRound, ROUNDS_PER_GAME, type Round } from "./word-sprint";

export type Deal = { rounds: Round[]; ownWords: number };

/**
 * Deals a game. The learner's own words come first — the ones due for review,
 * then the rest of their mistakes and expressions — and the bank only fills
 * whatever is left, so somebody who has been practising plays their own list
 * and somebody who arrived today still gets a game.
 */
export async function dealGame(userId: string, client: Client = db()): Promise<Deal> {
  const own: GameWord[] = [];
  try {
    const [mistakes, expressions] = await Promise.all([
      client.execute({
        sql: "SELECT incorrect, correct, note FROM mistakes WHERE user_id = ? AND mastered = 0 ORDER BY next_review_at IS NULL, next_review_at ASC, last_seen_at DESC LIMIT 40",
        args: [userId],
      }),
      client.execute({
        sql: "SELECT expression, meaning FROM expressions WHERE user_id = ? AND mastered = 0 ORDER BY next_review_at ASC LIMIT 40",
        args: [userId],
      }),
    ]);

    for (const row of mistakes.rows) {
      const correct = String(row.correct ?? "");
      const word = extractWord(correct);
      if (!word) continue;
      own.push({
        word,
        hint: safeHint(
          row.note ? String(row.note) : null,
          word,
          `L'avevi detto così: «${String(row.incorrect ?? "").slice(0, 60)}»`
        ),
        source: "mistake",
        itemText: correct,
      });
    }
    for (const row of expressions.rows) {
      const expression = String(row.expression ?? "");
      const word = extractWord(expression);
      if (!word) continue;
      own.push({
        word,
        hint: safeHint(row.meaning ? String(row.meaning) : null, word, "Un'espressione che stai imparando"),
        source: "expression",
        itemText: expression,
      });
    }
  } catch (error) {
    // A game is never worth a 500: fall through to the bank.
    console.error("game words unavailable:", error);
  }

  const mine = dedupe(own).slice(0, ROUNDS_PER_GAME);
  // The seed only decides where in the bank the rotation starts, so two games
  // in a row do not open on the same word.
  const filler = dedupe(bankWords(ROUNDS_PER_GAME * 2, Math.floor(Date.now() / 60_000)));
  const chosen = dedupe([...mine, ...filler]).slice(0, ROUNDS_PER_GAME);

  return { rounds: chosen.map((entry) => buildRound(entry, Math.random)), ownWords: mine.length };
}
