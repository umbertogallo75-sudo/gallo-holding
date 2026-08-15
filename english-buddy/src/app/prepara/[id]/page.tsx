import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Speak } from "@/components/Speak";
import { requireUserId } from "@/lib/auth";
import { getEvent } from "@/lib/events";

export const dynamic = "force-dynamic";
export const metadata = { title: "La tua scheda · ExecLingo" };

/**
 * The prepared sheet for one appointment: what to say, what they will ask,
 * how to play it. Built to be read on a phone in the two minutes before, and
 * kept open beside the laptop during.
 */
export default async function EventPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const event = await getEvent(userId, id);
  if (!event) notFound();

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/prepara">← Preparati</Link></div>

      <section className="hero">
        <div className="kicker">{event.date}{event.time ? ` · ${event.time}` : ""}</div>
        <h1 style={{ lineHeight: 1.25 }}>{event.title}</h1>
        {event.prep ? <p className="muted">{event.prep.strategy}</p> : <p className="muted">La scheda non è disponibile.</p>}
      </section>

      {event.prep ? (
        <>
          <section className="card">
            <div className="kicker">Le frasi da avere pronte</div>
            {event.prep.phrases.map((phrase, index) => (
              <div key={index} style={{ padding: "12px 0", borderBottom: index === event.prep!.phrases.length - 1 ? "none" : "1px solid var(--line)" }}>
                <div className="itHint" style={{ marginBottom: 2 }}>{phrase.use}</div>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <strong style={{ fontSize: 16, lineHeight: 1.35 }}>{phrase.english}</strong>
                    <div className="muted" style={{ fontSize: 14.5 }}>{phrase.italian}</div>
                  </div>
                  <Speak text={phrase.english} compact />
                </div>
              </div>
            ))}
          </section>

          <section className="card">
            <div className="kicker">Cosa ti chiederanno</div>
            {event.prep.questions.map((question, index) => (
              <div key={index} style={{ padding: "12px 0", borderBottom: index === event.prep!.questions.length - 1 ? "none" : "1px solid var(--line)" }}>
                <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10 }}>
                  <div>
                    <strong style={{ fontSize: 16, lineHeight: 1.35 }}>{question.english}</strong>
                    <div className="muted" style={{ fontSize: 14.5 }}>{question.italian}</div>
                  </div>
                  <Speak text={question.english} compact />
                </div>
                <p className="itHint" style={{ margin: "6px 0 0" }}>Puoi partire da: <strong style={{ fontStyle: "normal" }}>{question.answerStart}</strong></p>
              </div>
            ))}
          </section>

          <p className="itHint" style={{ margin: "0 4px 12px", textAlign: "center" }}>
            Le frasi sono già nel tuo <Link href="/phrasebook">frasario</Link>: Sam te le farà ripassare da qui a quel giorno.
          </p>
        </>
      ) : null}

      <BottomNav active="home" />
    </main>
  );
}
