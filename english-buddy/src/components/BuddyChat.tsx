"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { Speak } from "@/components/Speak";

type Msg = { role:"user"|"assistant"; content:string; correction?:string };

const openers: Record<string,string> = {
  "text-2": "Ask me one quick English question. I only have two minutes.",
  "text-5": "Start a short natural English conversation with me.",
  guided: "Start today's guided Business English session using my learning memory.",
  surprise: "Choose the most useful English exercise for me right now and start immediately.",
  buddy: "Send me your Buddy question for this moment of the day.",
  essentials: "Teach me essential everyday English. Pick a real situation — like a restaurant, airport or hotel — and start the role-play.",
  zero: "Start today's Start-from-Zero guided micro-lesson. Teach me one useful sentence pattern step by step.",
  mission: "Give me a real-life mission I haven't completed yet and role-play it with me.",
};

export function BuddyChat({ mode, initialQuestion }: { mode:string; initialQuestion?:string }) {
  const [messages, setMessages] = useState<Msg[]>(
    initialQuestion ? [{ role:"assistant", content:initialQuestion }] : []
  );
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string>();
  const started = useRef(Boolean(initialQuestion));
  const opener = useRef(initialQuestion);

  async function coachCall(message: string) {
    const r = await fetch("/api/coach", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message, mode, sessionId, opener: sessionId ? undefined : opener.current }) });
    const data = await r.json();
    if (!r.ok) throw new Error(data.error || "Coach unavailable");
    return data;
  }

  async function send(raw: string, visible = true) {
    const message = raw.trim(); if (!message || loading) return;
    if (visible) setMessages(v => [...v, { role:"user", content:message }]);
    setText(""); setSuggestions([]); setFailedMessage(undefined); setLoading(true);
    try {
      let data;
      try {
        data = await coachCall(message);
      } catch {
        // Mobile networks drop long requests; one quiet retry fixes most cases.
        await new Promise(resolve => setTimeout(resolve, 1200));
        data = await coachCall(message);
      }
      setSessionId(data.sessionId);
      setMessages(v => [...v, { role:"assistant", content:data.reply, correction:data.correction }]);
    } catch {
      setFailedMessage(message);
    }
    finally { setLoading(false); }
  }

  function retry() {
    const message = failedMessage;
    if (!message) return;
    setFailedMessage(undefined);
    void send(message, false);
  }

  async function askForHelp() {
    const lastAssistant = [...messages].reverse().find(m => m.role === "assistant");
    if (!lastAssistant || suggesting) return;
    setSuggesting(true);
    try {
      const r = await fetch("/api/coach/suggest", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ question: lastAssistant.content.slice(0, 600), mode }) });
      const data = await r.json();
      if (r.ok && Array.isArray(data.suggestions) && data.suggestions.length) setSuggestions(data.suggestions.slice(0, 3));
    } catch { /* silent — the button simply stays available */ }
    finally { setSuggesting(false); }
  }

  useEffect(() => {
    if (!started.current) { started.current = true; void send(openers[mode] || openers["text-5"], false); }
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opener fires exactly once per mount
  }, [mode]);
  function submit(e: FormEvent) { e.preventDefault(); void send(text); }

  const canAskHelp = !loading && messages.some(m => m.role === "assistant");

  return <>
    <div className="chat">
      {messages.map((m,i) => <div key={i} style={{display:"contents"}}>
        <div className={`bubble ${m.role === "assistant" ? "ai" : "user"}`}>
          {m.content}
          {m.role === "assistant" ? <div style={{ marginTop: 6 }}><Speak text={m.content} compact /></div> : null}
        </div>
        {m.correction ? <div className="correction">Better: {m.correction}</div> : null}
      </div>)}
      {loading && <div className="bubble ai muted">Thinking…</div>}
      {failedMessage && !loading && (
        <div className="bubble ai">
          ⚠️ Connection problem — your answer was not lost.
          <span className="itHint" style={{display:"block"}}>Problema di connessione: la tua risposta non è andata persa. Tocca Riprova.</span>
          <button type="button" className="primary" style={{marginTop:8, padding:"8px 16px", minWidth:0}} onClick={retry}>Retry · Riprova</button>
        </div>
      )}
      {suggestions.length > 0 && (
        <div className="suggestBox">
          <div className="itHint" style={{ marginBottom: 4 }}>Scegli una risposta, poi puoi modificarla prima di inviare:</div>
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="optionRow" onClick={() => { setText(s); setSuggestions([]); }}>
              <span>{s}</span>
              <span onClick={(e) => e.stopPropagation()}><Speak text={s} compact /></span>
            </button>
          ))}
        </div>
      )}
      {canAskHelp && suggestions.length === 0 && (
        <button type="button" className="helpBtn" disabled={suggesting} onClick={askForHelp}>
          {suggesting ? "Thinking…" : "I don't know what to say · Non so cosa dire"}
        </button>
      )}
    </div>
    <form className="composer" onSubmit={submit}><textarea aria-label="Your answer" placeholder="Answer in English…" value={text} onChange={e=>setText(e.target.value)} /><button className="primary" disabled={loading || !text.trim()}>Send</button></form>
  </>;
}
