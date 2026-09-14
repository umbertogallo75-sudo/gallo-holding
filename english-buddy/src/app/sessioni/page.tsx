import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { recentSessions } from "@/lib/learning/sessions";
import styles from "./sessioni.module.css";

export const metadata = { title: "Le tue sessioni · ExecLingo" };

const MODE_LABELS: Record<string, string> = {
  buddy: "Conversazione",
  guided: "Sessione guidata",
  listen: "Ascolta e scrivi",
  mission: "Missione",
  warmup: "Preparazione riunione",
  levelcheck: "Prova di livello",
  review: "Ripasso",
  zero: "Parto da zero",
  rescue: "Mi serve adesso",
  voice: "A voce",
  diary: "Diario parlato",
  text: "Conversazione",
};

function when(iso: string): string {
  const date = new Date(iso.includes("T") ? iso : iso.replace(" ", "T") + "Z");
  if (Number.isNaN(date.getTime())) return "";
  const days = Math.floor((Date.now() - date.getTime()) / 86_400_000);
  const time = date.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
  if (days === 0) return `Oggi, ${time}`;
  if (days === 1) return `Ieri, ${time}`;
  if (days < 7) return `${date.toLocaleDateString("it-IT", { weekday: "long" })}, ${time}`;
  return date.toLocaleDateString("it-IT", { day: "numeric", month: "long" });
}

/** Everything you have already said, kept. */
export default async function SessioniPage() {
  const userId = await requireUserId();
  const sessions = await recentSessions(userId).catch(() => []);

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Le tue sessioni</div>
        <Link className="chip" href="/home">← Home</Link>
      </div>

      <p className="composerNote" style={{ marginTop: 0 }}>
        Tutto quello che hai detto a Sam resta qui. Rileggere una conversazione di due settimane fa è il ripasso più
        onesto che esista: sono le tue frasi, non quelle di un libro.
      </p>

      {sessions.length === 0 ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            Ancora nessuna sessione. Dopo la prima conversazione con Sam la ritrovi qui, insieme a tutte le altre.
          </p>
        </section>
      ) : (
        <div className={styles.list}>
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessioni/${session.id}`} className={styles.row} data-track="session_opened">
              <span className={styles.when}>{when(session.lastAt)}</span>
              <span className={styles.mode}>{MODE_LABELS[session.mode] ?? session.mode}</span>
              <span className={styles.meta}>
                {session.exchanges} {session.exchanges === 1 ? "messaggio" : "messaggi"}
                {session.closed ? "" : " · non conclusa"}
              </span>
              <span className={styles.go} aria-hidden>→</span>
            </Link>
          ))}
        </div>
      )}

      <BottomNav active="home" />
    </main>
  );
}
