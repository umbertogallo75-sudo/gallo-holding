"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const SOURCES: Array<[string, string]> = [
  ["MEETING", "Incontro"], ["PHONE", "Telefonata"], ["EMAIL", "Email"],
  ["WHATSAPP", "WhatsApp"], ["NETWORKING", "Networking"], ["REFERRAL", "Presentazione"], ["OTHER", "Altro"],
];

export function LeadForm() {
  const [open, setOpen] = useState(false);
  const [contactName, setContactName] = useState("");
  const [email, setEmail] = useState("");
  const [company, setCompany] = useState("");
  const [source, setSource] = useState("MEETING");
  const [notes, setNotes] = useState("");
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  if (!open) {
    return <button type="button" className="secondary full" onClick={() => setOpen(true)}>➕ Registra un contatto commerciale</button>;
  }

  async function save(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setStatus("");
    try {
      const r = await fetch("/api/partner/lead", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ contactName, email: email || undefined, company: company || undefined, source, notes: notes || undefined }),
      });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) { setStatus(data.error || "Errore"); setBusy(false); return; }
      setStatus("Contatto registrato ✓ — se si iscrive con questa email entro il periodo di protezione, il cliente è tuo.");
      setContactName(""); setEmail(""); setCompany(""); setNotes("");
      setBusy(false);
      router.refresh();
    } catch {
      setStatus("Connessione assente.");
      setBusy(false);
    }
  }

  return (
    <form onSubmit={save} className="card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      <h3 style={{ margin: 0 }}>Nuovo contatto commerciale</h3>
      <input className="field" required minLength={2} placeholder="Nome del contatto / azienda" value={contactName} onChange={(e) => setContactName(e.target.value)} />
      <input className="field" type="email" placeholder="Email (per l'attribuzione automatica)" value={email} onChange={(e) => setEmail(e.target.value)} />
      <input className="field" placeholder="Azienda (opzionale)" value={company} onChange={(e) => setCompany(e.target.value)} />
      <select className="field" value={source} onChange={(e) => setSource(e.target.value)}>
        {SOURCES.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
      </select>
      <input className="field" placeholder="Note (opzionale)" value={notes} onChange={(e) => setNotes(e.target.value)} />
      {status ? <p className="itHint" style={{ margin: 0 }}>{status}</p> : null}
      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" className="secondary" onClick={() => setOpen(false)}>Chiudi</button>
        <button className="primary" style={{ flex: 1 }} disabled={busy}>{busy ? "Salvo…" : "Salva contatto"}</button>
      </div>
    </form>
  );
}
