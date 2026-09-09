import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { dealTray } from "@/lib/games/four-letters";
import { findGame } from "@/lib/games/catalog";
import { FourLetters } from "./FourLetters";

export const metadata = { title: "Quattro lettere · ExecLingo" };

export default async function FourLettersPage() {
  await requireUserId();
  const game = findGame("four-letters");
  // The opening tray is dealt here so the page arrives playable.
  const opening = dealTray(0, Math.random, new Set());
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/palestra">← Palestra</Link>
      </div>
      <FourLetters opening={opening} />
    </main>
  );
}
