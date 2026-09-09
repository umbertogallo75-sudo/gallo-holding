import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildDeck } from "@/lib/games/flash";
import { findGame } from "@/lib/games/catalog";
import type { Entry } from "@/lib/games/glossary";
import { FlashGame } from "./FlashGame";

export const metadata = { title: "Flash IT ↔ EN · ExecLingo" };

export default async function FlashPage() {
  const userId = await requireUserId();
  const game = findGame("flash");

  let own: Entry[] = [];
  try {
    const rows = await db().execute({
      sql: "SELECT expression, meaning FROM expressions WHERE user_id = ? AND mastered = 0 AND meaning IS NOT NULL AND meaning <> '' ORDER BY next_review_at ASC LIMIT 12",
      args: [userId],
    });
    own = rows.rows.map((row) => ({ word: String(row.expression), it: String(row.meaning) }));
  } catch {
    // The glossary alone makes a fine deck.
  }

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/palestra">← Palestra</Link>
      </div>
      <FlashGame opening={buildDeck(own, Math.random)} own={own} />
    </main>
  );
}
