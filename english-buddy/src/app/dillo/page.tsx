import { BottomNav } from "@/components/BottomNav";
import { requireUserId } from "@/lib/auth";
import { MissingPhrase } from "./MissingPhrase";

export const dynamic = "force-dynamic";
export const metadata = { title: "Come si dice · ExecLingo" };

/**
 * The gap you hit today, turned into what you will know tomorrow. Everything
 * else in the app decides what you practise; here you do — which is why it is
 * the one place a busy person opens without being asked.
 */
export default async function DilloPage() {
  await requireUserId();
  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><a className="chip" href="/home">← Home</a></div>
      <section className="hero">
        <div className="kicker">La frase che ti è mancata</div>
        <h1>Non sapevi dirlo?</h1>
        <p className="muted">Scrivi in italiano quello che volevi dire. Sam ti dà la frase che useresti davvero in riunione — e da domani te la riporta finché non ti viene da sola.</p>
      </section>
      <section className="card">
        <MissingPhrase />
      </section>
      <BottomNav active="home" />
    </main>
  );
}
