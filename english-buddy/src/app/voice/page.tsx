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
      <div className="topbar"><div className="brand">{diary ? "Diary" : "Voice"}</div><a className="chip" href="/home">← Home</a></div>
      <NotificationReminder />
      {/* The hero is handed to the client so it can disappear once the call
          starts: during a conversation it is the only thing on screen that is
          not the conversation, and on a phone it is what pushes the last
          spoken line below the fold. */}
      <VoiceClient
        mode={diary ? "diary" : "voice"}
        hero={
          <section className="hero">
            <div className="kicker">{diary ? "Diario parlato" : "Voce dal vivo"}</div>
            <h1>{diary ? "Raccontami la tua giornata." : "Parla. Parla davvero."}</h1>
            <p className="muted">{diary ? "Un minuto a voce: Sam ascolta e poi ti aiuta a dirla meglio. È l'abitudine più potente per sbloccare il parlato." : "La strada più veloce verso la sicurezza è la tua stessa voce."}</p>
          </section>
        }
      />
      <BottomNav active="home" />
    </main>
  );
}
