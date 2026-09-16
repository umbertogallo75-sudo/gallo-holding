import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { recentSessions, type SessionKind } from "@/lib/learning/sessions";
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

/**
 * The three ways to look at the same history.
 *
 * Spoken and written are one archive — a lesson is a lesson whichever way it
 * happened — but they are looked for differently: "quella volta che ho
 * parlato di budget" is a spoken memory, and scrolling past twenty written
 * chats to find it is the reason people said the history was useless.
 */
const TABS: { key: string; kind: SessionKind; label: string }[] = [
  { key: "", kind: "all", label: "Tutte" },
  { key: "scritte", kind: "text", label: "✍️ Scritte" },
  { key: "voce", kind: "voice", label: "🎙️ A voce" },
];

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

/** Everything you have already said, kept — spoken and written alike. */
export default async function SessioniPage({ searchParams }: { searchParams: Promise<{ tipo?: string; q?: string }> }) {
  const userId = await requireUserId();
  const params = await searchParams;
  const tipo = params.tipo ?? "";
  const query = (params.q ?? "").slice(0, 60);
  const tab = TABS.find((t) => t.key === tipo) ?? TABS[0];
  const sessions = await recentSessions(userId, { kind: tab.kind, search: query, limit: 60 }).catch(() => []);

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Le tue sessioni</div>
        <Link className="chip" href="/home">← Home</Link>
      </div>

      <p className="composerNote" style={{ marginTop: 0 }}>
        Tutto quello che hai detto a Sam resta qui — scritto e a voce. Cerca una parola che ricordi di aver usato: è così
        che si ritrova una conversazione.
      </p>

      {/* A plain GET form: it works before any JavaScript has loaded, which on
          a phone on a train is most of the time somebody is looking for
          something. */}
      <form className={styles.search} method="GET" action="/sessioni">
        {tipo ? <input type="hidden" name="tipo" value={tipo} /> : null}
        <input
          className={styles.searchInput}
          type="search"
          name="q"
          defaultValue={query}
          placeholder="Cerca nelle conversazioni — es. budget, aeroporto, cliente"
          aria-label="Cerca nelle tue conversazioni"
        />
        <button type="submit" className={styles.searchGo} aria-label="Cerca">🔍</button>
      </form>

      <nav className={styles.tabs}>
        {TABS.map((t) => (
          <Link
            key={t.key || "all"}
            href={`/sessioni?${new URLSearchParams({ ...(t.key ? { tipo: t.key } : {}), ...(query ? { q: query } : {}) }).toString()}`}
            className={t.key === tab.key ? `${styles.tab} ${styles.tabOn}` : styles.tab}
            aria-current={t.key === tab.key ? "page" : undefined}
          >
            {t.label}
          </Link>
        ))}
      </nav>

      {sessions.length === 0 ? (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            {query
              ? `Nessuna conversazione con «${query}». Prova con un'altra parola, o togli il filtro.`
              : tab.kind === "voice"
                ? "Ancora nessuna conversazione a voce. Dopo la prima chiamata con Sam la ritrovi qui, parola per parola."
                : tab.kind === "text"
                  ? "Ancora nessuna conversazione scritta. Dopo la prima chiacchierata con Sam la ritrovi qui."
                  : "Ancora nessuna sessione. Dopo la prima conversazione con Sam la ritrovi qui, insieme a tutte le altre."}
          </p>
        </section>
      ) : (
        <div className={styles.list}>
          {sessions.map((session) => (
            <Link key={session.id} href={`/sessioni/${session.id}`} className={styles.row} data-track="session_opened">
              <span className={styles.when}>{when(session.lastAt)}</span>
              <span className={styles.mode}>
                <span aria-hidden>{session.voice ? "🎙️ " : "✍️ "}</span>
                {MODE_LABELS[session.mode] ?? session.mode}
              </span>
              {session.preview ? <span className={styles.preview}>{session.preview}</span> : null}
              <span className={styles.meta}>
                {session.exchanges} {session.exchanges === 1 ? "tuo messaggio" : "tuoi messaggi"}
                {session.minutes > 0 ? ` · ${session.minutes} min` : ""}
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
