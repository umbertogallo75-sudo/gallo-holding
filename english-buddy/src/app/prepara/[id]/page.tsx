import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Copy } from "@/components/Copy";
import { Speak } from "@/components/Speak";
import { requireUserId } from "@/lib/auth";
import { getEvent } from "@/lib/events";
import { DebriefForm } from "./DebriefForm";
import { EventNotes } from "./EventNotes";
import { PrepareButton } from "./PrepareButton";
import { EventDocs } from "./EventDocs";
import { readNotes } from "@/lib/calendar/sync";
import { documentsForEvent } from "@/lib/documents/store";

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
  const [notes, docs] = await Promise.all([readNotes(userId, id), documentsForEvent(id, userId)]);

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/prepara">← Preparati</Link></div>

      <section className="hero">
        <div className="kicker">{event.date}{event.time ? ` · ${event.time}` : ""}</div>
        <h1 style={{ lineHeight: 1.25 }}>{event.title}</h1>
        {event.prep ? <p className="muted">{event.prep.strategy}</p> : null}
      </section>

      <PrepareButton id={event.id} again={Boolean(event.prep)} />
      <EventNotes id={event.id} initial={notes} />
      <EventDocs id={event.id} docs={docs.map((d) => ({ id: d.id, title: d.analysis.titleIt || d.filename, kind: d.analysis.kind }))} />

      {event.prep ? (
        <>
          <Link className="primary full" href={`/riunione?e=${event.id}`} style={{ display: "block", textAlign: "center", textDecoration: "none", marginBottom: 12 }}>
            🎧 Apri in Modalità Riunione
          </Link>
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
                  <span style={{ display: "flex", gap: 4, flexShrink: 0 }}><Speak text={phrase.english} compact /><Copy text={phrase.english} /></span>
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
                  <span style={{ display: "flex", gap: 4, flexShrink: 0 }}><Speak text={question.english} compact /><Copy text={question.english} /></span>
                </div>
                <p className="itHint" style={{ margin: "6px 0 0" }}>Puoi partire da: <strong style={{ fontStyle: "normal" }}>{question.answerStart}</strong></p>
              </div>
            ))}
          </section>

          <p className="itHint" style={{ margin: "0 4px 12px", textAlign: "center" }}>
            Le frasi sono già nel tuo <Link href="/phrasebook">frasario</Link>: Sam te le farà ripassare da qui a quel giorno.
          </p>

          {/* The loop closes here: what failed in the room becomes next week's
              material, which is the only syllabus worth having. */}
          <section className="card">
            <div className="kicker">{event.debrief ? "Il tuo debrief" : "Dopo — due minuti"}</div>
            {!event.debrief ? <p className="muted" style={{ marginTop: 6 }}>Quando è finita, raccontami com&rsquo;è andata: quello che non sei riuscito a dire diventa quello che saprai la prossima volta.</p> : null}
            <DebriefForm eventId={event.id} existing={event.debrief} />
          </section>
        </>
      ) : null}

      <BottomNav active="home" />
    </main>
  );
}
