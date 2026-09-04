import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { AppTracker } from "@/components/AppTracker";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { listDocuments } from "@/lib/documents/store";
import { Upload } from "./Upload";

export const dynamic = "force-dynamic";
export const metadata = { title: "Allenati su un documento — ExecLingo" };

export default async function DocumentsPage() {
  const userId = await requireUserId();
  const client = db();
  const [profile, docs] = await Promise.all([
    client.execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] }),
    listDocuments(userId, client),
  ]);
  if (!profile.rows.length) redirect("/onboarding");

  return (
    <main className="shell">
      <AppTracker />
      <div className="topbar"><div className="brand">Documenti</div><Link className="chip" href="/allenamenti">← Allenamenti</Link></div>

      <section className="hero">
        <div className="kicker">Preparati sul concreto</div>
        <h1>Allenati sul documento vero.</h1>
        <p className="muted">
          Il contratto che devi discutere, l&rsquo;offerta che devi difendere, le slide che devi presentare.
          Sam lo legge, ti insegna le parole di <em>quel</em> documento, ti fa le domande che ti faranno e
          poi recita la riunione con te.
        </p>
      </section>

      <Upload />

      {docs.length ? (
        <section className="card" style={{ padding: "6px 16px" }}>
          {docs.map((doc) => (
            <Link key={doc.id} href={`/documenti/${doc.id}`} className="mailRow">
              <span className="mailDot ready" aria-hidden />
              <span className="mailRowText">
                <span className="mailSubject">{doc.analysis.titleIt || doc.filename}</span>
                <span className="mailMeta">
                  {doc.analysis.kind}{doc.pages ? ` · ${doc.pages} pagine` : ""} · {doc.analysis.terms.length} espressioni
                </span>
              </span>
              <span className="stepGo" aria-hidden>→</span>
            </Link>
          ))}
        </section>
      ) : null}

      <BottomNav active="allenamenti" />
    </main>
  );
}
