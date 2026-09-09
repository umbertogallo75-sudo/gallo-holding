import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildRun, puzzleFrom, type Puzzle } from "@/lib/games/spot-error";
import { findGame } from "@/lib/games/catalog";
import { SpotErrorGame } from "./SpotErrorGame";

export const metadata = { title: "Trova l'errore · ExecLingo" };

export default async function ErrorePage() {
  const userId = await requireUserId();
  const game = findGame("errore");

  // The learner's own corrections, turned into puzzles. Most pairs are not a
  // single-word swap and are simply skipped: a sentence Sam rebuilt has no one
  // word to tap, and guessing at which to mark would teach the wrong thing.
  let own: Puzzle[] = [];
  try {
    const rows = await db().execute({
      sql: "SELECT incorrect, correct, note FROM mistakes WHERE user_id = ? AND mastered = 0 ORDER BY next_review_at IS NULL, next_review_at ASC, last_seen_at DESC LIMIT 40",
      args: [userId],
    });
    own = rows.rows
      .map((row) => puzzleFrom(String(row.incorrect ?? ""), String(row.correct ?? ""), row.note ? String(row.note) : null))
      .filter((puzzle): puzzle is Puzzle => puzzle !== null)
      .slice(0, 8);
  } catch {
    // The bank alone makes a fine run.
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/giochi">← Giochi</Link>
      </div>
      <SpotErrorGame opening={buildRun(own, Math.random)} own={own} />
    </main>
  );
}
