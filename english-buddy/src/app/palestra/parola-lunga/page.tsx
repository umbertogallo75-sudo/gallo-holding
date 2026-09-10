import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { dealTray } from "@/lib/games/long-word";
import { findGame } from "@/lib/games/catalog";
import { LongWord } from "./LongWord";

export const metadata = { title: "Parola lunga · ExecLingo" };

export default async function ParolaLungaPage() {
  await requireUserId();
  const game = findGame("parola-lunga");
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/palestra">← Palestra</Link>
      </div>
      <LongWord opening={dealTray(Math.random, new Set())} />
    </main>
  );
}
