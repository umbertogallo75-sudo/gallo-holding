"use client";

import { FormEvent, useEffect, useRef, useState, useSyncExternalStore } from "react";
import { Speak } from "@/components/Speak";
import { inStoreApp } from "@/lib/shell";

type Mistake = { incorrect:string; correct:string; note?:string };
type Expression = { expression:string; meaning?:string };
type Msg = { role:"user"|"assistant"; content:string; correction?:string; mistake?:Mistake; expression?:Expression };

/** Server said no (4xx/5xx) — very different from "the network dropped". */
class HttpError extends Error {
  status: number;
  constructor(status: number, message: string) {
    super(message);
    this.status = status;
  }
}

function subscribeToNetwork(callback: () => void) {
  window.addEventListener("online", callback);
  window.addEventListener("offline", callback);
  return () => {
    window.removeEventListener("online", callback);
    window.removeEventListener("offline", callback);
  };
}

const openers: Record<string,string> = {
  "text-2": "Ask me one quick English question. I only have two minutes.",
  "text-5": "Start a short natural English conversation with me.",
  guided: "Start today's guided Business English session using my learning memory.",
  surprise: "Choose the most useful English exercise for me right now and start immediately.",
  buddy: "Send me your quick question for this moment of the day.",
  essentials: "Teach me essential everyday English. Pick a real situation — like a restaurant, airport or hotel — and start the role-play.",
  zero: "Start today's Start-from-Zero guided micro-lesson. Teach me one useful sentence pattern step by step.",
  mission: "Give me a real-life mission I haven't completed yet and role-play it with me.",
  listen: "Start a listening dictation session. Give me the first sentence to transcribe.",
  review: "Start my rapid review quiz on the items I need to practice.",
  warmup: "I have a meeting or call soon. Warm me up: ask me what it's about.",
  shadow: "Start a shadowing drill. Give me the first sentence to listen to and repeat aloud.",
  briefing: "Give me today's short business read and then ask me about it.",
  levelcheck: "Let's find my starting level with a short friendly chat. Start easy.",
};

/** Hidden dictation sentence: audio-first, text revealed only on demand. */
function DictationCard({ sentence }: { sentence: string }) {
  const [revealed, setRevealed] = useState(false);
  // Alternate UK/US voices deterministically so the ear trains on both accents.
  let hash = 0;
  for (let i = 0; i < sentence.length; i++) hash = (hash * 31 + sentence.charCodeAt(i)) | 0;
  const uk = Math.abs(hash) % 2 === 0;
  return (
    <span className="dictation">
      <span className="dictationLabel">🎧 Listen and type what you hear <span style={{ fontWeight: 400 }}>{uk ? "🇬🇧" : "🇺🇸"}</span> <span className="itHint" style={{ display: "block", fontStyle: "normal" }}>Ascolta e scrivi qui sotto quello che senti (accento {uk ? "britannico" : "americano"})</span></span>
      <span style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 8 }}>
        <Speak text={sentence} compact lang={uk ? "en-GB" : "en-US"} />
        <span className="dictationText">{revealed ? sentence : "• • • • • •"}</span>
      </span>
      {!revealed ? (
        <button type="button" className="pill" style={{ marginTop: 10 }} onClick={() => setRevealed(true)}>👁 Show text · Mostra testo</button>
      ) : null}
    </span>
  );
}

