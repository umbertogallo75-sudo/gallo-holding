import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { NotificationReminder } from "@/components/NotificationReminder";
import { PersonalizeBanner } from "@/components/PersonalizeBanner";
import { ModeGrid } from "@/components/ModeGrid";
import { isEmbeddedApp } from "@/lib/appclient";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { billingEnforced, getEntitlement } from "@/lib/stripe";

export default async function HomePage() {
  const userId = await requireUserId();
  const database = db();
  const today = new Date().toISOString().slice(0,10);
  const [profileResult, metricResult, sessionsResult] = await Promise.all([
    database.execute({ sql:"SELECT display_name, starting_level, onboarding_done_at FROM profiles WHERE id = ? LIMIT 1", args:[userId] }),
    database.execute({ sql:"SELECT minutes_practiced, interactions, expressions_reviewed FROM daily_metrics WHERE user_id = ? AND day = ? LIMIT 1", args:[userId,today] }),
    database.execute({ sql:"SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?", args:[userId] }),
  ]);
  const sessionCount = Number(sessionsResult.rows[0]?.c ?? 0);
  const isFirstTime = sessionCount === 0;
  const entitlement = billingEnforced() ? await getEntitlement(userId) : { access: true };
  const embedded = await isEmbeddedApp();
  const profile = profileResult.rows[0];
  // The installed PWA starts here directly (manifest start_url), so this page
  // must route brand-new users through onboarding itself.
  if (!profile) redirect("/onboarding");
  const metric = metricResult.rows[0];
  const name = profile?.display_name ? String(profile.display_name) : "";
  const minutes = Number(metric?.minutes_practiced || 0), interactions = Number(metric?.interactions || 0), reviewed = Number(metric?.expressions_reviewed || 0);
  return <main className="shell">
    <div className="topbar"><div className="brand">ExecLingo</div><a href="/profile" className="chip chipBrand">👤 {name}</a></div>
    <NotificationReminder />
    {!profile.onboarding_done_at ? <PersonalizeBanner /> : null}
    <section className="hero"><div className="kicker">Ciao{name ? `, ${name}` : ""}</div><h1>Cosa facciamo oggi?</h1><p className="muted">Scegli quello che entra nel tempo che hai: anche due minuti contano.</p></section>
    {!entitlement.access ? (
      <a href="/abbonamento" className="mode wide" style={{ display: "flex", marginBottom: 10, borderColor: "color-mix(in srgb, var(--amber) 55%, var(--line))" }}>
        <span className="modeIcon" style={{ background: "color-mix(in srgb, var(--amber) 22%, var(--surface))" }}>🔓</span>
        <div>
          <div className="modeTitle">Sblocca il tuo coach</div>
          <div className="modeMeta">{embedded ? "Il test del livello (3 minuti) è gratis. Hai un codice aziendale? Inseriscilo qui" : "Il test del livello (3 minuti) è gratis. Per allenarti con Sam attiva un piano o inserisci il codice aziendale"}</div>
        </div>
      </a>
    ) : null}
    {isFirstTime ? (
      <a href="/buddy?mode=levelcheck" className="mode wide firstStep" style={{display:"flex", marginBottom:10}}>
        <span className="modeIcon" style={{background:"color-mix(in srgb, #1d6b4c 20%, var(--surface))"}}>🧭</span>
        <div>
          <div className="modeTitle">Primo passo: scopriamo il tuo livello</div>
          <div className="modeMeta">Tre minuti di chiacchierata. Niente esame, niente voti.</div>
        </div>
      </a>
    ) : null}
    <Link href="/riunione" className="mode wide" style={{ display: "flex", marginBottom: 10 }}>
      <span className="modeIcon" style={{ background: "color-mix(in srgb, #1d6b4c 20%, var(--surface))" }}>🎧</span>
      <div>
        <div className="modeTitle">Sei in riunione adesso?</div>
        <div className="modeMeta">Tienila accanto al portatile: quattro salvagenti per quando ti blocchi e il &laquo;come si dice&raquo;.</div>
      </div>
    </Link>
    <Link href="/prepara" className="mode wide" style={{ display: "flex", marginBottom: 10 }}>
      <span className="modeIcon" style={{ background: "color-mix(in srgb, var(--amber) 20%, var(--surface))" }}>📅</span>
      <div>
        <div className="modeTitle">Cosa hai in arrivo?</div>
        <div className="modeMeta">Una riunione, una call, un viaggio: scrivilo in una riga e Sam ti prepara.</div>
      </div>
    </Link>
    <ModeGrid beginner={["zero","basics"].includes(String(profile.starting_level ?? ""))} />
    {/* Three zeros are the worst possible welcome: the first thing the app
        would tell somebody who has just arrived is that they have done
        nothing. Numbers appear once there is something to count. */}
    {sessionCount > 0 ? (
      <section className="stats"><div className="stat"><strong>{minutes}</strong><span>minuti oggi</span></div><div className="stat"><strong>{interactions}</strong><span>scambi</span></div><div className="stat"><strong>{reviewed}</strong><span>ripassi</span></div></section>
    ) : null}
    <a href="/partner/dashboard" className="mode wide" style={{ display: "flex", marginTop: 10 }}>
      <span className="modeIcon" style={{ background: "color-mix(in srgb, var(--accent) 16%, var(--surface))" }}>🤝</span>
      <div>
        <div className="modeTitle">Consiglia ExecLingo, guadagni il 5%</div>
        <div className="modeMeta">Il tuo link personale: su ogni vendita prendi il 5%, con le immagini già pronte da condividere.</div>
      </div>
    </a>
    <WelcomeIntro />
    <BottomNav active="home" />
  </main>;
}
