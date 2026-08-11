import { Suspense } from "react";
import { ResetForm } from "./ResetForm";

export default function ResetPage() {
  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">ExecLingo</div>
        <div className="hero">
          <div className="kicker">New code</div>
          <h1>Choose a new password.</h1>
          <p className="muted">Pick a new personal access code — you&rsquo;ll use it every time you log in.</p>
          <p className="itHint">Scegli la tua nuova password: la userai con la tua email per entrare.</p>
        </div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </section>
    </main>
  );
}
