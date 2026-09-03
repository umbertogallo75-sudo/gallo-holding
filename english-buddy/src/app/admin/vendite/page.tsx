import { redirect } from "next/navigation";
import { getAuthSession } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin-access";
import { db } from "@/lib/db";
import { MIN_PAYOUT_CENTS, promoteHeldCommissions } from "@/lib/partners";
import { PartnerAdminActions, MarkPaidButton } from "./PartnerAdminActions";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sales Control Center · ExecLingo" };

const euro = (cents: number) => (cents / 100).toLocaleString("it-IT", { minimumFractionDigits: 2 }) + " €";

/** Owner-only Sales Control Center: the whole commercial network at a glance. */
export default async function SalesControlCenterPage() {
  const session = await getAuthSession();
  if (!session) redirect("/login");
  if (!(await isAdminUser(session.userId, session.method))) redirect("/home");

  const database = db();
  await promoteHeldCommissions().catch(() => {});

  const [partners, ledgerTotals, clicksTotal, attrTotal, byPartner, payouts, auditTail] = await Promise.all([
    database.execute("SELECT * FROM partners ORDER BY created_at DESC").catch(() => null),
    database.execute("SELECT status, COUNT(*) AS n, SUM(amount_cents) AS amount, SUM(net_cents) AS net FROM commissions GROUP BY status").catch(() => null),
    database.execute("SELECT COUNT(*) AS c FROM partner_clicks").catch(() => null),
    database.execute("SELECT COUNT(*) AS c FROM partner_attributions").catch(() => null),
    database.execute(`SELECT partner_id,
        COUNT(DISTINCT user_id) AS customers,
        SUM(CASE WHEN status != 'reversed' THEN net_cents ELSE 0 END) AS net,
        SUM(CASE WHEN status != 'reversed' THEN amount_cents ELSE 0 END) AS commission,
        SUM(CASE WHEN status = 'available' AND payout_id IS NULL THEN amount_cents ELSE 0 END) AS available
      FROM commissions GROUP BY partner_id`).catch(() => null),
    database.execute("SELECT * FROM payouts ORDER BY created_at DESC LIMIT 20").catch(() => null),
    database.execute("SELECT actor, action, entity, detail, created_at FROM partner_audit ORDER BY created_at DESC LIMIT 20").catch(() => null),
  ]);

  const rows = partners?.rows ?? [];
  const statsBy = new Map((byPartner?.rows ?? []).map((r) => [String(r.partner_id), r]));
  const totals = { partners: rows.length, active: rows.filter((p) => String(p.status) === "ACTIVE").length, net: 0, commission: 0, pending: 0, available: 0, paid: 0 };
  for (const r of ledgerTotals?.rows ?? []) {
    const status = String(r.status);
    if (status !== "reversed") { totals.net += Number(r.net ?? 0); totals.commission += Number(r.amount ?? 0); }
    if (status === "pending") totals.pending += Number(r.amount ?? 0);
    if (status === "available") totals.available += Number(r.amount ?? 0);
    if (status === "paid") totals.paid += Number(r.amount ?? 0);
  }

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo · Sales Control Center</div><a className="chip" href="/admin">← Admin</a></div>

      <section className="hero">
        <div className="kicker">Rete commerciale</div>
        <h1>Come vende ExecLingo?</h1>
        <p className="muted">{totals.partners} partner ({totals.active} attivi) · provvigione massima di piattaforma: 5%</p>
      </section>

      <section className="stats">
        <div className="stat"><strong>{Number(clicksTotal?.rows[0]?.c ?? 0)}</strong><span>click referral</span><div className="itHint">visite dai link partner</div></div>
        <div className="stat"><strong>{Number(attrTotal?.rows[0]?.c ?? 0)}</strong><span>registrati</span><div className="itHint">iscritti attribuiti</div></div>
        <div className="stat"><strong>{euro(totals.net)}</strong><span>net revenue</span><div className="itHint">venduto dai partner (netto IVA)</div></div>
      </section>
      <section className="stats">
        <div className="stat"><strong>{euro(totals.pending)}</strong><span>in maturazione</span><div className="itHint">provvigioni in hold</div></div>
        <div className="stat"><strong>{euro(totals.available)}</strong><span>da pagare</span><div className="itHint">provvigioni disponibili</div></div>
        <div className="stat"><strong>{euro(totals.paid)}</strong><span>pagate</span><div className="itHint">provvigioni versate</div></div>
      </section>
      <p className="itHint" style={{ margin: "0 4px 10px" }}>Costo commerciale totale: {euro(totals.commission)} su {euro(totals.net)} di venduto netto ({totals.net > 0 ? ((totals.commission / totals.net) * 100).toFixed(1) : "0"}%) → ricavo netto dopo provvigioni: <strong>{euro(totals.net - totals.commission)}</strong></p>

      {rows.map((p) => {
        const id = String(p.user_id);
        const s = statsBy.get(id);
        const available = Number(s?.available ?? 0);
        const docsOk = String(p.payout_docs_status) === "complete";
        return (
          <section className="card" key={id}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
              <h2 style={{ margin: 0 }}>{String(p.name)} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {String(p.partner_type)} · {String(p.ref_code)}</span></h2>
              <span className="chip" style={String(p.status) !== "ACTIVE" ? { borderColor: "#b3362a", color: "#b3362a" } : undefined}>{String(p.status)}</span>
            </div>
            <div style={{ overflowX: "auto", margin: "8px 0" }}>
              <table className="adminTable">
                <thead><tr><th>%</th><th>Clienti</th><th>Netto venduto</th><th>Provvigioni</th><th>Disponibili</th><th>Incasso</th><th>Dal</th></tr></thead>
                <tbody><tr>
                  <td>{Number(p.commission_rate)}%</td>
                  <td>{Number(s?.customers ?? 0)}</td>
                  <td>{euro(Number(s?.net ?? 0))}</td>
                  <td>{euro(Number(s?.commission ?? 0))}</td>
                  <td><strong>{euro(available)}</strong></td>
                  <td>{docsOk ? "✓ dati ok" : "✗ mancanti"}</td>
                  <td>{String(p.created_at).slice(0, 10)}</td>
                </tr></tbody>
              </table>
            </div>
            <PartnerAdminActions partnerId={id} rate={Number(p.commission_rate)} status={String(p.status)} canPayout={available >= MIN_PAYOUT_CENTS && docsOk} />
          </section>
        );
      })}
      {rows.length === 0 ? <section className="card"><p className="muted" style={{ margin: 0 }}>Ancora nessun partner. La pagina pubblica è <strong>execlingo.it/partner</strong>.</p></section> : null}

      {payouts && payouts.rows.length > 0 ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>💸 Pagamenti partner</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="adminTable">
              <thead><tr><th>Data</th><th>Partner</th><th>Importo</th><th>Stato</th><th>Rif.</th><th></th></tr></thead>
              <tbody>
                {payouts.rows.map((po, i) => (
                  <tr key={i}>
                    <td>{String(po.created_at).slice(0, 10)}</td>
                    <td style={{ fontSize: 12 }}>{String(po.partner_id).slice(0, 10)}…</td>
                    <td><strong>{euro(Number(po.amount_cents))}</strong></td>
                    <td>{String(po.status)}</td>
                    <td>{po.reference ? String(po.reference) : "—"}</td>
                    <td>{String(po.status) !== "paid" ? <MarkPaidButton payoutId={String(po.id)} /> : null}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <p className="itHint" style={{ marginBottom: 0 }}>Flusso: crei il pagamento → fai il bonifico reale → &ldquo;Segna pagato&rdquo; col riferimento. Le provvigioni passano a &ldquo;pagate&rdquo; e restano in archivio per sempre.</p>
        </section>
      ) : null}

      {auditTail && auditTail.rows.length > 0 ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>🧾 Registro attività</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="adminTable">
              <thead><tr><th>Quando</th><th>Chi</th><th>Azione</th><th>Dettaglio</th></tr></thead>
              <tbody>
                {auditTail.rows.map((a, i) => (
                  <tr key={i}>
                    <td>{String(a.created_at).slice(0, 16).replace("T", " ")}</td>
                    <td style={{ fontSize: 12 }}>{String(a.actor).slice(0, 10)}</td>
                    <td>{String(a.action)}</td>
                    <td style={{ fontSize: 12 }}>{a.detail ? String(a.detail) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>
      ) : null}

      <p className="itHint" style={{ margin: "0 4px 24px" }}>
        Le cifre nascono solo dal registro provvigioni, alimentato dagli eventi verificati di Stripe (netto IVA, storno automatico sui rimborsi). Nessuna provvigione può superare il 5%: il limite è imposto a livello di motore, API e interfaccia.
      </p>
    </main>
  );
}
