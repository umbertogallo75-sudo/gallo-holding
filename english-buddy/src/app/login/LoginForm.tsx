"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";
import { WelcomeIntro } from "@/components/WelcomeIntro";

export function LoginForm({ oauth, oauthError }: { oauth: React.ReactNode; oauthError?: string | null }) {
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

  return <main className="shell authWrap"><WelcomeIntro /><section className="authCard">
    <div className="brand">ExecLingo</div>
    <div className="hero"><div className="kicker">Private AI coach</div><h1>English that fits your day.</h1><p className="muted">This first version is private. Enter your personal access code.</p><p className="itHint">Inserisci il tuo codice personale di accesso per entrare.</p></div>
    {oauthError ? <div className="notice" style={{marginBottom:8}}>⚠️ {oauthError}</div> : null}
    {oauth}<form onSubmit={submit}><input className="field" type="password" autoComplete="current-password" required placeholder="Personal access code" value={code} onChange={e=>setCode(e.target.value)} />
    <p className="itHint" style={{margin:"0 4px 6px"}}>Il tuo codice segreto di accesso</p>
    {error ? <div className="notice" style={{marginBottom:8}}>{error}</div> : null}
    <button className="primary full" disabled={loading}>{loading ? "Opening…" : "Open ExecLingo"}</button>
    <p className="itHint" style={{margin:"6px 4px", textAlign:"center"}}>Apri ExecLingo</p></form>
    <p style={{textAlign:"center", margin:"10px 0 0"}}><a href="/forgot" className="itHint" style={{textDecoration:"underline", fontSize:14.5}}>Forgot your code? · Hai dimenticato il codice? Recuperalo qui</a></p>
    <div style={{display:"flex", alignItems:"center", gap:10, margin:"18px 0 12px"}}>
      <span style={{flex:1, height:1, background:"var(--line)"}} />
      <span className="muted" style={{fontSize:12}}>or · oppure</span>
      <span style={{flex:1, height:1, background:"var(--line)"}} />
    </div>
    <a href="/register" className="secondary full" style={{display:"block", textAlign:"center", fontWeight:750, padding:"14px", borderWidth:2}}>
      🆕 I&rsquo;m new — Create my access
      <span className="itHint" style={{display:"block", fontWeight:400, marginTop:2}}>Non hai ancora un codice? Registrati qui: è gratis, bastano nome, email e un codice a tua scelta</span>
    </a>
  </section></main>;
}
