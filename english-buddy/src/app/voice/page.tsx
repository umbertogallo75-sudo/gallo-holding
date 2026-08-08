import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { NotificationReminder } from "@/components/NotificationReminder";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { VoiceClient } from "./VoiceClient";

export default async function VoicePage() {
  const userId = await requireUserId();
  const profileResult = await db().execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  if (!profileResult.rows.length) redirect("/onboarding");

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">Voice</div><a className="chip" href="/home">← Today</a></div>
      <NotificationReminder />
      <section className="hero">
        <div className="kicker">Phase 4 · Realtime</div>
        <h1>Speak. Really speak.</h1>
        <p className="muted">The fastest way to confidence is your own voice.</p>
        <p className="itHint">Parla davvero: la strada più veloce verso la sicurezza è la tua voce.</p>
      </section>
      <VoiceClient />
      <BottomNav active="home" />
    </main>
  );
}
