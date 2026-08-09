import { redirect } from "next/navigation";
import { getUserId, OWNER_ID } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAPABILITIES } from "@/lib/learning/capabilities";
import { AdminActions } from "./AdminActions";

export const dynamic = "force-dynamic";

/**
 * Owner-only monitoring dashboard: who is using the app, how much, when they
 * were last active — with per-user nudges and notification intensity control.
 */
export default async function AdminPage() {
  const userId = await getUserId();
  if (!userId) redirect("/login");
  if (userId !== OWNER_ID) redirect("/home");

  const database = db();
  const [profiles, minutes, lastSessions, caps, pushes, lastNotifs, authUsers] = await Promise.all([
    database.execute("SELECT id, display_name, starting_level, notification_intensity, created_at FROM profiles ORDER BY created_at ASC"),
    database.execute("SELECT user_id, SUM(minutes_practiced) AS total_minutes, SUM(interactions) AS total_interactions, MAX(day) AS last_day FROM daily_metrics GROUP BY user_id"),
    database.execute("SELECT user_id, MAX(started_at) AS last_session, COUNT(*) AS session_count FROM sessions GROUP BY user_id"),
    database.execute("SELECT user_id, COUNT(*) AS cap_count FROM user_capabilities GROUP BY user_id"),
    database.execute("SELECT user_id, COUNT(*) AS sub_count FROM push_subscriptions GROUP BY user_id"),
    database.execute("SELECT user_id, MAX(sent_at) AS last_sent, COUNT(*) AS sent_count FROM notification_history GROUP BY user_id"),
    database.execute("SELECT id, email FROM auth_users"),
  ]);

  // Marketing funnel (last 7 / 30 days). Table may not exist before migration
  // 0010 runs — the funnel is simply hidden until then.
  const funnel = await database
    .execute(
      `SELECT name,
              SUM(CASE WHEN created_at >= datetime('now', '-7 days') THEN 1 ELSE 0 END) AS d7,
              COUNT(*) AS d30,
              COUNT(DISTINCT visitor_id) AS visitors30
       FROM analytics_events
       WHERE created_at >= datetime('now', '-30 days')
       GROUP BY name`
    )
    .catch(() => null);
  const funnelBy = new Map((funnel?.rows ?? []).map((r) => [String(r.name), r]));
  const f = (name: string, col: "d7" | "d30" | "visitors30") => Number(funnelBy.get(name)?.[col] ?? 0);

  // Billing state per user (table may predate migration 0011 — then nobody has it).
  const billingRows = await database.execute("SELECT user_id, plan, status FROM billing").catch(() => null);
  const billingBy = new Map((billingRows?.rows ?? []).map((r) => [String(r.user_id), r]));

  const by = (result: { rows: ArrayLike<Record<string, unknown>> }) =>
    new Map(Array.from(result.rows).map((r) => [String(r.user_id), r]));
  const minutesBy = by(minutes);
  const sessionsBy = by(lastSessions);
  const capsBy = by(caps);
  const pushBy = by(pushes);
  const notifBy = by(lastNotifs);
  const emailById = new Map(authUsers.rows.map((r) => [String(r.id), r.email ? String(r.email) : null]));

  // eslint-disable-next-line react-hooks/purity -- server component, rendered fresh per request
  const today = Date.now();
  const rows = profiles.rows.map((p) => {
    const id = String(p.id);
    const m = minutesBy.get(id);
    const s = sessionsBy.get(id);
    const lastActivity = s?.last_session ? String(s.last_session) : null;
    const daysIdle = lastActivity ? Math.floor((today - Date.parse(lastActivity)) / 86_400_000) : null;
    return {
      id,
      email: emailById.get(id) ?? null,
      name: String(p.display_name ?? "—"),
      startingLevel: p.starting_level ? String(p.starting_level) : "—",
      intensity: String(p.notification_intensity ?? "immersive"),
      createdAt: String(p.created_at ?? "").slice(0, 10),
      totalMinutes: Number(m?.total_minutes ?? 0),
      totalInteractions: Number(m?.total_interactions ?? 0),
      sessionCount: Number(s?.session_count ?? 0),
      lastActivity: lastActivity ? lastActivity.slice(0, 16).replace("T", " ") : "mai",
      daysIdle,
      capCount: Number(capsBy.get(id)?.cap_count ?? 0),
      hasPush: Number(pushBy.get(id)?.sub_count ?? 0) > 0,
      notifCount: Number(notifBy.get(id)?.sent_count ?? 0),
      plan: billingBy.get(id)?.status === "active" ? String(billingBy.get(id)?.plan ?? "") : "",
    };
  });

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo · Admin</div><a className="chip" href="/home">← App</a></div>
      <section className="hero">
        <div className="kicker">Solo per te</div>
        <h1>Chi sta imparando?</h1>
        <p className="muted">{rows.length} utenti · Gli utenti fermi da più di 3 giorni sono evidenziati. Puoi stimolarli con una notifica o regolare quante ne ricevono.</p>
      </section>
      {funnel ? (
        <section className="card">
          <h2 style={{ marginTop: 0 }}>📈 Funnel marketing</h2>
          <div style={{ overflowX: "auto" }}>
            <table className="adminTable">
              <thead><tr><th>Passo</th><th>7 giorni</th><th>30 giorni</th></tr></thead>
              <tbody>
                <tr><td>Visite alla landing</td><td>{f("landing_view", "d7")}</td><td>{f("landing_view", "d30")} ({f("landing_view", "visitors30")} visitatori)</td></tr>
                <tr><td>Click su «Prova Sam gratis»</td><td>{f("landing_cta_register", "d7")}</td><td>{f("landing_cta_register", "d30")}</td></tr>
                <tr><td>Registrazioni completate</td><td>{f("register_done", "d7")}</td><td>{f("register_done", "d30")}</td></tr>
                <tr><td>Onboarding completati</td><td>{f("onboarding_done", "d7")}</td><td>{f("onboarding_done", "d30")}</td></tr>
              </tbody>
            </table>
          </div>
          <p className="itHint" style={{ marginBottom: 0 }}>Dati raccolti in forma anonima dal nostro database, senza tracker esterni. Quando partirà la pubblicità, qui vedrai subito se le visite si trasformano in iscritti.</p>
        </section>
      ) : null}
      {rows.map((r) => (
        <section className="card" key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{r.name} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {r.email ?? r.id}</span></h2>
            <span style={{ display: "flex", gap: 6, alignItems: "center" }}>
              {r.plan ? <span className="chip chipBrand">{r.plan === "free" ? "🎁 gratis" : `💳 ${r.plan}`}</span> : null}
              {r.daysIdle !== null && r.daysIdle > 3 ? <span className="warnText" style={{ marginTop: 0 }}>fermo da {r.daysIdle} giorni</span> : <span className="chip">attivo</span>}
            </span>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="adminTable">
              <thead><tr><th>Livello</th><th>Iscritto</th><th>Ultima attività</th><th>Sessioni</th><th>Minuti</th><th>Interazioni</th><th>Capacità</th><th>Notifiche</th><th>Push</th></tr></thead>
              <tbody><tr>
                <td>{r.startingLevel}</td><td>{r.createdAt}</td><td>{r.lastActivity}</td><td>{r.sessionCount}</td>
                <td>{r.totalMinutes}</td><td>{r.totalInteractions}</td><td>{r.capCount}/{CAPABILITIES.length}</td><td>{r.notifCount}</td>
                <td>{r.hasPush ? "✓ attive" : "✗ non attive"}</td>
              </tr></tbody>
            </table>
          </div>
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 8 }}>
            {r.email ? (
              <a className="pill" style={{ alignSelf: "flex-start", textDecoration: "none" }}
                href={`mailto:${r.email}?subject=${encodeURIComponent("ExecLingo — come va il tuo inglese?")}&body=${encodeURIComponent(`Ciao ${r.name},\n\nho visto che è un po' che non pratichi su ExecLingo. Anche 2 minuti oggi contano!\n\nApri l'app: https://execlingo.it\n\nIl team di ExecLingo`)}`}>
                ✉️ Scrivi email
              </a>
            ) : null}
            <AdminActions userId={r.id} intensity={r.intensity} hasPush={r.hasPush} hasFree={r.plan === "free"} />
          </div>
        </section>
      ))}
      <p className="itHint" style={{ margin: "14px 4px" }}>
        Nota: l&rsquo;email viene raccolta alla registrazione — chi si è registrato prima di questa versione non la ha. &ldquo;✉️ Scrivi email&rdquo; apre la tua app di posta con un messaggio già pronto che puoi modificare. Le notifiche push arrivano solo a chi le ha attivate sul telefono.
      </p>
    </main>
  );
}
