import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { NotificationReminder } from "@/components/NotificationReminder";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { VoiceClient } from "./VoiceClient";

export default async function VoicePage({ searchParams }: { searchParams: Promise<{ mode?: string; riprendi?: string; domanda?: string }> }) {
  const userId = await requireUserId();
  const profileResult = await db().execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  if (!profileResult.rows.length) redirect("/onboarding");
  const params = await searchParams;
  const diary = params.mode === "diary";
  // "Ripeti dietro a Sam" belongs at the microphone: it is about how something
  // sounds, and a written chat cannot hear it. It used to live in the chat and
  // send people to the voice screen halfway through, where the exercise was
  // lost — a tester said exactly that.
  const shadow = params.mode === "shadow";
  // A call reopened from the archive, by its id.
  const reopen = params.riprendi?.slice(0, 64);
  /** A question Sam asked by notification, brought to the microphone. */
  const question = params.domanda?.slice(0, 300);

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{shadow ? "Ripeti" : diary ? "Diary" : "Voice"}</div>
        <span style={{ display: "flex", gap: 6 }}>
          <a className="chip" href="/phrasebook" title="Il tuo frasario">★</a>
          <a className="chip" href="/home">← Home</a>
        </span>
      </div>
      <NotificationReminder />
      {/* The hero is handed to the client so it can disappear once the call
          starts: during a conversation it is the only thing on screen that is
          not the conversation, and on a phone it is what pushes the last
          spoken line below the fold. */}
      <VoiceClient
        mode={shadow ? "shadow" : diary ? "diary" : "voice"}
        reopen={reopen}
        question={question}
        hero={
          <section className="hero">
            <div className="kicker">{shadow ? "Pronuncia" : diary ? "Diario parlato" : "Voce dal vivo"}</div>
            <h1>{shadow ? "Ripeti dietro a Sam." : diary ? "Raccontami la tua giornata." : "Parla. Parla davvero."}</h1>
            <p className="muted">{shadow ? "Lui dice una frase, tu la ripeti ad alta voce, e lui ti dice dove cade l'accento e cosa non suona. Non conta se sbagli la frase: conta come suona." : diary ? "Un minuto a voce: Sam ascolta e poi ti aiuta a dirla meglio. È l'abitudine più potente per sbloccare il parlato." : "La strada più veloce verso la sicurezza è la tua stessa voce."}</p>
          </section>
        }
      />
      <BottomNav active="home" />
    </main>
  );
}
