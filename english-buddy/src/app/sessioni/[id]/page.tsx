import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { RememberPhrase } from "@/components/RememberPhrase";
import { Speak } from "@/components/Speak";
import { requireUserId } from "@/lib/auth";
import { isVoiceMode, sessionMode, sessionReport, sessionTranscript } from "@/lib/learning/sessions";
import styles from "../sessioni.module.css";

export const metadata = { title: "Sessione · ExecLingo" };

/** One conversation, read back. */
export default async function SessionePage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;

  const [transcript, report, mode] = await Promise.all([
    sessionTranscript(userId, id),
    sessionReport(userId, id).catch(() => null),
    sessionMode(userId, id).catch(() => null),
  ]);
  if (transcript.length === 0) notFound();
  const spoken = isVoiceMode(mode ?? "");

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">{spoken ? "🎙️ A voce" : "✍️ Scritta"}</div>
        <Link className="chip" href={spoken ? "/sessioni?tipo=voce" : "/sessioni"}>← Tutte</Link>
      </div>

      {report ? (
        <section className="card" style={{ display: "grid", gap: 6 }}>
          <div className="kicker">{report.score.headline}</div>
          <p className="muted" style={{ margin: 0, fontSize: 14 }}>{report.score.detail}</p>
          <p className="itHint" style={{ margin: "4px 0 0" }}>
            {report.facts.exchanges} {spoken ? "battute" : "messaggi"} · {report.facts.minutes} minuti ·{" "}
            {report.facts.corrected} correzioni
          </p>
        </section>
      ) : null}

      <div className={styles.transcript}>
        {transcript.map((line, i) => (
          <div key={i} className={`${styles.turn} ${line.role === "user" ? styles.you : styles.coach}`}>
            <span className={styles.who}>{line.role === "user" ? "Tu" : "Sam"}</span>
            {line.content}
            {line.correction ? <span className={styles.fix}>✎ {line.correction}</span> : null}
            {/* Rereading is where you recognise the phrase you needed: this is
                the natural place to keep it. */}
            {line.role === "assistant" ? (
              <span className={styles.tools}>
                <Speak text={line.content} compact />
                <RememberPhrase text={line.content} from="transcript" />
              </span>
            ) : null}
            {line.correction ? <span className={styles.tools}><RememberPhrase text={line.correction} from="transcript" /></span> : null}
          </div>
        ))}
      </div>

      {/* The end of a conversation is exactly where somebody decides they want
          it back: reading the last thing you said is what reminds you it was
          never finished. */}
      <section className="card" style={{ display: "grid", gap: 10, marginTop: 16 }}>
        <strong style={{ fontSize: 15.5 }}>Vuoi riaprire questa sessione?</strong>
        <span className="muted" style={{ fontSize: 14 }}>
          {spoken
            ? "Sam riprende da queste battute: non ricomincia da capo e non ti richiede quello che gli hai già detto."
            : "Sam riprende da qui, con questa conversazione davanti: non ricomincia da capo."}
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <Link
            className="pill"
            href={spoken ? `/voice?riprendi=${encodeURIComponent(id)}` : `/buddy?riprendi=${encodeURIComponent(id)}`}
            data-track="session_resumed"
          >
            ↩︎ {spoken ? "Riprendi a voce" : "Riprendi a scrivere"}
          </Link>
          <Link className="pill" href={spoken ? "/voice" : "/buddy"}>
            {spoken ? "Nuova conversazione a voce" : "Nuova conversazione"}
          </Link>
        </div>
      </section>

      <BottomNav active="home" />
    </main>
  );
}
