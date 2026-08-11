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
    return <div className="notice">Invalid link. Request a new one from the login page.<span className="itHint" style={{ display: "block" }}>Link non valido: richiedine uno nuovo dalla pagina di accesso.</span></div>;
  }

  return (
    <form onSubmit={submit}>
      <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="New password (min 8 characters)" value={code} onChange={(e) => setCode(e.target.value)} />
      <p className="itHint" style={{ margin: "0 4px 6px" }}>La tua nuova password (minimo 8 caratteri)</p>
      <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="Repeat the new password" value={confirm} onChange={(e) => setConfirm(e.target.value)} />
      <p className="itHint" style={{ margin: "0 4px 6px" }}>Ripeti la nuova password</p>
      {error ? <div className="notice" style={{ marginBottom: 8 }}>{error}</div> : null}
      <button className="primary full" disabled={loading}>{loading ? "Saving…" : "Save and enter · Salva ed entra"}</button>
    </form>
  );
}
