import Link from "next/link";
import { redirect } from "next/navigation";
import { getUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { getPartner, partnerStats } from "@/lib/partners";
import { CAMPAIGNS, FORMATS } from "@/lib/marketing-kit";
import { JoinForm } from "./JoinForm";
import { LeadForm } from "./LeadForm";
import { PayoutForm } from "./PayoutForm";
import { CopyButton, DownloadPng, SavePhoto, ShareImage, ShareLink, SharePhotoWithText, WhatsAppPhotoShare, WhatsAppShare } from "./KitTools";

export const dynamic = "force-dynamic";
export const metadata = { title: "Partner Dashboard · ExecLingo" };

const euro = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";

/** Partner dashboard: strictly self-scoped — a partner only ever sees their own data. */
export default async function PartnerDashboardPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");

  const partner = await getPartner(userId);
  if (!partner) {
    return (
      <main className="shell">
        <div className="topbar"><div className="brand">ExecLingo · Partner</div><Link className="chip" href="/home">← App</Link></div>
        <section className="hero"><div className="kicker">Programma Partner</div><h1>Un ultimo passo.</h1></section>
        <JoinForm />
      </main>
    );
  }

  const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
  const refUrl = `${base}/r/${partner.refCode}`;
  const [stats, ledger, leads, payouts] = await Promise.all([
    partnerStats(userId),
    db().execute({ sql: "SELECT plan, net_cents, rate, amount_cents, status, earned_at FROM commissions WHERE partner_id = ? ORDER BY earned_at DESC LIMIT 25", args: [userId] }).catch(() => null),
    db().execute({ sql: "SELECT contact_name, company, source, status, created_at FROM partner_leads WHERE partner_id = ? ORDER BY created_at DESC LIMIT 15", args: [userId] }).catch(() => null),
    db().execute({ sql: "SELECT amount_cents, status, reference, created_at FROM payouts WHERE partner_id = ? ORDER BY created_at DESC LIMIT 10", args: [userId] }).catch(() => null),
  ]);
  const suspended = partner.status !== "ACTIVE";

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo · Partner</div><Link className="chip" href="/home">← App</Link></div>

      <section className="hero">
        <div className="kicker">Partner Dashboard</div>
        <h1>Ciao, {partner.name}.</h1>
        <p className="muted">Provvigione: <strong>{partner.commissionRate}%</strong> sul netto IVA · Stato: <strong>{suspended ? partner.status : "ATTIVO"}</strong></p>
        {suspended ? <p className="warnText">Account partner non attivo: le nuove vendite non maturano provvigioni. Contatta ug@vaspitalia.com.</p> : null}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>I tuoi strumenti</h2>
        <div className="profileRows">
          <div><span className="muted">Link personale</span><strong style={{ userSelect: "all", fontSize: 14 }}>{refUrl}</strong></div>
          <div><span className="muted">Codice</span><strong style={{ userSelect: "all" }}>{partner.refCode}</strong></div>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginTop: 10 }}>
          <WhatsAppShare text={`Ti consiglio ExecLingo: il coach AI di inglese per chi lavora, si adatta al tempo che hai (anche 2 minuti). Il test del livello è gratis: ${refUrl}`} />
          <ShareLink title="ExecLingo" text="Prova ExecLingo, il coach AI di inglese per chi lavora. Il test del livello è gratis." url={refUrl} />
          <CopyButton text={refUrl} label="📋 Copia link" />
          <CopyButton text={partner.refCode} label="📋 Copia codice" />
          <a className="pill" href="/api/partner/qr" style={{ textDecoration: "none" }}>⬇️ Scarica QR</a>
        </div>
        <p className="itHint" style={{ marginBottom: 0 }}>Chi apre il tuo link (o inserisce il codice alla registrazione) resta tuo per 30 giorni. Le vendite maturano il {partner.commissionRate}% dopo 30 giorni di attesa a tutela dei rimborsi.</p>
      </section>

      <section className="stats">
        <div className="stat"><strong>{stats.clicks}</strong><span>click</span><div className="itHint">visite dal tuo link</div></div>
        <div className="stat"><strong>{stats.registrations}</strong><span>registrati</span><div className="itHint">iscritti attribuiti</div></div>
        <div className="stat"><strong>{euro(stats.revenueCents)}</strong><span>revenue</span><div className="itHint">vendite generate</div></div>
      </section>
      <section className="stats">
        <div className="stat"><strong>{euro(stats.pendingCents)}</strong><span>in maturazione</span><div className="itHint">disponibili tra ≤30 gg</div></div>
        <div className="stat"><strong>{euro(stats.availableCents)}</strong><span>disponibili</span><div className="itHint">pronte per il pagamento</div></div>
        <div className="stat"><strong>{euro(stats.paidCents)}</strong><span>pagate</span><div className="itHint">già ricevute</div></div>
      </section>

      {partner.payoutDocsStatus !== "complete" ? (
        <>
          <p className="warnText" style={{ margin: "0 4px 8px" }}>⚠️ Per ricevere i pagamenti servono i tuoi dati di incasso (minimo di pagamento: 50 €).</p>
          <PayoutForm />
        </>
      ) : null}

      <section className="card">
        <h2 style={{ marginTop: 0 }}>💼 Contatti commerciali</h2>
        <p className="muted" style={{ marginTop: 0 }}>Lavori un cliente di persona, al telefono o su WhatsApp? Registralo: se si iscrive con quella email entro il periodo di protezione, la vendita è tua anche senza link.</p>
        <LeadForm />
        {leads && leads.rows.length > 0 ? (
          <div style={{ overflowX: "auto", marginTop: 10 }}>
            <table className="adminTable">
              <thead><tr><th>Contatto</th><th>Fonte</th><th>Stato</th><th>Registrato</th></tr></thead>
              <tbody>
                {leads.rows.map((l, i) => (
                  <tr key={i}>
                    <td>{String(l.contact_name)}{l.company ? ` · ${String(l.company)}` : ""}</td>
                    <td>{String(l.source)}</td>
                    <td>{String(l.status) === "converted" ? "✅ convertito" : "in corso"}</td>
                    <td>{String(l.created_at).slice(0, 10)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>🎨 Marketing Kit</h2>
        <p className="muted" style={{ marginTop: 0 }}>Immagini professionali pronte da pubblicare: condividile con il testo qui sotto, che contiene il <strong>tuo link personale</strong> — chi clicca è attribuito a te. Il <strong>Volantino con QR</strong> è pensato per la stampa e gli incontri di persona. Dal telefono: <strong>&ldquo;Condividi con testo&rdquo;</strong> allega la foto e prepara il testo col tuo link (è anche copiato: se l&rsquo;app non lo mostra, tieni premuto e incolla); <strong>&ldquo;Salva&rdquo;</strong> apre la condivisione &rarr; tocca <strong>Salva immagine</strong> e la trovi nella galleria.</p>
        {CAMPAIGNS.map((c) => (
          <div key={c.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: 12 }}>
            <strong>{c.title}</strong>
            <p className="muted" style={{ margin: "2px 0 8px", fontSize: 14 }}>&ldquo;{c.headline}&rdquo;</p>
            {c.photos?.length ? (
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 8 }}>
                {c.photos.map((p) => (
                  <div key={p.src} style={{ width: "100%", maxWidth: 320 }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img src={p.src} alt={`${p.label} · ${c.title}`} loading="lazy" style={{ width: "100%", borderRadius: 14, border: "1px solid var(--line)", display: "block", marginBottom: 6 }} />
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <SharePhotoWithText src={p.src} name={`execlingo-${p.src.split("/").pop() ?? `${c.id}.jpg`}`} text={c.waCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} />
                      <SavePhoto src={p.src} name={`execlingo-${p.src.split("/").pop() ?? `${c.id}.jpg`}`} label="📲 Salva" />
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              /* eslint-disable-next-line @next/next/no-img-element */
              <img src={`/api/partner/creative?campaign=${c.id}&format=ig&inline=1`} alt={`Anteprima campagna ${c.title}`} loading="lazy" style={{ width: "100%", maxWidth: 320, borderRadius: 14, border: "1px solid var(--line)", marginBottom: 8, display: "block" }} />
            )}
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
              {c.photos?.length ? (
                <WhatsAppPhotoShare src={c.photos[0].src} name={`execlingo-${c.photos[0].src.split("/").pop() ?? `${c.id}.jpg`}`} text={c.waCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} />
              ) : (
                <WhatsAppShare text={c.waCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} />
              )}
              <ShareImage campaign={c.id} format="ig" w={1080} h={1080} caption={c.waCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} />
              {FORMATS.map((f) => (
                <DownloadPng key={f.id} campaign={c.id} format={f.id} w={f.w} h={f.h} label={`⬇️ ${f.label}`} />
              ))}
              <CopyButton text={c.igCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} label="📋 Testo Instagram" />
              <CopyButton text={c.liCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} label="📋 Testo LinkedIn" />
              <CopyButton text={c.waCopy.replace("[LINK]", `${refUrl}?campaign=${c.id}`)} label="📋 Testo WhatsApp" />
            </div>
          </div>
        ))}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Le tue provvigioni</h2>
        {ledger && ledger.rows.length > 0 ? (
          <div style={{ overflowX: "auto" }}>
            <table className="adminTable">
              <thead><tr><th>Data</th><th>Piano</th><th>Netto IVA</th><th>%</th><th>Provvigione</th><th>Stato</th></tr></thead>
              <tbody>
                {ledger.rows.map((c, i) => (
                  <tr key={i}>
                    <td>{String(c.earned_at).slice(0, 10)}</td>
                    <td>{String(c.plan ?? "—")}</td>
                    <td>{euro(Number(c.net_cents))}</td>
                    <td>{Number(c.rate)}%</td>
                    <td><strong>{euro(Number(c.amount_cents))}</strong></td>
                    <td>{{ pending: "in maturazione", available: "disponibile", paid: "pagata", reversed: "stornata" }[String(c.status)] ?? String(c.status)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : (
          <p className="muted" style={{ margin: 0 }}>Ancora nessuna vendita — condividi il tuo link e si popolerà da solo.</p>
        )}
      </section>

      {payouts && payouts.rows.length > 0 ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>Pagamenti ricevuti</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="adminTable">
              <thead><tr><th>Data</th><th>Importo</th><th>Stato</th><th>Riferimento</th></tr></thead>
              <tbody>
                {payouts.rows.map((p, i) => (
                  <tr key={i}>
                    <td>{String(p.created_at).slice(0, 10)}</td>
                    <td><strong>{euro(Number(p.amount_cents))}</strong></td>
                    <td>{String(p.status) === "paid" ? "✅ pagato" : String(p.status)}</td>
                    <td>{p.reference ? String(p.reference) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="itHint" style={{ margin: "0 4px 24px", textAlign: "center" }}>
        Provvigione massima di piattaforma: 5% · maturazione 30 giorni · niente auto-referral · <Link href="/partner">regole del programma</Link>
      </p>
    </main>
  );
}