/** Splits out a ⟦dictation⟧ segment so it can be hidden and played as audio. */
function AssistantBubble({ content }: { content: string }) {
  const match = content.match(/⟦([\s\S]*?)⟧/);
  if (!match || match.index === undefined) {
    return <>{content}<span style={{ display: "block", marginTop: 6 }}><Speak text={content} compact /></span></>;
  }
  const before = content.slice(0, match.index).trim();
  const after = content.slice(match.index + match[0].length).trim();
  return (
    <>
      {before}
      <DictationCard sentence={match[1].trim()} />
      {after}
      {before ? <span style={{ display: "block", marginTop: 6 }}><Speak text={before} compact /></span> : null}
    </>
  );
}

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
  const [blocked, setBlocked] = useState<{ kind: "plan" | "login"; text: string }>();
  const started = useRef(Boolean(initialQuestion));
  const opener = useRef(initialQuestion);
  const failedRef = useRef<string>(undefined);
  failedRef.current = failedMessage;

  // Weak-network safety net: live offline flag + automatic re-send of the
  // pending message the moment the connection returns.
  const offline = useSyncExternalStore(subscribeToNetwork, () => !navigator.onLine, () => false);
  // Store-app wrappers show no purchase wording (reader-app rules).
  const embedded = useSyncExternalStore(() => () => {}, inStoreApp, () => false);
  useEffect(() => {
    const backOnline = () => {
      const pending = failedRef.current;
      if (pending) {
        setFailedMessage(undefined);
        void send(pending, false);
      }
    };
    window.addEventListener("online", backOnline);
    return () => window.removeEventListener("online", backOnline);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- listener binds once; pending message travels via ref
  }, []);

  async function coachCall(message: string) {
    const r = await fetch("/api/coach", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message, mode, sessionId, opener: sessionId ? undefined : opener.current }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status, data.error || "Coach unavailable");
    return data;
  }

  async function send(raw: string, visible = true) {
    const message = raw.trim(); if (!message || loading) return;
    if (visible) setMessages(v => [...v, { role:"user", content:message }]);
    setText(""); setSuggestions([]); setFailedMessage(undefined);
    // No network right now: park the message — the online listener re-sends it.
    if (!navigator.onLine) { setFailedMessage(message); return; }
    setLoading(true);
    try {
      let data;
      try {
        data = await coachCall(message);
      } catch (error) {
        // A server verdict (paywall, expired session) won't change on retry;
        // only network drops deserve the quiet second attempt.
        if (error instanceof HttpError) throw error;
        await new Promise(resolve => setTimeout(resolve, 1200));
        data = await coachCall(message);
      }
      setSessionId(data.sessionId);
      setMessages(v => [...v, { role:"assistant", content:data.reply, correction:data.correction, mistake:data.mistake, expression:data.expression }]);
    } catch (error) {
      if (error instanceof HttpError && error.status === 402) {
        setBlocked({ kind: "plan", text: error.message });
      } else if (error instanceof HttpError && error.status === 401) {
        setBlocked({ kind: "login", text: "La sessione è scaduta — accedi di nuovo per continuare." });
      } else {
        setFailedMessage(message);
      }
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
    {offline && (
      <div className="offlineBar" role="status">📡 Sei offline — appena torna la rete riprendo io <span style={{ opacity: .75 }}>· You&rsquo;re offline</span></div>
    )}
    <div className="chat">
      {messages.map((m,i) => <div key={i} style={{display:"contents"}}>
        <div className={`bubble ${m.role === "assistant" ? "ai" : "user"}`}>
          {m.role === "assistant" ? <AssistantBubble content={m.content} /> : m.content}
        </div>
        {m.mistake ? (
          <div className="fixCard">
            <div className="fixRow fixBad"><span aria-hidden="true">✗</span><span>{m.mistake.incorrect}</span></div>
            <div className="fixRow fixGood">
              <span aria-hidden="true">✓</span>
              <span>{m.mistake.correct}</span>
              <Speak text={m.mistake.correct} compact />
            </div>
            {m.mistake.note ? <p className="fixNote">{m.mistake.note}</p> : null}
          </div>
        ) : m.correction ? (
          <div className="fixCard">
            <div className="fixRow fixGood"><span aria-hidden="true">✓</span><span>{m.correction}</span></div>
          </div>
        ) : null}
        {m.expression ? (
          <div className="keepCard">
            <span className="keepTag">Da tenere</span>
            <div className="keepRow"><strong>{m.expression.expression}</strong><Speak text={m.expression.expression} compact /></div>
            {m.expression.meaning ? <p className="keepNote">{m.expression.meaning}</p> : null}
          </div>
        ) : null}
      </div>)}
      {loading && <div className="bubble ai muted">Sam is thinking…</div>}
      {blocked && !loading && (
        <div className="bubble ai">
          {blocked.kind === "plan" ? "🔓 " : "🔑 "}{blocked.text}
          <a className="primary" style={{display:"inline-block", marginTop:10, padding:"9px 18px", minWidth:0, textDecoration:"none"}} href={blocked.kind === "plan" ? "/abbonamento" : "/login"}>
            {blocked.kind === "plan" ? (embedded ? "Vai ad Abbonamento" : "Attiva un piano o inserisci il codice") : "Vai al login"}
          </a>
        </div>
      )}
      {failedMessage && !loading && (
        <div className="bubble ai">
          ⚠️ {offline ? "Sei offline — la tua risposta è al sicuro." : "Problema di connessione — la tua risposta non è andata persa."}
          <span className="itHint" style={{display:"block"}}>{offline ? "Appena torna la rete la invio automaticamente." : "Riprovo appena tocchi il pulsante — o da solo appena torna la rete."}</span>
          {!offline ? <button type="button" className="primary" style={{marginTop:8, padding:"8px 16px", minWidth:0}} onClick={retry}>Riprova</button> : null}
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
    <form className="composer" onSubmit={submit}><textarea aria-label="Your answer" placeholder="Answer in English…" value={text} onChange={e=>setText(e.target.value)} /><button className="primary" disabled={loading || !text.trim()} aria-label="Invia">{loading ? <span className="navSpin" aria-hidden /> : "Invia"}</button></form>
  </>;
}
