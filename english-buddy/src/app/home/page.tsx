import { BottomNav } from "@/components/BottomNav";
import { EnablePush } from "@/components/EnablePush";
import { WelcomeIntro } from "@/components/WelcomeIntro";
import { ModeGrid } from "@/components/ModeGrid";
import { requireUserId } from "@/lib/auth";
import { db } from "@/lib/db";

export default async function HomePage() {
  const userId = await requireUserId();
  const database = db();
  const today = new Date().toISOString().slice(0,10);
  const [profileResult, metricResult] = await Promise.all([
    database.execute({ sql:"SELECT display_name FROM profiles WHERE id = ? LIMIT 1", args:[userId] }),
    database.execute({ sql:"SELECT minutes_practiced, interactions, expressions_reviewed FROM daily_metrics WHERE user_id = ? AND day = ? LIMIT 1", args:[userId,today] }),
  ]);
  const profile = profileResult.rows[0];
  const metric = metricResult.rows[0];
  const name = profile?.display_name ? String(profile.display_name) : "there";
  const minutes = Number(metric?.minutes_practiced || 0), interactions = Number(metric?.interactions || 0), reviewed = Number(metric?.expressions_reviewed || 0);
  return <main className="shell">
    <div className="topbar"><div className="brand">English Buddy</div><span className="chip">Adaptive</span></div>
    <section className="hero"><div className="kicker">Hello, {name}</div><h1>What can you do right now?</h1><p className="muted">Pick the smallest thing that fits. A useful two minutes still counts.</p></section>
    <ModeGrid />
    <section className="stats"><div className="stat"><strong>{minutes}</strong><span>minutes today</span></div><div className="stat"><strong>{interactions}</strong><span>interactions</span></div><div className="stat"><strong>{reviewed}</strong><span>reviews</span></div></section>
    <EnablePush />
    <WelcomeIntro />
    <BottomNav active="home" />
  </main>;
}
