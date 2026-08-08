import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { NotificationReminder } from "@/components/NotificationReminder";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { VoiceClient } from "./VoiceClient";

export default async function VoicePage({ searchParams }: { searchParams: Promise<{ mode?: string }> }) {
  const userId = await requireUserId();
  const profileResult = await db().execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  if (!profileResult.rows.length) redirect("/onboarding");
  const diary = (await searchParams).mode === "diary";

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">{diary ? "Diary" : "Voice"}</div><a className="chip" href="/home">← Today</a></div>
      <NotificationReminder />
      <section className="hero">
        <div className="kicker">{diary ? "Spoken diary" : "Realtime voice"}</div>
        <h1>{diary ? "Tell me about your day." : "Speak. Really speak."}</h1>
        <p className="muted">{diary ? "One minute, out loud. The coach listens, then helps you say it better." : "The fastest way to confidence is your own voice."}</p>
        <p className="itHint">{diary ? "Racconta la tua giornata a voce per un minuto: il coach ascolta e poi ti aiuta a dirla meglio. L'abitudine più potente per sbloccare il parlato." : "Parla davvero: la strada più veloce verso la sicurezza è la tua voce."}</p>
      </section>
      <VoiceClient mode={diary ? "diary" : "voice"} />
      <BottomNav active="home" />
    </main>
  );
}
