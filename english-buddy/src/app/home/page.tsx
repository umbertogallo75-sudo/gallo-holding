import Link from "next/link";
import { redirect } from "next/navigation";
import { BottomNav } from "@/components/BottomNav";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { NotificationReminder } from "@/components/NotificationReminder";
import { PersonalizeBanner } from "@/components/PersonalizeBanner";
import { pickFirstSession } from "@/lib/learning/first-session";
import { upcomingEvents } from "@/lib/events";
import { isEmbeddedApp } from "@/lib/appclient";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";
import { billingEnforced, getEntitlement } from "@/lib/stripe";

export default async function HomePage() {
  const userId = await requireUserId();
  const database = db();
  const today = new Date().toISOString().slice(0,10);
  const [profileResult, metricResult, sessionsResult] = await Promise.all([
    database.execute({ sql:"SELECT display_name, starting_level, onboarding_done_at, learning_goals, daily_minutes, path_started_at FROM profiles WHERE id = ? LIMIT 1", args:[userId] }),
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

  // Where they are in the ninety days, and what they said it was for. The
  // header answers "am I getting anywhere?" without making anyone open a
  // Progress tab to find out.
  const started = profile.path_started_at ? Date.parse(String(profile.path_started_at)) : NaN;
  // eslint-disable-next-line react-hooks/purity -- server component, rendered fresh per request
  const now = Date.now();
  const dayOfPath = Number.isNaN(started)
    ? 1
    : Math.min(90, Math.max(1, Math.floor((now - started) / 86_400_000) + 1));
  let goal = "";
  try {
    const parsed = profile.learning_goals ? (JSON.parse(String(profile.learning_goals)) as string[]) : [];
    goal = parsed[0] ?? "";
  } catch {
    goal = "";
  }

  // Today's session, decided rather than offered. The calendar wins when it
  // has something to say: a call tomorrow is a better reason to practise than
  // any rule about levels and goals, and it is the moment the coach earns its
  // place. Otherwise the same table that chose the first session chooses this
  // one.
  const events = await upcomingEvents(userId, today);
  const tomorrow = new Date(Date.parse(`${today}T00:00:00Z`) + 86_400_000).toISOString().slice(0, 10);
  const imminent = events.find((e) => e.date === today || e.date === tomorrow);
  const session = imminent
    ? {
        mode: "warmup",
        title: "Preparati a: " + imminent.title,
        why: imminent.date === today ? "È oggi. Cinque minuti con le frasi esatte che ti serviranno." : "È domani. Cinque minuti adesso e ci arrivi pronto.",
        href: `/buddy?mode=warmup&q=${encodeURIComponent(imminent.title)}`,
      }
    : (() => {
        const pick = pickFirstSession(
          profile.starting_level ? String(profile.starting_level) : null,
          goal || null,
          Number(profile.daily_minutes ?? 5)
        );
        return { ...pick, href: `/buddy?mode=${encodeURIComponent(pick.mode)}` };
      })();
  const minutes = Number(metric?.minutes_practiced || 0), interactions = Number(metric?.interactions || 0), reviewed = Number(metric?.expressions_reviewed || 0);
  return <main className="shell">
    <div className="topbar"><div className="brand">ExecLingo</div><a href="/profile" className="chip chipBrand">👤 {name}</a></div>
    <NotificationReminder />
    {!profile.onboarding_done_at ? <PersonalizeBanner /> : null}
    <section className="pathHeader">
      <div className="pathLine"><strong>Giorno {dayOfPath}</strong> di 90{goal ? <> · {goal.toLowerCase()}</> : null}</div>
      <div className="pathBar" aria-hidden><span style={{ width: `${Math.round((dayOfPath / 90) * 100)}%` }} /></div>
    </section>
    {!entitlement.access ? (
      <a href="/abbonamento" className="mode wide" style={{ display: "flex", marginBottom: 10, borderColor: "color-mix(in srgb, var(--amber) 55%, var(--line))" }}>
        <span className="modeIcon" style={{ background: "color-mix(in srgb, var(--amber) 22%, var(--surface))" }}>🔓</span>
        <div>
          <div className="modeTitle">Sblocca il tuo coach</div>
          <div className="modeMeta">{embedded ? "Il test del livello (3 minuti) è gratis. Hai un codice aziendale? Inseriscilo qui" : "Il test del livello (3 minuti) è gratis. Per allenarti con Sam attiva un piano o inserisci il codice aziendale"}</div>
        </div>
      </a>
    ) : null}
    <a href={isFirstTime ? "/buddy?mode=levelcheck" : session.href} className="todayCard" data-track="home_session_start">
      <div className="todayKicker">La tua sessione di oggi</div>
      <div className="todayTitle">{isFirstTime ? "Scopriamo il tuo livello" : session.title}</div>
      <div className="todayWhy">{isFirstTime ? "Tre minuti di chiacchierata. Niente esame, niente voti." : session.why}</div>
      <div className="todayCta">INIZIA →</div>
    </a>

    {/* Three shortcuts, and only three: the situations urgent enough that
        somebody would open the app for them specifically. Everything else
        lives one tap away rather than on the first screen. */}
    <div className="shortcuts">
      <Link href="/riunione" className="shortcut" data-track="home_shortcut_meeting">
        <span aria-hidden>🎧</span>
        <span><strong>Sono in riunione</strong>Salvagenti e «come si dice»</span>
      </Link>
      <Link href="/prepara" className="shortcut" data-track="home_shortcut_prepare">
        <span aria-hidden>📅</span>
        <span><strong>Preparami a un impegno</strong>Una riga e Sam ti prepara</span>
      </Link>
      <Link href="/rescue" className="shortcut" data-track="home_shortcut_rescue">
        <span aria-hidden>🆘</span>
        <span><strong>Mi serve adesso</strong>Scrivi in italiano, esce in inglese</span>
      </Link>
    </div>

    {/* Always visible, never in the way: the door to all sixteen activities
        for the days when choosing is the point. */}
    <Link href="/allenamenti" className="allTrainings" data-track="home_all_trainings">📋 Tutti gli allenamenti →</Link>

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
