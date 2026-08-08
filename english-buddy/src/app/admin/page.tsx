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
  const [profiles, minutes, lastSessions, caps, pushes, lastNotifs] = await Promise.all([
    database.execute("SELECT id, display_name, starting_level, notification_intensity, created_at FROM profiles ORDER BY created_at ASC"),
    database.execute("SELECT user_id, SUM(minutes_practiced) AS total_minutes, SUM(interactions) AS total_interactions, MAX(day) AS last_day FROM daily_metrics GROUP BY user_id"),
    database.execute("SELECT user_id, MAX(started_at) AS last_session, COUNT(*) AS session_count FROM sessions GROUP BY user_id"),
    database.execute("SELECT user_id, COUNT(*) AS cap_count FROM user_capabilities GROUP BY user_id"),
    database.execute("SELECT user_id, COUNT(*) AS sub_count FROM push_subscriptions GROUP BY user_id"),
    database.execute("SELECT user_id, MAX(sent_at) AS last_sent, COUNT(*) AS sent_count FROM notification_history GROUP BY user_id"),
  ]);

  const by = (result: { rows: ArrayLike<Record<string, unknown>> }) =>
    new Map(Array.from(result.rows).map((r) => [String(r.user_id), r]));
  const minutesBy = by(minutes);
  const sessionsBy = by(lastSessions);
  const capsBy = by(caps);
  const pushBy = by(pushes);
  const notifBy = by(lastNotifs);

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
    };
  });

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">English Buddy · Admin</div><a className="chip" href="/home">← App</a></div>
      <section className="hero">
        <div className="kicker">Solo per te</div>
        <h1>Chi sta imparando?</h1>
        <p className="muted">{rows.length} utenti · Gli utenti fermi da più di 3 giorni sono evidenziati. Puoi stimolarli con una notifica o regolare quante ne ricevono.</p>
      </section>
      {rows.map((r) => (
        <section className="card" key={r.id}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0 }}>{r.name} <span className="muted" style={{ fontSize: 13, fontWeight: 400 }}>· {r.id}</span></h2>
            {r.daysIdle !== null && r.daysIdle > 3 ? <span className="warnText" style={{ marginTop: 0 }}>fermo da {r.daysIdle} giorni</span> : <span className="chip">attivo</span>}
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
          <div style={{ marginTop: 10 }}>
            <AdminActions userId={r.id} intensity={r.intensity} hasPush={r.hasPush} />
          </div>
        </section>
      ))}
      <p className="itHint" style={{ margin: "14px 4px" }}>
        Nota: l&rsquo;app non raccoglie indirizzi email, quindi lo stimolo via email non è ancora disponibile — le notifiche push arrivano solo a chi le ha attivate. Se vuoi le email, possiamo aggiungere la raccolta dell&rsquo;email alla registrazione.
      </p>
    </main>
  );
}
