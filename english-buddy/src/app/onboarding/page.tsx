"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";

export default function OnboardingPage() {
  const [name,setName]=useState(""); const [level,setLevel]=useState("A2"); const [goal,setGoal]=useState("Business calls and meetings"); const [loading,setLoading]=useState(false); const router=useRouter();
  async function save(){
    setLoading(true);
    const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
    const r = await fetch("/api/onboarding", {method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({name:name||"Friend", level, goal, timezone})});
    setLoading(false);
    if(!r.ok) return router.push("/login");
    router.push("/home"); router.refresh();
  }
  return <main className="shell authWrap"><section className="authCard"><div className="brand">English Buddy</div><div className="hero"><div className="kicker">60-second setup</div><h1>Make it yours.</h1></div>
  <input className="field" placeholder="First name" value={name} onChange={e=>setName(e.target.value)} />
  <select className="field" value={level} onChange={e=>setLevel(e.target.value)}><option>A1</option><option>A2</option><option>B1</option><option>B2</option><option>C1</option></select>
  <input className="field" value={goal} onChange={e=>setGoal(e.target.value)} />
  <button className="primary full" disabled={loading} onClick={save}>{loading ? "Saving…" : "Start"}</button></section></main>;
}
