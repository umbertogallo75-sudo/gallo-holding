import Link from "next/link";
import { readEmailToken } from "@/lib/marketing/tokens";
import { UnsubscribeForm } from "./UnsubscribeForm";

export const metadata = { title: "Disiscriviti · ExecLingo" };
export const dynamic = "force-dynamic";

/**
 * The way out, reachable without signing in — a person who wants to stop
 * hearing from us must never be asked for a password first.
 *
 * Nothing happens on load: the confirmation is a button. Corporate mail
 * gateways follow every link in an incoming message to check it is safe, and
 * a page that unsubscribed on sight would silently cut off everyone behind
 * one of them.
 */
export default async function UnsubscribePage({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  const userId = readEmailToken(token, "unsub");

  return (
    <main className="shell">
      <div className="topbar"><div className="brand">ExecLingo</div><Link className="chip" href="/">← Indietro</Link></div>
      <section className="hero">
        <div className="kicker">Email</div>
        <h1>Non vuoi più ricevere le nostre email?</h1>
        <p className="muted">Basta un clic. Nessuna domanda, nessun modulo.</p>
      </section>

      <section className="card">
        {userId ? (
          <UnsubscribeForm token={token} />
        ) : (
          <>
            <h2 style={{ marginTop: 0 }}>Link non valido</h2>
            <p>Questo link non è più valido o è stato copiato male. Scrivi a <a href="mailto:ug@vaspitalia.com?subject=Disiscrizione%20email%20ExecLingo">ug@vaspitalia.com</a> dall&rsquo;indirizzo che ricevi le email e ti togliamo noi dalla lista.</p>
          </>
        )}
      </section>

      <section className="card">
        <h2 style={{ marginTop: 0 }}>Cosa smetterai di ricevere</h2>
        <p>I promemoria di Sam, il riepilogo della sera e le comunicazioni su ExecLingo.</p>
        <p className="muted" style={{ marginBottom: 0 }}>Restano solo le email indispensabili: recupero password, ricevute e conferme d&rsquo;acquisto. Quelle riguardano il tuo account e non possiamo toglierle.</p>
      </section>
    </main>
  );
}
