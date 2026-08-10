"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

const STATUSES = ["ACTIVE", "SUSPENDED", "BLOCKED", "TERMINATED", "REVIEW_REQUIRED"];

export function PartnerAdminActions({ partnerId, rate, status, canPayout }: { partnerId: string; rate: number; status: string; canPayout: boolean }) {
  const [newRate, setNewRate] = useState(String(rate));
  const [msg, setMsg] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  async function call(body: Record<string, unknown>, ok: string) {
    setBusy(true);
    setMsg("");
    try {
      const r = await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(data.error || "Errore");
      setMsg(ok);
      router.refresh();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Errore");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "center" }}>
      <input className="field" style={{ margin: 0, width: 64, padding: "6px 8px", fontSize: 13 }} value={newRate} onChange={(e) => setNewRate(e.target.value)} />
      <button className="pill" disabled={busy} onClick={() => call({ action: "partnerrate", partnerId, rate: Number(newRate.replace(",", ".")) }, "% aggiornata ✓")}>% </button>
      <select className="field" style={{ margin: 0, width: "auto", padding: "6px 8px", fontSize: 13 }} defaultValue={status} disabled={busy}
        onChange={(e) => call({ action: "partnerstatus", partnerId, status: e.target.value }, "Stato aggiornato ✓")}>
        {STATUSES.map((s) => <option key={s} value={s}>{s}</option>)}
      </select>
      <button className="pill" disabled={busy || !canPayout} title={canPayout ? "Crea il pagamento delle provvigioni disponibili" : "Sotto il minimo o dati di incasso mancanti"}
        onClick={() => { if (window.confirm("Creare il pagamento delle provvigioni disponibili di questo partner?")) void call({ action: "payoutcreate", partnerId }, "Pagamento creato ✓"); }}>
        💸 Crea pagamento
      </button>
      {msg ? <span className="itHint">{msg}</span> : null}
    </div>
  );
}

export function MarkPaidButton({ payoutId }: { payoutId: string }) {
  const [busy, setBusy] = useState(false);
  const router = useRouter();
  return (
    <button className="pill" disabled={busy}
      onClick={async () => {
        const reference = window.prompt("Riferimento del bonifico/pagamento (opzionale):") ?? undefined;
        setBusy(true);
        await fetch("/api/admin", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "payoutpaid", payoutId, reference }) });
        setBusy(false);
        router.refresh();
      }}>
      ✓ Segna pagato
    </button>
  );
}
