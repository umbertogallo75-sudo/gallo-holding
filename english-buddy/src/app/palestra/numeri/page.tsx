import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { buildRun } from "@/lib/games/numbers";
import { findGame } from "@/lib/games/catalog";
import { NumbersGame } from "./NumbersGame";

export const metadata = { title: "Numeri e cifre · ExecLingo" };

export default async function NumeriPage() {
  await requireUserId();
  const game = findGame("numeri");
  const opening = buildRun(Math.random);
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/palestra">← Palestra</Link>
      </div>
      <NumbersGame opening={opening} />
    </main>
  );
}
