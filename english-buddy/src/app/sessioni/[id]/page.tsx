import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
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
          </div>
        ))}
      </div>

      <p className="itHint" style={{ textAlign: "center", margin: "16px 0 4px" }}>
        {spoken ? (
          <>Questa è la trascrizione di quello che vi siete detti: per riprendere a parlare torna a <Link href="/voice">Sam a voce</Link>.</>
        ) : (
          <>Questa è una rilettura: per continuare a parlare apri una <Link href="/buddy">nuova conversazione</Link>.</>
        )}
      </p>

      <BottomNav active="home" />
    </main>
  );
}
