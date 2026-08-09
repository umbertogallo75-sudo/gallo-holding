import Link from "next/link";

export default function NotFound() {
  return (
    <main className="shell authWrap">
      <section className="authCard" style={{ textAlign: "center" }}>
        <div className="brand" style={{ justifyContent: "center" }}>ExecLingo</div>
        <div className="hero">
          <div className="kicker">404</div>
          <h1>Lost in translation.</h1>
          <p className="muted">This page doesn&rsquo;t exist.</p>
          <p className="itHint">Questa pagina non esiste — torna alla Home e continua da lì.</p>
        </div>
        <Link href="/home" className="primary full" style={{ display: "flex", alignItems: "center", justifyContent: "center" }}>← Back to Today · Torna alla Home</Link>
      </section>
    </main>
  );
}
