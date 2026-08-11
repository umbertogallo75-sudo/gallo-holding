"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeIntro } from "@/components/WelcomeIntro";

export function LoginForm({ oauth, oauthError, embedded = false }: { oauth: React.ReactNode; oauthError?: string | null; embedded?: boolean }) {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true); setError("");
    const response = await fetch("/api/auth/login", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ email, password }) });
    const data = await response.json();
    setLoading(false);
    if (!response.ok) return setError(data.error || "Login failed");
    router.push("/"); router.refresh();
  }

  return <main className="shell authWrap"><WelcomeIntro /><section className="authCard">
    <div className="brand">ExecLingo</div>
    <div className="hero"><div className="kicker">Private AI coach</div><h1>English that fits your day.</h1><p className="muted">Log in with your email and password.</p><p className="itHint">Entra con la tua email e la tua password.</p></div>
    {oauthError ? <div className="notice" style={{marginBottom:8}}>⚠️ {oauthError}</div> : null}
    {oauth}<form onSubmit={submit}>
    <input className="field" type="email" autoComplete="email" required placeholder="Email" value={email} onChange={e=>setEmail(e.target.value)} />
    <input className="field" type="password" autoComplete="current-password" required placeholder="Password" value={password} onChange={e=>setPassword(e.target.value)} style={{marginTop:8}} />
    {error ? <div className="notice" style={{margin:"8px 0"}}>{error}</div> : null}
    <button className="primary full" disabled={loading} style={{marginTop:10}}>{loading ? "Opening…" : "Open ExecLingo"}</button>
    <p className="itHint" style={{margin:"6px 4px", textAlign:"center"}}>Apri ExecLingo</p></form>
    <p style={{textAlign:"center", margin:"10px 0 0"}}><a href="/forgot" className="itHint" style={{textDecoration:"underline", fontSize:14.5}}>Forgot your password? · Password dimenticata? Recuperala qui</a></p>
    {embedded ? <p className="itHint" style={{textAlign:"center", margin:"10px 0 0"}}>Ti eri registrato con Google o Apple? Nessun problema: usa &ldquo;Recuperala qui&rdquo; con la stessa email per creare la tua password.</p> : null}
    <div style={{display:"flex", alignItems:"center", gap:10, margin:"18px 0 12px"}}>
      <span style={{flex:1, height:1, background:"var(--line)"}} />
      <span className="muted" style={{fontSize:12}}>or · oppure</span>
      <span style={{flex:1, height:1, background:"var(--line)"}} />
    </div>
    <a href="/register" className="secondary full" style={{display:"block", textAlign:"center", fontWeight:750, padding:"14px", borderWidth:2}}>
      🆕 I&rsquo;m new — Create my access
      <span className="itHint" style={{display:"block", fontWeight:400, marginTop:2}}>Non hai ancora un account? Registrati qui: è gratis, bastano nome, email e una password</span>
    </a>
  </section></main>;
}
