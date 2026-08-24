import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { ModeGrid } from "@/components/ModeGrid";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tutti gli allenamenti — ExecLingo" };

/**
 * Everything the coach can do, on its own page.
 *
 * The home screen used to be this list. Sixteen activities are not too many
 * to own — they are too many to be shown to somebody who opened the app
 * wanting to be told what to do. Nothing was removed; it moved one tap away,
 * behind a door that is always visible, for the days when you want to choose.
 */
export default async function AllenamentiPage() {
  const userId = await requireUserId();
  const result = await db().execute({
    sql: "SELECT starting_level FROM profiles WHERE id = ? LIMIT 1",
    args: [userId],
  });
  const row = result.rows[0];
  if (!row) redirect("/onboarding");

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Allenamenti</div>
        <Link className="chip" href="/home">← Oggi</Link>
      </div>
      <section className="hero">
        <h1>Tutto quello che puoi fare.</h1>
        <p className="muted">Se hai voglia di scegliere tu. Altrimenti, nella home c&rsquo;è già la sessione di oggi.</p>
      </section>
      <ModeGrid beginner={["zero", "basics"].includes(String(row.starting_level ?? ""))} />
      <BottomNav active="home" />
    </main>
  );
}
