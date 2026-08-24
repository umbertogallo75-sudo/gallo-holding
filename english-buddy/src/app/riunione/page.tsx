import Link from "next/link";
import { requireUserId } from "@/lib/auth";
import { getEvent, upcomingEvents } from "@/lib/events";
import { MeetingClient } from "./MeetingClient";

export const dynamic = "force-dynamic";
export const metadata = { title: "Modalità Riunione · ExecLingo" };

/**
 * Meeting mode: the app during the meeting, not before or after it.
 *
 * No bottom navigation and no distractions — while a call is running, every
 * element that is not usable in two seconds is in the way. If the user came
 * from a prepared appointment, their own phrases are here too.
 */
export default async function RiunionePage({ searchParams }: { searchParams: Promise<{ e?: string }> }) {
  const userId = await requireUserId();
  const { e } = await searchParams;

  const event = e ? await getEvent(userId, e) : null;
  const today = new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit", day: "2-digit" }).format(new Date());
  const soon = event ? [] : (await upcomingEvents(userId, today)).slice(0, 3);

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">🎧 In riunione</div>
        <Link className="chip" href="/home">Esci</Link>
      </div>

      {!event && soon.length ? (
        <section className="card">
          <div className="kicker">Per quale appuntamento?</div>
          {soon.map((item) => (
            <Link
              key={item.id}
              href={`/riunione?e=${item.id}`}
              style={{ display: "block", padding: "11px 0", borderBottom: "1px solid var(--line)", textDecoration: "none", color: "inherit" }}
            >
              <strong style={{ fontSize: 16 }}>{item.title}</strong>
              <div className="composerNote">{item.date}{item.time ? ` · ${item.time}` : ""}</div>
            </Link>
          ))}
          <p className="composerNote" style={{ margin: "10px 0 0" }}>Oppure usa i salvagenti qui sotto senza scegliere nulla.</p>
        </section>
      ) : null}

      <MeetingClient phrases={event?.prep?.phrases ?? []} title={event?.title ?? null} />

      <p className="composerNote" style={{ margin: "6px 4px 24px", textAlign: "center" }}>
        Lo schermo resta acceso finché sei qui. Niente registrazione: ExecLingo non ascolta la riunione.
      </p>
    </main>
  );
}
