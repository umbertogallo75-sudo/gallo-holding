import { Suspense } from "react";
import { ResetForm } from "./ResetForm";

export default function ResetPage() {
  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">ExecLingo</div>
        <div className="hero">
          <div className="kicker">Nuova password</div>
          <h1>Scegli una nuova password.</h1>
          <p className="muted">La userai con la tua email per entrare.</p>
        </div>
        <Suspense>
          <ResetForm />
        </Suspense>
      </section>
    </main>
  );
}
