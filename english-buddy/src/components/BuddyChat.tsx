"use client";

import { FormEvent, useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";
import dynamic from "next/dynamic";
import { Speak } from "@/components/Speak";
import { RememberPhrase } from "@/components/RememberPhrase";
import { SessionRecap } from "@/components/SessionRecap";
import { shouldWrapUp, type SessionFacts, type SessionScore } from "@/lib/learning/session-score";
import { EnablePush } from "@/components/EnablePush";
import { track } from "@/lib/track-client";
import { inStoreApp } from "@/lib/shell";
import { openerFor, RESUME_PROMPT, TOPICS } from "@/lib/learning/openers";

/**
 * The microphone, loaded only when somebody reaches for it.
 *
 * It is a WebRTC client with a realtime transport inside it — a large thing
 * to hand to every person who opened a chat to type. Off the first load, and
 * fetched on the tap that opens it.
 */
const VoiceClient = dynamic(() => import("@/app/voice/VoiceClient").then((m) => m.VoiceClient), {
  ssr: false,
  loading: () => <p className="muted" style={{ padding: 24, textAlign: "center" }}>Preparo il microfono…</p>,
});

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



/** Whether the voice call still needs introducing on this device. */
const VOICE_KNOWN_KEY = "execlingo-voice-known";
function voiceIsKnown(): boolean {
  try { return localStorage.getItem(VOICE_KNOWN_KEY) === "1"; } catch { return true; }
}
function subscribeToStorage(callback: () => void) {
  window.addEventListener("storage", callback);
  return () => window.removeEventListener("storage", callback);
}

/** Hidden dictation sentence: audio-first, text revealed only on demand. */
function DictationCard({ sentence }: { sentence: string }) {
  const [revealed, setRevealed] = useState(false);
  // Alternate UK/US voices deterministically so the ear trains on both accents.
  let hash = 0;
  for (let i = 0; i < sentence.length; i++) hash = (hash * 31 + sentence.charCodeAt(i)) | 0;
  const uk = Math.abs(hash) % 2 === 0;
  return (
    <span className="dictation">
      <span className="dictationLabel">🎧 Ascolta e scrivi <span style={{ fontWeight: 400 }}>{uk ? "🇬🇧" : "🇺🇸"}</span> <span className="dictationHint">Ascolta e scrivi qui sotto quello che senti (accento {uk ? "britannico" : "americano"})</span></span>
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

export function BuddyChat({ mode, initialQuestion, first = false, doc, reopen }: { mode:string; initialQuestion?:string; first?:boolean; doc?:string; reopen?:string }) {
  const [messages, setMessages] = useState<Msg[]>(
    initialQuestion ? [{ role:"assistant", content:initialQuestion }] : []
  );
  const [text, setText] = useState("");
  const [loading, setLoading] = useState(false);
  const [sessionId, setSessionId] = useState<string>();
  /** How many turns have been sent from here, so a late reload knows to stand down. */
  const sends = useRef(0);
  /** The microphone, open on top of this conversation rather than instead of it. */
  const [calling, setCalling] = useState(false);
  // Which session the call is writing into: its own if the chat had not
  // started one yet, otherwise this one.
  const callSession = useRef<string | undefined>(undefined);
  const [suggestions, setSuggestions] = useState<string[]>([]);
  const [suggesting, setSuggesting] = useState(false);
  const [failedMessage, setFailedMessage] = useState<string>();
  const [blocked, setBlocked] = useState<{ kind: "plan" | "login"; text: string }>();
  /**
   * A conversation you were in the middle of. Everything said was always
   * stored; what was missing was anywhere to keep the fact that you were
   * still in it, so a phone call meant coming back to a blank screen.
   */
  const [resumable, setResumable] = useState<{ id: string; exchanges: number; lastAt: string; preview?: string } | null>(null);
  const [recap, setRecap] = useState<{ score: SessionScore; facts: SessionFacts } | null>(null);
  const [closing, setClosing] = useState(false);
  /** Offered once per session: a wrap-up is a suggestion, never a wall. */
  const [wrapDismissed, setWrapDismissed] = useState(false);
  const started = useRef(Boolean(initialQuestion));
  const opener = useRef(initialQuestion);
  const failedRef = useRef<string>(undefined);
  /** Typed while the coach was still answering; sent as soon as he lands. */
  const queued = useRef<string>(undefined);
  const composerRef = useRef<HTMLFormElement | null>(null);
  /**
   * The conversation stays in view.
   *
   * There was no scroll handling here at all, and it showed worst exactly
   * where it mattered: resuming reloaded twenty messages at once and left the
   * page at the top, so what you saw was the FIRST question of the old
   * conversation while Sam's new line sat below the fold. A tester reported it
   * as "riprendi riparte dalla prima domanda" — he was reading the top of his
   * own transcript.
   */
  const endRef = useRef<HTMLDivElement | null>(null);
  const follow = useRef(true);
  failedRef.current = failedMessage;

  // Weak-network safety net: live offline flag + automatic re-send of the
  // pending message the moment the connection returns.
  const offline = useSyncExternalStore(subscribeToNetwork, () => !navigator.onLine, () => false);
  // Store-app wrappers show no purchase wording (reader-app rules).
  const embedded = useSyncExternalStore(() => () => {}, inStoreApp, () => false);
  // The microphone beside the send button reads as dictation, because that is
  // what it means everywhere else. Nobody found the spoken conversation until
  // something said so in words.
  const knowsVoice = useSyncExternalStore(subscribeToStorage, voiceIsKnown, () => true);
  const [inviteHidden, setInviteHidden] = useState(false);
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

  async function coachCall(message: string, opening = false) {
    const r = await fetch("/api/coach", { method:"POST", headers:{"Content-Type":"application/json"}, body:JSON.stringify({ message, mode, sessionId, doc, opening, opener: sessionId ? undefined : opener.current }) });
    const data = await r.json().catch(() => ({}));
    if (!r.ok) throw new HttpError(r.status, data.error || "Coach unavailable");
    return data;
  }

  async function send(raw: string, visible = true, opening = false) {
    const message = raw.trim();
    if (!message) return;
    sends.current += 1;
    // Sam is still composing his opening line. Refusing the message here is
    // what makes the button feel broken — people type while they wait, which
    // is exactly what we want them doing. Hold it and send it the moment he
    // is done.
    if (loading) {
      queued.current = message;
      setMessages(v => [...v, { role: "user", content: message }]);
      setText("");
      return;
    }
    if (visible) setMessages(v => [...v, { role:"user", content:message }]);
    setText(""); setSuggestions([]); setFailedMessage(undefined);
    // No network right now: park the message — the online listener re-sends it.
    if (!navigator.onLine) { setFailedMessage(message); return; }
    setLoading(true);
    try {
      let data;
      try {
        data = await coachCall(message, opening);
      } catch (error) {
        // A server verdict (paywall, expired session) won't change on retry;
        // only network drops deserve the quiet second attempt.
        if (error instanceof HttpError) throw error;
        await new Promise(resolve => setTimeout(resolve, 1200));
        data = await coachCall(message, opening);
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
    finally {
      setLoading(false);
      const waiting = queued.current;
      if (waiting) { queued.current = undefined; void send(waiting, false); }
    }
  }

  /**
   * Puts a stored conversation on the screen, without saying anything.
   *
   * Two callers want different things from here. Resuming needs the coach to
   * speak afterwards; coming back from the microphone does not — the lines
   * were just spoken out loud, and having Sam greet you about them would be
   * the app pretending it had not been listening.
   */
  const load = useCallback(async (id: string): Promise<boolean> => {
    try {
      const r = await fetch(`/api/sessioni?id=${encodeURIComponent(id)}`);
      const data = await r.json();
      if (!r.ok || !Array.isArray(data.transcript)) return false;
      setMessages(
        (data.transcript as { role: string; content: string }[]).map((line) => ({
          role: line.role === "user" ? ("user" as const) : ("assistant" as const),
          content: line.content,
        }))
      );
      setSessionId(id);
      started.current = true;
      // Whatever the page was showing, a conversation just reloaded belongs at
      // its end: that is the part nobody has read yet.
      follow.current = true;
      return true;
    } catch {
      return false;
    }
  }, []);

  /** Picks the conversation back up exactly where it stopped. */
  async function resume(id: string) {
    setResumable(null);
    if (await load(id)) {
      track("session_resumed", { where: mode.slice(0, 20) });
      // And then he says something. Restoring the messages alone left the
      // learner looking at an old conversation with no sign that the coach
      // still had it — which is what "non la riprende davvero" meant.
      void send(RESUME_PROMPT, false);
    }
    // Otherwise the conversation simply starts fresh, which is where it was.
  }

  /**
   * Back from the microphone, into the same conversation.
   *
   * The spoken lines were written to the session as they were said, so the
   * chat only has to read them back. It says nothing of its own: the person
   * has just been talking to Sam, and a fresh greeting would undo the whole
   * point of keeping it one conversation.
   */
  function closeCall() {
    setCalling(false);
    const id = callSession.current ?? sessionId;
    if (!id) return;
    void load(id);
    // And once more in a moment. The spoken lines are written in batches
    // eight seconds apart, and the last batch leaves on the way out — so the
    // transcript read a fraction of a second later is missing the end of the
    // conversation. Skipped if the person has meanwhile written something:
    // their own turn outranks a tidier transcript.
    const mark = sends.current;
    window.setTimeout(() => { if (sends.current === mark) void load(id); }, 2500);
  }

  /** Ends it on purpose, and says how it went. */
  async function finish() {
    if (!sessionId || closing) return;
    setClosing(true);
    try {
      const r = await fetch("/api/sessioni", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "close", sessionId }),
      });
      const data = await r.json();
      if (r.ok && data.score) setRecap({ score: data.score, facts: data.facts });
      track("session_closed", { where: mode.slice(0, 20) });
    } catch {
      // Nothing to show, but the session is over as far as the person cares.
    } finally {
      setClosing(false);
    }
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

  /**
   * What happens on arrival, in the right order.
   *
   * Sam used to open a brand-new conversation the instant the screen
   * appeared, and the offer to resume the old one arrived a moment later —
   * so by the time anybody could accept it, a new session existed with the
   * usual greeting in it, and accepting only swapped the messages on screen.
   * That is why "riprendi" did not feel like resuming anything. The question
   * is now asked before the conversation starts, not alongside it.
   */
  useEffect(() => {
    if (started.current) return;
    started.current = true;
    void (async () => {
      // Arrived from the archive with a conversation already chosen: no offer
      // to make, no new conversation to open — this is the one they picked.
      if (reopen) {
        await resume(reopen);
        return;
      }
      // An entry test measures where somebody is today; continuing an old
      // conversation into it would measure the old one.
      if (!initialQuestion && mode !== "levelcheck") {
        try {
          // Written only: a conversation you had out loud is not something to
          // reopen as text.
          const response = await fetch("/api/sessioni?kind=text");
          const data = await response.json();
          if (response.ok && data.resumable) {
            setResumable(data.resumable);
            return;
          }
        } catch {
          // No offer, no harm: the new conversation starts as it always did.
        }
      }
      void send(openerFor(mode), false, true);
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps -- opener fires exactly once per mount
  }, [mode]);

  /**
   * The bar tells the conversation how much room it is taking.
   *
   * Its height is not a constant: the invitation to speak sits on its own row
   * until somebody has used the microphone, and the textarea grows as a long
   * answer is typed. The space under the conversation was a fixed guess at
   * that height, and it guessed low — so the newest message was hidden behind
   * the bar, which is precisely the message somebody is waiting to read.
   */
  /**
   * Instant and not smooth, deliberately: a smooth scroll is still travelling
   * when the next message lands, and on the way it fires scroll events short
   * of the bottom, which the handler below would read as the reader having
   * deliberately scrolled away.
   */
  useEffect(() => {
    if (!follow.current) return;
    endRef.current?.scrollIntoView({ block: "end" });
  }, [messages, loading, recap, resumable]);

  /** Reading something further up is a decision: stop dragging them back. */
  useEffect(() => {
    const onScroll = () => {
      const gap = document.documentElement.scrollHeight - window.scrollY - window.innerHeight;
      follow.current = gap < 180;
    };
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  useEffect(() => {
    const bar = composerRef.current;
    if (!bar) return;
    const publish = () => {
      document.documentElement.style.setProperty("--composerH", `${Math.round(bar.getBoundingClientRect().height)}px`);
    };
    publish();
    const observer = typeof ResizeObserver === "undefined" ? null : new ResizeObserver(publish);
    observer?.observe(bar);
    window.addEventListener("resize", publish);
    return () => {
      observer?.disconnect();
      window.removeEventListener("resize", publish);
      document.documentElement.style.removeProperty("--composerH");
    };
  }, []);
  function submit(e: FormEvent) { e.preventDefault(); void send(text); }

  /**
   * The microphone opens on top of the conversation, not instead of it.
   *
   * It was a link to another page, and a page change is the part that made it
   * feel like a different product: you tapped it in the middle of a sentence
   * and landed somewhere else, with its own hero, its own offer to resume
   * something unrelated, and its own back button to find. A tester wrote it
   * down exactly — "mi hai appena detto che dovevamo ripartire da che faccio
   * a lavoro e poi ripartiamo da qua? Non c'è logica".
   *
   * Now it is one tap and the same conversation: the call writes its lines
   * into this session, and closing it puts them in the transcript you were
   * already reading. Writing and speaking stop being two products.
   */
  function openCall() {
    callSession.current = sessionId;
    setCalling(true);
    track("voice_in_chat", { where: mode.slice(0, 20) });
  }

  // While the call is up, the page underneath must not move: a fixed layer
  // over a scrollable body is how a finger ends up scrolling the wrong thing.
  useEffect(() => {
    if (!calling) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [calling]);

  const canAskHelp = !loading && messages.some(m => m.role === "assistant");
  /** Sam has spoken, the person has not, and the box is still empty. */
  const blank = !loading && !text && messages.some(m => m.role === "assistant") && !messages.some(m => m.role === "user");
  // The end of the very first session: three answers is enough to have felt
  // what the coach does, which is the only moment the notification request
  // means anything. Asked before that, it is a permission dialog from a
  // stranger.
  const exchanges = messages.filter(m => m.role === "user").length;
  const sessionOver = first && exchanges >= 3 && !loading;
  const startReported = useRef(false);
  const endReported = useRef(false);
  useEffect(() => {
    if (!first) return;
    if (!startReported.current) { startReported.current = true; track("first_session_started", { where: mode.slice(0, 20) }); }
    if (sessionOver && !endReported.current) { endReported.current = true; track("first_session_done", { where: mode.slice(0, 20) }); }
  }, [first, sessionOver, mode]);

  // Long enough to have done its job. Offered, never enforced: a suggestion to
  // stop is useful, a door that locks is not.
  const wrapUpDue = shouldWrapUp(exchanges) && !wrapDismissed && !recap && !loading && Boolean(sessionId);

  if (recap) {
    return (
      <SessionRecap
        score={recap.score}
        facts={recap.facts}
        onNew={() => {
          setRecap(null);
          setMessages([]);
          setSessionId(undefined);
          setWrapDismissed(false);
          started.current = false;
          void send(openerFor(mode), false, true);
        }}
      />
    );
  }

  return <>
    {offline && (
      <div className="offlineBar" role="status">📡 Sei offline — appena torna la rete riprendo io <span style={{ opacity: .75 }}>· You&rsquo;re offline</span></div>
    )}
    {resumable ? (
      <div className="card" style={{ display: "grid", gap: 8, margin: "0 0 12px" }}>
        <strong style={{ fontSize: 15 }}>Avevi una conversazione a metà</strong>
        <span className="muted" style={{ fontSize: 14 }}>
          {resumable.preview ? <>«{resumable.preview}» · </> : null}
          {resumable.exchanges} {resumable.exchanges === 1 ? "tuo messaggio" : "tuoi messaggi"}. Riprendi da lì, o comincia una conversazione nuova.
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="pill" onClick={() => void resume(resumable.id)}>↩︎ Riprendi</button>
          <button
            type="button"
            className="pill"
            onClick={() => { setResumable(null); void send(openerFor(mode), false, true); }}
          >Inizia una nuova conversazione</button>
        </div>
      </div>
    ) : null}
    {wrapUpDue ? (
      <div className="card" style={{ display: "grid", gap: 8, margin: "0 0 12px" }}>
        <strong style={{ fontSize: 15 }}>Bella sessione — la chiudiamo qui?</strong>
        <span className="muted" style={{ fontSize: 14 }}>
          Hai fatto {exchanges} scambi. Chiudendo vedi il riepilogo e il punteggio; oppure andiamo avanti.
        </span>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button type="button" className="pill" disabled={closing} onClick={() => void finish()}>🏁 Chiudi e vedi il riepilogo</button>
          <button type="button" className="pill" onClick={() => setWrapDismissed(true)}>Continuiamo</button>
        </div>
      </div>
    ) : null}
    <div className="chat">
      {messages.map((m,i) => <div key={i} style={{display:"contents"}}>
        <div className={`bubble ${m.role === "assistant" ? "ai" : "user"}`}>
          {m.role === "assistant" ? <AssistantBubble content={m.content} /> : m.content}
          {/* Anything Sam said can be kept. The sentence somebody has been
              looking for is usually one he has just used in passing. */}
          {m.role === "assistant" ? (
            <span className="bubbleTools"><RememberPhrase text={m.content} from="chat" /></span>
          ) : null}
        </div>
        {m.mistake ? (
          <div className="fixCard">
            <div className="fixRow fixBad"><span aria-hidden="true">✗</span><span>{m.mistake.incorrect}</span></div>
            <div className="fixRow fixGood">
              <span aria-hidden="true">✓</span>
              <span>{m.mistake.correct}</span>
              <Speak text={m.mistake.correct} compact />
              <RememberPhrase text={m.mistake.correct} from="chat" compact />
            </div>
            {m.mistake.note ? <p className="fixNote">{m.mistake.note}</p> : null}
          </div>
        ) : m.correction ? (
          <div className="fixCard">
            <div className="fixRow fixGood">
              <span aria-hidden="true">✓</span>
              <span>{m.correction}</span>
              <RememberPhrase text={m.correction} from="chat" compact />
            </div>
          </div>
        ) : null}
        {m.expression ? (
          <div className="keepCard">
            <span className="keepTag">Da tenere</span>
            <div className="keepRow">
              <strong>{m.expression.expression}</strong>
              <Speak text={m.expression.expression} compact />
              <RememberPhrase text={m.expression.expression} from="chat" compact />
            </div>
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
          <span className="composerNote">{offline ? "Appena torna la rete la invio automaticamente." : "Riprovo appena tocchi il pulsante — o da solo appena torna la rete."}</span>
          {!offline ? <button type="button" className="primary" style={{marginTop:8, padding:"8px 16px", minWidth:0}} onClick={retry}>Riprova</button> : null}
        </div>
      )}
      {sessionOver ? (
      <section className="card sessionEnd">
        <h2 style={{ marginTop: 0 }}>🎉 Prima sessione fatta.</h2>
        <p className="muted">Hai appena parlato inglese per davvero. Da domani Sam riprende da qui: si ricorda quello che hai detto e quello che ti è mancato.</p>
        <EnablePush />
        <a href="/home" className="secondary full" style={{ display: "block", textAlign: "center", marginTop: 10, textDecoration: "none" }}>Torna alla home</a>
      </section>
    ) : null}
    {/* Three subjects, not three rescue phrases. The phrases were what you
        need when you are stuck in the middle of a conversation; at the start
        you need to know what to talk about. */}
    {blank ? (
      <div className="starters">
        <div className="composerNote" style={{ marginBottom: 2 }}>
          Vuoi parlare di qualcosa in particolare? Scegli, oppure scrivi quello che ti pare.
        </div>
        {TOPICS.map((topic) => (
          <button
            key={topic.key}
            type="button"
            className="starter"
            data-track="chat_topic"
            data-where={topic.key}
            onClick={() => void send(topic.prompt, false)}
          >
            <span aria-hidden>{topic.icon}</span>
            <span className="starterText">
              <strong>{topic.label}</strong>
              <span className="starterHint">{topic.hint}</span>
            </span>
          </button>
        ))}
      </div>
    ) : null}
    {suggestions.length > 0 && (
        <div className="suggestBox">
          <div className="composerNote" style={{ marginBottom: 4 }}>Scegli una risposta, poi puoi modificarla prima di inviare:</div>
          {suggestions.map((s, i) => (
            <button key={i} type="button" className="optionRow" onClick={() => { setText(s); setSuggestions([]); }}>
              <span>{s}</span>
              <span onClick={(e) => e.stopPropagation()}><Speak text={s} compact /></span>
            </button>
          ))}
        </div>
      )}
      <div ref={endRef} aria-hidden />
      {canAskHelp && suggestions.length === 0 && (
        <button type="button" className="helpBtn" disabled={suggesting} onClick={askForHelp}>
          {suggesting ? "Thinking…" : "I don't know what to say · Non so cosa dire"}
        </button>
      )}
    </div>
    {calling ? (
      <div className="callLayer" role="dialog" aria-modal="true" aria-label="Conversazione a voce con Sam">
        <div className="callBar">
          <strong>Stai parlando con Sam</strong>
          <button type="button" className="chip" onClick={closeCall}>← Torna a scrivere</button>
        </div>
        <div className="callBody">
          <VoiceClient
            mode="voice"
            reopen={sessionId}
            question={!sessionId ? initialQuestion?.slice(0, 300) : undefined}
            onSession={(id) => { callSession.current = id; }}
          />
        </div>
      </div>
    ) : null}
    {/* The microphone lives here, next to what you type, instead of behind a
        question asked before the conversation starts. Writing is the default
        because it works in an open office, on a train and in a meeting; the
        voice is one tap away for whoever can use it. */}
    <form className="composer" ref={composerRef} onSubmit={submit}>
      {!knowsVoice && !inviteHidden ? (
        <button type="button" className="voiceInvite" data-track="voice_invite" onClick={openCall}>
          <span className="voiceInviteIcon" aria-hidden>🎙️</span>
          <span className="voiceInviteText">
            <strong>Preferisci parlare?</strong>
            <span>Non è dettatura: Sam ti risponde a voce</span>
          </span>
          <span className="voiceInviteGo" aria-hidden>→</span>
          <span
            className="voiceInviteClose"
            role="button"
            tabIndex={0}
            aria-label="Nascondi"
            onClick={(e) => { e.stopPropagation(); setInviteHidden(true); }}
            onKeyDown={(e) => { if (e.key === "Enter" || e.key === " ") { e.stopPropagation(); setInviteHidden(true); } }}
          >×</span>
        </button>
      ) : null}
      <textarea aria-label="La tua risposta" placeholder="Rispondi in inglese…" value={text} onChange={e=>setText(e.target.value)} />
      <button type="button" className="composerMic" onClick={openCall} aria-label="Rispondi a voce a Sam" title="Rispondi a voce">🎙️<span className="composerMicLabel">Voce</span></button>
      <button className="primary" disabled={!text.trim()} aria-label="Invia">{loading ? <span className="navSpin" aria-hidden /> : "Invia"}</button>
    </form>
  </>;
}
