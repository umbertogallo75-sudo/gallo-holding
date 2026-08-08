import { Suspense } from "react";
import { ResetForm } from "./ResetForm";

export default function ResetPage() {
  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">English Buddy</div>
        <div className="hero">
          <div className="kicker">New code</div>
          <h1>Choose a new code.</h1>
          <p className="muted">Pick a new personal access code — you&rsquo;ll use it every time you log in.</p>
          <p className="itHint">Scegli il tuo nuovo codice personale di accesso: lo userai ogni volta per entrare. Custodiscilo bene.</p>
        </div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </section>
    </main>
  );
}
