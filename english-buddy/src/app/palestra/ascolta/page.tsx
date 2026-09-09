import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { buildRun } from "@/lib/games/listen";
import { findGame } from "@/lib/games/catalog";
import type { Entry } from "@/lib/games/glossary";
import { ListenGame } from "./ListenGame";

export const metadata = { title: "Ascolta e scegli · ExecLingo" };

export default async function AscoltaPage() {
  const userId = await requireUserId();
  const game = findGame("ascolta");

  // The learner's own expressions go into the run first: a listening drill on
  // what Sam actually taught them beats a drill on a generic list.
  let own: Entry[] = [];
  try {
    const rows = await db().execute({
      sql: "SELECT expression, meaning FROM expressions WHERE user_id = ? AND mastered = 0 AND meaning IS NOT NULL AND meaning <> '' ORDER BY next_review_at ASC LIMIT 6",
      args: [userId],
    });
    own = rows.rows.map((row) => ({ word: String(row.expression), it: String(row.meaning) }));
  } catch {
    // A game is never worth a 500: the glossary alone makes a fine run.
  }

  const opening = buildRun(own, Math.random);
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/palestra">← Palestra</Link>
      </div>
      <ListenGame opening={opening} own={own} />
    </main>
  );
}
