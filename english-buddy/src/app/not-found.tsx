import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell authWrap">
      <section className="authCard" style={{ textAlign: "center" }}>
        <div className="brand" style={{ justifyContent: "center" }}>ExecLingo</div>
        <div className="hero">
          <div className="kicker">404</div>
          <h1>Questa pagina non c&rsquo;è.</h1>
          <p className="muted">Torna alla home e riprendi da lì.</p>
        </div>
        <Link href="/home" className="primary full" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>← Back to Today · Torna alla Home</Link>
      </section>
    </main>
  );
}
