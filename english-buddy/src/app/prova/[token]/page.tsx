import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { readEmailToken } from "@/lib/marketing/tokens";
import { readTrial } from "@/lib/marketing/trial";
import { TrialStart } from "./TrialStart";

export const metadata = { title: "Le tue 24 ore gratis · ExecLingo" };
export const dynamic = "force-dynamic";

/**
 * Where the welcome email lands. The trial is not started by opening this
 * page — see the POST route for why — so what arrives here is an offer with
 * a button, and the terms said plainly before the clock starts rather than
 * after.
 */
export default async function TrialPage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = readEmailToken(token, "trial");
  const existing = userId ? await readTrial(userId) : null;
  const signedIn = (await getUserId()) === userId && Boolean(userId);

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/">← Indietro</Link></div>
      <section className="hero">
        <div className="kicker">Il tuo assaggio</div>
        <h1>24 ore di ExecLingo completo, gratis.</h1>
        <p className="muted">Nessuna carta, nessun rinnovo automatico. Parte quando premi tu.</p>
      </section>

      <section className="card">
        {!userId ? (
          <>
            <h2 style={{ marginTop: 0 }}>Link non valido</h2>
            <p style={{ marginBottom: 0 }}>Questo link non è più valido. Accedi con la tua email da <Link href="/login">execlingo.it</Link> e scrivici se il problema resta.</p>
          </>
        ) : (
          <TrialStart token={token} alreadyStarted={Boolean(existing)} extended={Boolean(existing?.extended)} active={Boolean(existing?.active)} signedIn={signedIn} />
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Come funziona, senza giri di parole</h2>
        <p>⏱️ <strong>24 ore</strong> con tutto aperto: chat e voce con Sam, riunioni simulate, English Rescue.</p>
        <p>🎁 Se <strong>entro quelle 24 ore</strong> rispondi alle tre domande del percorso e fai <strong>almeno 10 minuti</strong> di pratica, ricevi <strong>altre 24 ore</strong> gratis. Si attivano da sole, non devi chiedere nulla.</p>
        <p style={{ marginBottom: 0 }}>💳 Alla fine l&rsquo;accesso si chiude e basta. <strong>Nessun addebito automatico</strong>: se vorrai continuare, sceglierai tu un piano.</p>
      </section>
    </main>
  );
}
