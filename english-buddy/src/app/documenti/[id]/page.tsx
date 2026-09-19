import Link from "next/link";
import { notFound } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { Speak } from "@/components/Speak";
import { requireUserId } from "@/lib/auth";
import { readDocument } from "@/lib/documents/store";
import { DocActions } from "./DocActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Documento — ExecLingo" };

export default async function DocumentPage({ params }: { params: Promise<{ id: string }> }) {
  const userId = await requireUserId();
  const { id } = await params;
  const doc = await readDocument(id, userId);
  if (!doc) notFound();
  const { analysis } = doc;

  return (
    <main className="shell">
      <div className="topbar">
        <div className="brand">Documento</div>
        <Link className="chip" href="/documenti">← I tuoi documenti</Link>
      </div>

      <section className="card">
        <div className="kicker">{analysis.kind}</div>
        <h2 style={{ margin: "4px 0 8px" }}>{analysis.titleIt || doc.filename}</h2>
        <p style={{ margin: 0 }}>{analysis.summaryIt}</p>
        <p className="composerNote" style={{ marginTop: 10 }}>
          {doc.filename}{doc.pages ? ` · ${doc.pages} pagine` : ""} · il file non è stato conservato
        </p>
      </section>

      {/* The sentences that decide something, exactly as written, with their
          Italian beside them. The file itself is never kept, so this is what
          "show me the original" can honestly mean — and having the English
          there is what makes the translation checkable instead of asking to
          be believed. */}
      {analysis.passages?.length ? (
        <section className="card">
          <div className="kicker">I passaggi che contano</div>
          <p className="itHint" style={{ marginTop: 4 }}>
            Copiati dal documento parola per parola, con la traduzione accanto: così puoi controllarla.
          </p>
          {analysis.passages.map((passage) => (
            <div key={passage.en} className="docPassage">
              <p className="docPassageEn">
                {passage.en}
                <Speak text={passage.en} compact />
              </p>
              <p className="docPassageIt">{passage.it}</p>
            </div>
          ))}
        </section>
      ) : null}

      <Link href={`/buddy?mode=doc&doc=${doc.id}`} className="todayCard" data-track="doc_train">
        <div className="todayKicker">Allenamento su questo documento</div>
        <div className="todayTitle">Preparati per davvero</div>
        <div className="todayWhy">Le parole di questo documento, le domande che ti faranno, e la riunione recitata con Sam.</div>
        <div className="todayCta"><span>INIZIA →</span><span className="todayHow">✍️ scritta · 🎙️ o a voce</span></div>
      </Link>

      {analysis.terms.length ? (
        <section className="card">
          <div className="kicker">Le parole che torneranno in riunione</div>
          {analysis.terms.map((term) => (
            <div key={term.term} className="keepRow" style={{ marginTop: 10 }}>
              <strong>{term.term}</strong>
              <Speak text={term.term} compact />
              <p className="keepNote" style={{ width: "100%", margin: "2px 0 0" }}>{term.meaning}</p>
              {term.context ? <p className="docTermContext">«{term.context}»</p> : null}
            </div>
          ))}
        </section>
      ) : null}

      {analysis.questions.length ? (
        <section className="card">
          <div className="kicker">Le domande su cui ti alleni</div>
          <p className="itHint" style={{ marginTop: 4 }}>
            Sam te le farà davvero nell&rsquo;allenamento qui sopra, una alla volta, e ti aiuterà a rispondere.
          </p>
          <ul className="mailAsks">
            {analysis.questions.map((question) => (
              <li key={question} style={{ display: "flex", alignItems: "flex-start", gap: 8 }}>
                <span style={{ flex: 1 }}>{question}</span>
                <Speak text={question} compact />
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <DocActions id={doc.id} />
      <BottomNav active="allenamenti" />
    </main>
  );
}
