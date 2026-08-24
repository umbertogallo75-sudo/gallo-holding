"use client";

import { FormEvent, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";

export function ResetForm() {
  const token = useSearchParams().get("token") ?? "";
  const [code, setCode] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    if (code !== confirm) return setError("Le due password non coincidono.");
    setLoading(true); setError("");
    const response = await fetch("/api/auth/reset", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token, code }),
    }).catch(() => null);
    const data = await response?.json().catch(() => ({}));
    setLoading(false);
    if (!response?.ok) return setError(data?.error || "Something went wrong. Request a new link.");
    router.push("/home");
    router.refresh();
  }

  if (!token) {
    return <div className="notice">Link non valido: richiedine uno nuovo dalla pagina di accesso.</div>;
  }

  return (
    <form onSubmit={submit}>
      <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="Nuova password (minimo 8 caratteri)" value={code} onChange={(e) => setCode(e.target.value)} />
      <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="Ripeti la nuova password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      {error ? <div className="notice" style={{ marginBottom: 8 }}>{error}</div> : null}
      <button className="primary full" disabled={loading}>{loading ? "Saving…" : "Save and enter · Salva ed entra"}</button>
    </form>
  );
}
