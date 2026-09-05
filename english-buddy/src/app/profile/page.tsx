import { redirect } from "next/navigation";
import Link from "next/link";
import { BottomNav } from "@/components/BottomNav";
import { ThemePicker } from "@/components/ThemePicker";
import { NotificationReminder } from "@/components/NotificationReminder";
import { requireUserId, OWNER_ID } from "@/lib/auth";
import { db } from "@/lib/db";
import { CAPABILITIES, monthPhase } from "@/lib/learning/capabilities";
import { LogoutButton } from "./LogoutButton";
import { ChangeCode } from "./ChangeCode";

const LEVEL_LABELS: Record<string, string> = {
  zero: "Parto da zero",
  basics: "Capisco qualcosa",
  independent: "Me la cavo",
  business: "Business English",
};

export default async function ProfilePage() {
  const userId = await requireUserId();
  const database = db();
  const [profileResult, stateResult, totalsResult, capsResult, emailResult] = await Promise.all([
    database.execute({ sql: "SELECT display_name, starting_level, notification_intensity, path_started_at, created_at FROM profiles WHERE id = ? LIMIT 1", args: [userId] }),
    database.execute({ sql: "SELECT cefr_level, primary_goal FROM learning_state WHERE user_id = ? LIMIT 1", args: [userId] }),
    database.execute({ sql: "SELECT SUM(minutes_practiced) AS m, SUM(interactions) AS i FROM daily_metrics WHERE user_id = ?", args: [userId] }),
    database.execute({ sql: "SELECT COUNT(*) AS c FROM user_capabilities WHERE user_id = ?", args: [userId] }),
    database.execute({ sql: "SELECT email FROM auth_users WHERE id = ? LIMIT 1", args: [userId] }),
  ]);
  const profile = profileResult.rows[0];
  if (!profile) redirect("/onboarding");

  const name = String(profile.display_name ?? "Friend");
  const email = emailResult.rows[0]?.email ? String(emailResult.rows[0].email) : userId === OWNER_ID ? "Account proprietario" : null;
  const startingLevel = profile.starting_level ? String(profile.starting_level) : null;
  const cefr = stateResult.rows[0]?.cefr_level ? String(stateResult.rows[0].cefr_level) : "—";
  const phase = monthPhase(profile.path_started_at ? String(profile.path_started_at) : String(profile.created_at ?? ""));
  const since = String(profile.created_at ?? "").slice(0, 10);
  const minutes = Number(totalsResult.rows[0]?.m ?? 0);
  const interactions = Number(totalsResult.rows[0]?.i ?? 0);
  const caps = Number(capsResult.rows[0]?.c ?? 0);

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">Profilo</div><span style={{display:"flex",gap:6}}><span className="chip chipBrand">✓ Sei connesso</span><a className="chip" href="/home">← Home</a></span></div>
      <NotificationReminder />

      <section className="card profileCard">
        <div className="avatar">{name.slice(0, 1).toUpperCase()}</div>
        <div>
          <h2 style={{ margin: 0 }}>{name}</h2>
          {email ? <p className="muted" style={{ margin: "2px 0 0", fontSize: 14.5 }}>{email}</p> : null}
          <p className="composerNote" style={{ marginTop: 4 }}>Sei loggato: i tuoi progressi vengono salvati automaticamente su questo account.</p>
        </div>
      </section>

      <section className="card">
        <h2>Il tuo percorso</h2>
        <div className="profileRows">
          <div><span className="muted">Livello di partenza</span><strong>{startingLevel ? LEVEL_LABELS[startingLevel] ?? startingLevel : "Non impostato"}</strong></div>
          <div><span className="muted">Livello attuale (CEFR)</span><strong>{cefr}</strong></div>
          <div><span className="muted">Fase del percorso</span><strong>Mese {phase} di 3</strong></div>
          <div><span className="muted">Iscritto dal</span><strong>{since || "—"}</strong></div>
        </div>
      </section>

      <section className="stats">
        <div className="stat"><strong>{minutes}</strong><span>minuti totali</span></div>
        <div className="stat"><strong>{interactions}</strong><span>scambi</span></div>
        <div className="stat"><strong>{caps}/{CAPABILITIES.length}</strong><span>abilità</span></div>
      </section>

      <ThemePicker />

      <Link href="/abbonamento" className="secondary full" style={{ display: "block", textAlign: "center", marginBottom: 10 }}>
        💳 Abbonamento e piani
      </Link>
      <Link href="/partner/dashboard" className="secondary full" style={{ display: "block", textAlign: "center", marginBottom: 10, borderColor: "color-mix(in srgb, var(--accent) 45%, var(--line))" }}>
        🤝 Promuovi ExecLingo — guadagna il 5%
      </Link>
      <Link href="/onboarding" className="secondary full" style={{ display: "block", textAlign: "center", marginBottom: 10 }}>
        ⚙️ Cambia livello, obiettivi o notifiche
      </Link>
      {userId !== OWNER_ID ? <ChangeCode /> : null}
      {userId === OWNER_ID ? (
        <Link href="/admin" className="secondary full" style={{ display: "block", textAlign: "center", marginBottom: 10 }}>
          👑 Dashboard di monitoraggio
        </Link>
      ) : null}
      {/* Il manuale, dove la gente lo cerca davvero: nel profilo, insieme alle
          altre cose che non sono un allenamento. */}
      <Link href="/guida" className="secondary full" style={{ display: "block", textAlign: "center", marginBottom: 10 }} data-track="guide_open" data-where="profile">
        ▶︎ Come si usa l&rsquo;app — la guida video
      </Link>
      <Link href="/elimina-account" className="secondary full" style={{ display: "block", textAlign: "center", marginBottom: 10 }}>
        Elimina il mio account e i miei dati
      </Link>
      <LogoutButton />

      <BottomNav active="profile" />
    </main>
  );
}
