import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { AppTracker } from "@/components/AppTracker";
import { AliasCard } from "./AliasCard";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { aliasAddress, aliasFor, forgetOldBodies, listMail } from "@/lib/mail/store";

export const dynamic = "force-dynamic";
export const metadata = { title: "Le tue mail — ExecLingo" };

const MONTHS = ["gen", "feb", "mar", "apr", "mag", "giu", "lug", "ago", "set", "ott", "nov", "dic"];

function shortDate(iso: string): string {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "";
  return `${date.getDate()} ${MONTHS[date.getMonth()]} · ${String(date.getHours()).padStart(2, "0")}:${String(date.getMinutes()).padStart(2, "0")}`;
}

export default async function MailPage() {
  const userId = await requireUserId();
  const client = db();
  const profile = await client.execute({ sql: "SELECT id FROM profiles WHERE id = ? LIMIT 1", args: [userId] });
  if (!profile.rows.length) redirect("/onboarding");

  // Housekeeping on the way in: the original text of anything older than a
  // month goes, and what Sam made from it stays.
  await forgetOldBodies(userId, new Date(), client).catch(() => 0);

  const [alias, items] = await Promise.all([aliasFor(userId, client), listMail(userId, client)]);

  return (
    <main className="shell">
      <AppTracker />
      <div className="topbar"><div className="brand">Le tue mail</div><Link className="chip" href="/home">← Home</Link></div>

      <section className="hero">
        <div className="kicker">Mail in inglese</div>
        <h1>Girala a Sam.</h1>
        <p className="muted">
          Inoltra una mail in inglese al tuo indirizzo qui sotto. In pochi secondi Sam ti dice cosa c&rsquo;è scritto,
          cosa ti stanno chiedendo, e ti prepara la risposta in inglese pronta da copiare.
        </p>
      </section>

      <AliasCard address={aliasAddress(alias)} />

      {items.length ? (
        <section className="card" style={{ padding: "6px 16px" }}>
          {items.map((item) => (
            <Link key={item.id} href={`/mail/${item.id}`} className="mailRow">
              <span className={item.status === "ready" ? "mailDot ready" : item.status === "failed" ? "mailDot failed" : "mailDot"} aria-hidden />
              <span className="mailRowText">
                <span className="mailSubject">{item.subject || "(senza oggetto)"}</span>
                <span className="mailMeta">
                  {item.counterpart || item.fromName || item.fromAddress || "mittente sconosciuto"} · {shortDate(item.receivedAt)}
                  {item.status === "ready" ? " · risposta pronta" : item.status === "failed" ? " · da riprovare" : " · in lavorazione"}
                </span>
              </span>
              <span className="stepGo" aria-hidden>→</span>
            </Link>
          ))}
        </section>
      ) : (
        <section className="card">
          <p className="muted" style={{ margin: 0 }}>
            Qui compariranno le mail che inoltri, con la risposta pronta accanto. Non ne è ancora arrivata nessuna.
          </p>
        </section>
      )}

      <p className="composerNote" style={{ marginTop: 14 }}>
        🔒 Il testo originale delle mail viene cancellato dopo 30 giorni; restano il riassunto e la risposta.
        Non usiamo queste mail per addestrare nulla, e puoi cancellarne una quando vuoi.
      </p>

      <BottomNav active="allenamenti" />
    </main>
  );
}
