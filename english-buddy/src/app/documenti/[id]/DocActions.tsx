"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

export function DocActions({ id }: { id: string }) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);

  async function remove() {
    setBusy(true);
    await fetch(`/api/documents?id=${encodeURIComponent(id)}`, { method: "DELETE" }).catch(() => null);
    router.push("/documenti");
    router.refresh();
  }

  if (!confirming) {
    return (
      <button type="button" className="secondary full" style={{ marginBottom: 10 }} onClick={() => setConfirming(true)}>
        Elimina questo documento
      </button>
    );
  }
  return (
    <div className="notice" style={{ marginBottom: 10 }}>
      <strong>Elimino il materiale di questo documento?</strong> Spariscono riassunto, parole e domande. Il file
      originale non l&rsquo;abbiamo mai avuto.
      <div className="aliasRow" style={{ marginTop: 10 }}>
        <button type="button" className="primary" disabled={busy} onClick={remove}>
          {busy ? <><span className="navSpin" aria-hidden /> Elimino…</> : "Sì, elimina"}
        </button>
        <button type="button" className="secondary" disabled={busy} onClick={() => setConfirming(false)}>Annulla</button>
      </div>
    </div>
  );
}
