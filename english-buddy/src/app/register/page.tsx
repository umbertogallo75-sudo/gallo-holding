"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function RegisterPage() {
  const [inviteCode, setInviteCode] = useState("");
  const [name, setName] = useState("");
  const [code, setCode] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const router = useRouter();

  async function submit(e: FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    const response = await fetch("/api/auth/register", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ inviteCode, name, code }),
    });
    const data = await response.json().catch(() => ({}));
    setLoading(false);
    if (!response.ok) return setError(data.error || "Registration failed");
    router.push("/");
    router.refresh();
  }

  return (
    <main className="shell authWrap">
      <section className="authCard">
        <div className="brand">English Buddy</div>
        <div className="hero">
          <div className="kicker">Invite only</div>
          <h1>Create your access.</h1>
          <p className="muted">Enter the invite code you received, then choose your personal access code — you will use it to log in.</p>
        </div>
        <form onSubmit={submit}>
          <input className="field" required placeholder="Invite code" value={inviteCode} onChange={(e) => setInviteCode(e.target.value)} />
          <input className="field" required placeholder="Your first name" value={name} onChange={(e) => setName(e.target.value)} />
          <input className="field" type="password" autoComplete="new-password" required minLength={8} placeholder="Choose a personal access code (min 8 characters)" value={code} onChange={(e) => setCode(e.target.value)} />
          {error ? <div className="notice" style={{ marginBottom: 8 }}>{error}</div> : null}
          <button className="primary full" disabled={loading}>{loading ? "Creating…" : "Create my access"}</button>
        </form>
        <p className="muted" style={{ marginTop: 14, fontSize: 13 }}>
          Already have a code? <a href="/login" style={{ textDecoration: "underline" }}>Log in</a>
        </p>
      </section>
    </main>
  );
}
