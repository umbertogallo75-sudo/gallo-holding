"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ code }) });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error || "Login failed");
    router.push("/"); router.refresh();
  }

  return <main className="shell authWrap"><section className="authCard">
    <div className="brand">English Buddy</div>
    <div className="hero"><div className="kicker">Private AI coach</div><h1>English that fits your day.</h1><p className="muted">This first version is private. Enter your personal access code.</p></div>
    <form onSubmit={submit}><input className="field" type="password" autoComplete="current-password" required placeholder="Personal access code" value={code} onChange={e=>setCode(e.target.value)} />
    {error ? <div className="notice" style={{marginBottom:8}}>{error}</div> : null}
    <button className="primary full" disabled={loading}>{loading ? "Opening…" : "Open English Buddy"}</button></form>
  </section></main>;
}
