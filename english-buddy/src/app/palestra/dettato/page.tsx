import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { findGame } from "@/lib/games/catalog";
import { Dictation } from "./Dictation";

export const metadata = { title: "Ascolta e scrivi · ExecLingo" };

export default async function DettatoPage() {
  await requireUserId();
  const game = findGame("dettato");
  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{game?.icon} {game?.title}</div>
        <Link className="chip" href="/palestra">← Palestra</Link>
      </div>
      <Dictation />
    </main>
  );
}
