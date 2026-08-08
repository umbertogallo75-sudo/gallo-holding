"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Msg = { role:"user"|"assistant"; content:string; correction?:string };

const openers: Record<string,string> = {
  "text-2": "Ask me one quick English question. I only have two minutes.",
  "text-5": "Start a short natural English conversation with me.",
  guided: "Start today's guided Business English session using my learning memory.",
  surprise: "Choose the most useful English exercise for me right now and start immediately.",
  buddy: "Send me your Buddy question for this moment of the day.",
  essentials: "Teach me essential everyday English. Pick a real situation — like a restaurant, airport or hotel — and start the role-play.",
};

export function BuddyChat({ mode, initialQuestion }: { mode:string; initialQuestion?:string }) {
  const [messages, setMessages] = useState<Msg[]>(
    initialQuestion ? [{ role:"assistant", content:initialQuestion }] : []
  );
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const started = useRef(Boolean(initialQuestion));
  const opener = useRef(initialQuestion);

  async function send(raw: string, visible = true) {
    const message = raw.trim(); if (!message || loading) return;
    if (visible) setMessages(v => [...v, { role:"user", content:message }]);
    setText(""); setLoading(true);
    try {
      const r = await fetch("/api/coach", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message, mode, sessionId, opener: sessionId ? undefined : opener.current }) });
      const data = await r.json();
      if (!r.ok) throw new Error(data.error || "Coach unavailable");
      setSessionId(data.sessionId);
      setMessages(v => [...v, { role:"assistant", content:data.reply, correction:data.correction }]);
    } catch (e) { setMessages(v => [...v, { role:"assistant", content:`I couldn't connect to the coach. ${e instanceof Error ? e.message : ""}` }]); }
    finally { setLoading(false); }
  }

  useEffect(() => {
    if (!started.current) { started.current = true; void send(openers[mode] || openers["text-5"], false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opener fires exactly once per mount
  }, [mode]);
  function submit(e: FormEvent) { e.preventDefault(); void send(text); }

  return <>
    <div className="chat">
      {messages.map((m,i) => <div key={i} style={{display:"contents"}}><div className={`bubble ${m.role === "assistant" ? "ai" : "user"}`}>{m.content}</div>{m.correction ? <div className="correction">Better: {m.correction}</div> : null}</div>)}
      {loading && <div className="bubble ai muted">Thinking…</div>}
    </div>
    <form className="composer" onSubmit={submit}><textarea aria-label="Your answer" placeholder="Answer in English…" value={text} onChange={e=>setText(e.target.value)} /><button className="primary" disabled={loading || !text.trim()}>Send</button></form>
  </>;
}
