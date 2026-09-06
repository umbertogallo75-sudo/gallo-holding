import Link from "next/link";
import { getUserId } from "@/lib/auth";
import { readEmailToken } from "@/lib/marketing/tokens";
import { readTrial } from "@/lib/marketing/trial";
import { TrialStart } from "./TrialStart";

export const metadata = { title: "La tua settimana gratis · ExecLingo" };
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
        <h1>La prima settimana è gratis.</h1>
        <p className="muted">Sette giorni con tutto aperto. Nessuna carta, nessun rinnovo automatico.</p>
      </section>

      <section className="card">
        {!userId ? (
          <>
            <h2 style={{ marginTop: 0 }}>Link non valido</h2>
            <p style={{ marginBottom: 0 }}>Questo link non è più valido. Accedi con la tua email da <Link href="/login">execlingo.it</Link> e scrivici se il problema resta.</p>
          </>
        ) : (
          <TrialStart token={token} alreadyStarted={Boolean(existing)} active={Boolean(existing?.active)} signedIn={signedIn} />
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Come funziona, senza giri di parole</h2>
        <p>⏱️ <strong>Sette giorni</strong> con tutto aperto: chat e voce con Sam, riunioni simulate, English Rescue, le tue mail, i tuoi documenti, la tua agenda.</p>
        <p>🚀 <strong>Parte da sola alla registrazione.</strong> Non devi chiedere niente e non devi ricordarti di attivarla.</p>
        <p>💾 <strong>Quello che fai resta tuo.</strong> Alla fine della settimana l&rsquo;accesso si chiude, ma il tuo livello, il frasario e gli errori su cui stai lavorando restano dove sono: se torni, riprendi da lì.</p>
        <p style={{ marginBottom: 0 }}>💳 <strong>Nessun addebito automatico.</strong> Non chiediamo la carta, e alla fine non parte nessun pagamento: se vorrai continuare, sceglierai tu un piano.</p>
      </section>
    </main>
  );
}
