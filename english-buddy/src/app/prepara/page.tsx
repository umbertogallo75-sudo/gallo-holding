import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { upcomingEvents } from "@/lib/events";
import { NewEvent } from "./NewEvent";
import { CalendarLink } from "./CalendarLink";
import { readLink } from "@/lib/calendar/sync";

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
  const [events, link] = await Promise.all([upcomingEvents(userId, today), readLink(userId)]);

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/home">← Home</Link></div>
      <section className="hero">
        <div className="kicker">Preparati</div>
        <h1>Cosa hai in agenda?</h1>
        <p className="muted">Scrivi in una riga la riunione, la call o il viaggio. Sam ti prepara le frasi che ti serviranno davvero, le domande che ti faranno e come giocartela — e il giorno prima te lo ricorda.</p>
      </section>

      <CalendarLink connected={Boolean(link)} lastSync={link?.lastSyncAt ?? null} lastError={link?.lastError ?? null} />

      <section className="card">
        <NewEvent today={today} />
      </section>

      {events.length ? (
        <section className="card">
          <div className="kicker">In arrivo</div>
          {events.map((event) => (
            <Link
              key={event.id}
              href={`/prepara/${event.id}`}
              style={{ display: "block", padding: "12px 0", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit" }}
            >
              <strong style={{ fontSize: 16 }}>{event.title}</strong>
              <div className="composerNote">
                {event.date === today ? "oggi" : italianDate(event.date)}
                {event.time ? ` · ${event.time}` : ""}
                {event.prep ? ` · ${event.prep.phrases.length} frasi pronte` : ""}
              </div>
            </Link>
          ))}
        </section>
      ) : null}

      <BottomNav active="home" />
    </main>
  );
}
