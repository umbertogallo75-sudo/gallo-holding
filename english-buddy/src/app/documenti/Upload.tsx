"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { MAX_BYTES, MAX_PAGES } from "@/lib/documents/analyse";

/**
 * Handing a document over, and the wait that follows.
 *
 * Reading ten pages and building a lesson out of them takes the best part of a
 * minute, which on a phone is long enough to look broken. So the wait says
 * what is happening and moves through it — the alternative is somebody
 * pressing the button again and paying twice for the same document.
 */
const STEPS = ["Sto leggendo il documento…", "Cerco le parole che ti serviranno…", "Preparo le domande…"];

export function Upload({ eventId }: { eventId?: string }) {
  const router = useRouter();
  const input = useRef<HTMLInputElement | null>(null);
  const [busy, setBusy] = useState(false);
  const [step, setStep] = useState(0);
  const [error, setError] = useState("");

  async function send(file: File) {
    setError("");
    if (file.size > MAX_BYTES) {
      setError(`Il file è troppo grande (massimo ${Math.round(MAX_BYTES / 1_000_000)} MB).`);
      return;
    }
    setBusy(true);
    setStep(0);
    const ticker = window.setInterval(() => setStep((s) => Math.min(s + 1, STEPS.length - 1)), 12_000);
    try {
      const body = new FormData();
      body.append("file", file);
      if (eventId) body.append("eventId", eventId);
      const response = await fetch("/api/documents", { method: "POST", body });
      const data = await response.json();
      if (!response.ok) { setError(data.error || "Non ha funzionato."); return; }
      router.push(`/documenti/${data.id}`);
      router.refresh();
    } catch {
      setError("Connessione persa mentre caricavo. Riprova.");
    } finally {
      window.clearInterval(ticker);
      setBusy(false);
      if (input.current) input.current.value = "";
    }
  }

  return (
    <section className="card">
      <input
        ref={input}
        type="file"
        accept="application/pdf,.pdf"
        hidden
        onChange={(event) => { const file = event.target.files?.[0]; if (file) void send(file); }}
      />
      <button type="button" className="primary full" style={{ minHeight: 58, fontSize: 17 }} disabled={busy} onClick={() => input.current?.click()}>
        {busy ? <><span className="navSpin" aria-hidden /> {STEPS[step]}</> : "📄 Carica un documento"}
      </button>
      <p className="composerNote" style={{ marginTop: 10 }}>
        Un PDF, al massimo {MAX_PAGES} pagine: il contratto, l&rsquo;offerta, le slide, i numeri di cui dovrai parlare.
        Sam lo legge e ti prepara le parole, le domande e la simulazione. <strong>Il file non viene conservato</strong>:
        restano solo il riassunto e il materiale.
      </p>
      {busy ? <p className="composerNote" style={{ marginTop: 6 }}>Può volerci fino a un minuto. Resta su questa pagina.</p> : null}
      {error ? <div className="notice" style={{ marginTop: 10 }}>{error}</div> : null}
    </section>
  );
}
