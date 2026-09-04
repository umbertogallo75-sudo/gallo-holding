import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { upcomingEvents } from "@/lib/events";
import { NewEvent } from "./NewEvent";
import { CalendarLink } from "./CalendarLink";
import { readLink } from "@/lib/calendar/sync";
import { db } from "@/lib/db";

export const dynamic = "force-dynamic";
export const metadata = { title: "Preparati · ExecLingo" };

/** The user's local day, which is what "today" means for an appointment. */
function todayIn(timeZone = "Europe/Rome"): string {
  return new Intl.DateTimeFormat("en-CA", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
}

const WEEKDAYS = ["domenica", "lunedì", "martedì", "mercoledì", "giovedì", "venerdì", "sabato"];
const MONTHS = ["gennaio", "febbraio", "marzo", "aprile", "maggio", "giugno", "luglio", "agosto", "settembre", "ottobre", "novembre", "dicembre"];

function italianDate(date: string): string {
  const [year, month, day] = date.split("-").map(Number);
  const d = new Date(Date.UTC(year, month - 1, day));
  return `${WEEKDAYS[d.getUTCDay()]} ${day} ${MONTHS[month - 1]}`;
}

export default async function PreparaPage() {
  const userId = await requireUserId();
  const today = todayIn();
  const client = db();
  const [events, link] = await Promise.all([upcomingEvents(userId, today, client), readLink(userId, client)]);

  // Which appointments already carry something of the user's own. Two small
  // queries rather than one per row: the badge is the whole point of the list —
  // it says at a glance where there is still something to do before that room.
  const [noted, withDocs] = await Promise.all([
    client
      .execute({ sql: "SELECT id FROM events WHERE user_id = ? AND notes IS NOT NULL AND notes != ''", args: [userId] })
      .catch(() => ({ rows: [] as Record<string, unknown>[] })),
    client
      .execute({ sql: "SELECT DISTINCT event_id FROM documents WHERE user_id = ? AND event_id IS NOT NULL", args: [userId] })
      .catch(() => ({ rows: [] as Record<string, unknown>[] })),
  ]);
  const hasNotes = new Set(noted.rows.map((row) => String(row.id)));
  const hasDocs = new Set(withDocs.rows.map((row) => String(row.event_id)));

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/home">← Home</Link></div>
      <section className="hero">
        <div className="kicker">Agenda</div>
        <h1>Le tue riunioni.</h1>
        <p className="muted">
          Ogni impegno può avere le tue note e i tuoi documenti: Sam ci prepara sopra le frasi che ti serviranno,
          le domande che ti faranno e come giocartela — e il giorno prima te lo ricorda.
        </p>
      </section>

      <CalendarLink connected={Boolean(link)} lastSync={link?.lastSyncAt ?? null} lastError={link?.lastError ?? null} />

      <section className="card">
        <NewEvent today={today} />
      </section>

      {events.length ? (
        <section className="card" style={{ padding: "6px 16px" }}>
          <div className="kicker" style={{ margin: "10px 2px 2px" }}>In arrivo</div>
          {events.map((event, index) => {
            const day = event.date === today ? "Oggi" : italianDate(event.date);
            const newDay = index === 0 || events[index - 1].date !== event.date;
            const ready = Boolean(event.prep);
            return (
              <div key={event.id}>
                {newDay ? <div className="agendaDay">{day}</div> : null}
                <Link href={`/prepara/${event.id}`} className="mailRow" data-track="agenda_open">
                  <span className="agendaTime">{event.time ?? "—"}</span>
                  <span className="mailRowText">
                    <span className="mailSubject">{event.title}</span>
                    <span className="mailMeta">
                      {ready ? `${event.prep?.phrases.length} frasi pronte` : "Scheda da preparare"}
                      {hasNotes.has(event.id) ? " · 📝 note" : ""}
                      {hasDocs.has(event.id) ? " · 📄 documenti" : ""}
                    </span>
                  </span>
                  <span className="stepGo" aria-hidden>→</span>
                </Link>
              </div>
            );
          })}
        </section>
      ) : (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            Qui compaiono le riunioni dei prossimi giorni, dal tuo calendario o scritte da te. Per ognuna potrai
            aggiungere note e documenti, e Sam ti preparerà.
          </p>
        </section>
      )}

      <BottomNav active="home" />
    </main>
  );
}
