import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { findGame } from "@/lib/games/catalog";
import { dealGame } from "@/lib/games/deal";
import { WordSprint } from "./WordSprint";

export const metadata = { title: "Word Sprint · ExecLingo" };

export default async function WordSprintPage() {
  const userId = await requireUserId();
  const game = findGame("word-sprint");
  // Dealt here so the page arrives playable: no spinner, no round trip.
  const initial = await dealGame(userId);
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/giochi">← Giochi</Link>
      </div>
      <WordSprint initial={initial} />
    </main>
  );
}
