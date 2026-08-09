import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { EnablePush } from "@/components/EnablePush";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { NotificationReminder } from "@/components/NotificationReminder";
import { ModeGrid } from "@/components/ModeGrid";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { billingEnforced, getEntitlement } from "@/lib/stripe";

export default async function HomePage() {
  const userId = await requireUserId();
  const database = db();
  const today = new Date().toISOString().slice(0,10);
  const [profileResult, metricResult, sessionsResult] = await Promise.all([
    database.execute({ sql:"SELECT display_name, starting_level FROM profiles WHERE id = ? LIMIT 1", args:[userId] }),
    database.execute({ sql:"SELECT minutes_practiced, interactions, expressions_reviewed FROM daily_metrics WHERE user_id = ? AND day = ? LIMIT 1", args:[userId,today] }),
    database.execute({ sql:"SELECT COUNT(*) AS c FROM sessions WHERE user_id = ?", args:[userId] }),
  ]);
  const isFirstTime = Number(sessionsResult.rows[0]?.c ?? 0) === 0;
  const entitlement = billingEnforced() ? await getEntitlement(userId) : { access: true };
  const profile = profileResult.rows[0];
  // The installed PWA starts here directly (manifest start_url), so this page
  // must route brand-new users through onboarding itself.
  if (!profile) redirect("/onboarding");
  const metric = metricResult.rows[0];
  const name = profile?.display_name ? String(profile.display_name) : "there";
  const minutes = Number(metric?.minutes_practiced || 0), interactions = Number(metric?.interactions || 0), reviewed = Number(metric?.expressions_reviewed || 0);
  return <main className="shell">
    <div className="topbar"><div className="brand">ExecLingo</div><a href="/profile" className="chip chipBrand">👤 {name}</a></div>
    <NotificationReminder />
    <section className="hero"><div className="kicker">Hello, {name}</div><h1>What can you do right now?</h1><p className="muted">Pick the smallest thing that fits. A useful two minutes still counts.</p><p className="itHint">Cosa riesci a fare adesso? Scegli l&rsquo;attività più piccola che entra nel tuo tempo: anche 2 minuti contano.</p></section>
    {!entitlement.access ? (
      <a href="/abbonamento" className="mode wide" style={{ display: "flex", marginBottom: 10, borderColor: "color-mix(in srgb, var(--amber) 55%, var(--line))" }}>
        <span className="modeIcon" style={{ background: "color-mix(in srgb, var(--amber) 22%, var(--surface))" }}>🔓</span>
        <div>
          <div className="modeTitle">Unlock your coach</div>
          <div className="modeMeta">The 3-minute level check is free — training with Sam needs a plan</div>
          <div className="itHint">Il test del livello (3 minuti) è gratis. Per allenarti con Sam attiva un piano o inserisci il tuo codice aziendale → tocca qui</div>
        </div>
      </a>
    ) : null}
    {isFirstTime ? (
      <a href="/buddy?mode=levelcheck" className="mode wide firstStep" style={{display:"flex", marginBottom:10}}>
        <span className="modeIcon" style={{background:"color-mix(in srgb, #1d6b4c 20%, var(--surface))"}}>🧭</span>
        <div>
          <div className="modeTitle">First step: find your level</div>
          <div className="modeMeta">A friendly 3-minute chat — no exam, no scores</div>
          <div className="itHint">Primo passo: scopri il tuo livello con 3 minuti di chiacchierata. Niente esame, niente voti — e poi si parte: seguimi e in 3 mesi sei operativo in inglese.</div>
        </div>
      </a>
    ) : null}
    <ModeGrid beginner={["zero","basics"].includes(String(profile.starting_level ?? ""))} />
    <section className="stats"><div className="stat"><strong>{minutes}</strong><span>minutes today</span><div className="itHint">minuti oggi</div></div><div className="stat"><strong>{interactions}</strong><span>interactions</span><div className="itHint">interazioni</div></div><div className="stat"><strong>{reviewed}</strong><span>reviews</span><div className="itHint">ripassi</div></div></section>
    <EnablePush />
    <WelcomeIntro />
    <BottomNav active="home" />
  </main>;
}
