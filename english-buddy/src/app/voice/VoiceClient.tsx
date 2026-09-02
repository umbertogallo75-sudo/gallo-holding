"use client";

import { useEffect, useRef, useState } from "react";
import { useWakeLock } from "@/lib/use-wake-lock";

type Line = { role: "you" | "coach"; text: string };
type Status = "idle" | "connecting" | "live" | "ended" | "error";

/**
 * Whose turn it is, as far as the far end is concerned.
 *
 * On speakerphone the app is at arm's length and silence is ambiguous: a
 * pause while the model composes an answer is indistinguishable from a
 * crash. People waited, then started talking over it to check it was alive,
 * which produced exactly the mess they were trying to diagnose. Saying which
 * of the four things is happening costs one line and removes the guesswork.
 */
type Phase = "waiting" | "hearing" | "thinking" | "speaking";

const PHASE_LABEL: Record<Phase, string> = {
  waiting: "Tocca a te",
  hearing: "Ti ascolto",
  thinking: "Sam sta pensando",
  speaking: "Sam parla",
};

/** If the far end goes quiet without saying why, stop claiming it is thinking. */
const THINKING_TIMEOUT_MS = 12_000;

const MAX_SECONDS = 600; // hard cap per conversation to keep costs sane

/**
 * How long the app waits before deciding an interruption is over for good.
 *
 * A glance at a notification is seconds; a phone call is not. Below this the
 * conversation is picked up where it stopped, above it the call is closed
 * properly rather than left running against a microphone somebody else is
 * using.
 */
const RESUME_GRACE_MS = 45_000;

export function VoiceClient({ mode, hero }: { mode?: string; hero?: React.ReactNode }) {
  const [status, setStatus] = useState<Status>("idle");
  const [error, setError] = useState("");
  const [seconds, setSeconds] = useState(0);
  const [lines, setLines] = useState<Line[]>([]);
  const pcRef = useRef<RTCPeerConnection | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const secondsRef = useRef(0);
  const linesRef = useRef<Line[]>([]);
  const logRef = useRef<HTMLDivElement | null>(null);
  const followRef = useRef(true);
  const [detached, setDetached] = useState(false);
  /** Something took the microphone or the screen: a call, a lock, a swipe. */
  const [interrupted, setInterrupted] = useState<null | "paused" | "lost">(null);
  const [phase, setPhase] = useState<Phase>("waiting");
  const thinkingTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const awaySinceRef = useRef<number | null>(null);
  const statusRef = useRef<Status>("idle");

  useEffect(() => () => { cleanup(false); }, []);

  // A spoken conversation is the one screen nobody touches, so the phone locks
  // and the call dies mid-sentence. Held only while the call is live.
  useWakeLock(status === "live");

  /**
   * What happens when a phone call arrives in the middle of a conversation.
   *
   * The system takes the microphone and puts the page in the background. From
   * inside the app nothing announced this: Sam kept talking to an empty room,
   * the timer kept crediting minutes nobody practised, and the person came
   * back to a screen still claiming to be in conversation.
   *
   * Leaving the page is treated as the same event, because from here it is
   * indistinguishable and the right answer is the same either way: stop the
   * clock at once, and say so.
   */
  useEffect(() => {
    function onVisibility() {
      if (statusRef.current !== "live") return;
      if (document.hidden) {
        awaySinceRef.current = Date.now();
        pauseClock();
        setInterrupted("paused");
        return;
      }
      const away = awaySinceRef.current ? Date.now() - awaySinceRef.current : 0;
      awaySinceRef.current = null;
      // A glance at a notification is picked up where it stopped. A phone
      // call is not: by then the connection is usually gone, and pretending
      // otherwise leaves somebody talking to a line that closed minutes ago.
      const alive = pcRef.current && ["connected", "connecting", "new"].includes(pcRef.current.connectionState);
      if (!alive || away > RESUME_GRACE_MS) {
        endInterrupted();
        return;
      }
      setInterrupted(null);
      startClock();
    }
    document.addEventListener("visibilitychange", onVisibility);
    return () => document.removeEventListener("visibilitychange", onVisibility);
    // The handler reads everything through refs, so it must be registered once
    // and never rebound: re-binding on each render would tear the listener down
    // and put it back in the middle of a call.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Keep the newest line in view.
   *
   * Without this the transcript simply grew and the page stayed where it was,
   * so whoever was speaking had to scroll with a finger to read what had just
   * been said — mid-sentence, in a foreign language, while listening. The jump
   * is instant rather than animated on purpose: a smooth scroll is still
   * travelling when the next line lands, and it would also fire scroll events
   * short of the bottom, which the handler below would read as the user
   * deliberately scrolling away.
   */
  useEffect(() => {
    const log = logRef.current;
    if (log && followRef.current) log.scrollTop = log.scrollHeight;
  }, [lines]);

  /** Reading something further up is a decision: stop dragging them back. */
  function onLogScroll(event: React.UIEvent<HTMLDivElement>) {
    const log = event.currentTarget;
    const atBottom = log.scrollHeight - log.scrollTop - log.clientHeight < 40;
    followRef.current = atBottom;
    setDetached(!atBottom);
  }

  function catchUp() {
    followRef.current = true;
    setDetached(false);
    const log = logRef.current;
    if (log) log.scrollTop = log.scrollHeight;
  }

  /**
   * The clock counts practice, not elapsed time.
   *
   * If it kept running through an incoming call it would credit minutes
   * nobody practised, and spend the ten-minute cap on a conversation Sam was
   * having with an empty room.
   */
  /**
   * Translates the session's events into the one word on screen.
   *
   * The names are matched rather than exhaustively switched because the
   * transport sends more than is listed here and will send more still: an
   * unrecognised event should leave the label alone, never blank it.
   */
  function markPhase(type: string) {
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    if (type === "input_audio_buffer.speech_started") { setPhase("hearing"); return; }
    if (type === "input_audio_buffer.speech_stopped" || type === "response.created") {
      setPhase("thinking");
      // A promise that the far end will answer is not one this app can keep.
      // If nothing arrives, say the turn is free again rather than leave
      // "sta pensando" on screen forever.
      thinkingTimerRef.current = setTimeout(() => setPhase("waiting"), THINKING_TIMEOUT_MS);
      return;
    }
    if (type === "output_audio_buffer.started" || type === "response.output_audio.delta" || type === "response.output_item.added") {
      setPhase("speaking");
      return;
    }
    if (type === "response.done" || type === "output_audio_buffer.stopped") setPhase("waiting");
  }

  function startClock() {
    if (timerRef.current) return;
    timerRef.current = setInterval(() => {
      secondsRef.current += 1;
      setSeconds(secondsRef.current);
      if (secondsRef.current >= MAX_SECONDS) stop();
    }, 1000);
  }
  function pauseClock() {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
  }

  function cleanup(report: boolean) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
    if (thinkingTimerRef.current) { clearTimeout(thinkingTimerRef.current); thinkingTimerRef.current = null; }
    pcRef.current?.close(); pcRef.current = null;
    streamRef.current?.getTracks().forEach((t) => t.stop()); streamRef.current = null;
    if (report && secondsRef.current > 3) {
      const payload = JSON.stringify({
        seconds: secondsRef.current,
        transcript: linesRef.current.slice(-30).map((l) => ({ role: l.role, text: l.text.slice(0, 400) })),
      });
      const sent = navigator.sendBeacon?.("/api/voice/end", new Blob([payload], { type: "application/json" }));
      if (!sent) {
        fetch("/api/voice/end", { method: "POST", headers: { "Content-Type": "application/json" }, body: payload, keepalive: true }).catch(() => null);
      }
    }
  }

  function push(role: "you" | "coach", text: string) {
    const clean = text.trim();
    if (!clean) return;
    linesRef.current = [...linesRef.current.slice(-30), { role, text: clean }];
    setLines(linesRef.current);
  }

  async function start() {
    setStatus("connecting"); statusRef.current = "connecting";
    setError(""); setLines([]); setSeconds(0); secondsRef.current = 0; linesRef.current = [];
    setInterrupted(null); awaySinceRef.current = null; setPhase("waiting");
    followRef.current = true; setDetached(false);
    try {
      const tokenResponse = await fetch("/api/voice/session", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ mode: mode || "voice" }) });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error || "Voice unavailable");

      // Asked for explicitly, not left to the browser's defaults. Without echo
      // cancellation the phone's loudspeaker feeds Sam's own voice straight
      // back into the microphone, the far end hears it as the learner
      // speaking, and it cuts Sam off mid-sentence — which is exactly what a
      // tester reported, and why it behaved on headphones: no speaker, no
      // acoustic path, no problem.
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { echoCancellation: true, noiseSuppression: true, autoGainControl: true },
      });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (event) => {
        if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play().catch(() => null); }
      };
      const mic = stream.getAudioTracks()[0];
      // The most direct signal there is: the system mutes this track when
      // something else takes the audio session — a call, usually — and
      // unmutes it when it gives it back.
      mic.onmute = () => { if (statusRef.current === "live") { pauseClock(); setInterrupted("paused"); } };
      mic.onunmute = () => { if (statusRef.current === "live" && !document.hidden) { setInterrupted(null); startClock(); } };
      mic.onended = () => { if (statusRef.current === "live") endInterrupted(); };
      pc.addTrack(mic, stream);

      // A connection that has genuinely failed must not leave a screen saying
      // "in conversazione". "disconnected" can recover on its own, so only the
      // final states end the call.
      pc.onconnectionstatechange = () => {
        if (statusRef.current !== "live") return;
        if (pc.connectionState === "failed" || pc.connectionState === "closed") endInterrupted();
      };

      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as { type?: string; transcript?: string };
          if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) push("you", event.transcript);
          if ((event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") && event.transcript) push("coach", event.transcript);
          if (event.type) markPhase(event.type);
        } catch { /* non-JSON frame */ }
      };

      const offer = await pc.createOffer();
      await pc.setLocalDescription(offer);
      const answerResponse = await fetch(`https://api.openai.com/v1/realtime/calls?model=${tokenData.model}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${tokenData.clientSecret}`, "Content-Type": "application/sdp" },
        body: offer.sdp,
      });
      if (!answerResponse.ok) throw new Error("Voice connection failed");
      await pc.setRemoteDescription({ type: "answer", sdp: await answerResponse.text() });

      setStatus("live"); statusRef.current = "live";
      startClock();
    } catch (e) {
      cleanup(false);
      statusRef.current = "error";
      setStatus("error");
      setError(e instanceof Error ? e.message : "Voice unavailable");
    }
  }

  function stop() {
    cleanup(true);
    statusRef.current = "ended";
    setStatus("ended");
  }

  /** Ended by something outside the app rather than by the person. */
  function endInterrupted() {
    cleanup(true);
    statusRef.current = "ended";
    setInterrupted("lost");
    setStatus("ended");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline hidden />
      {status === "live" ? null : hero}

      {status === "idle" || status === "error" || status === "ended" ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          {status === "ended" && interrupted === "lost" ? (
            <>
              <h2>Conversazione interrotta</h2>
              <p className="muted">Qualcosa ha preso il microfono — di solito è una telefonata in arrivo. I <strong>{mm}:{ss}</strong> che avevi fatto sono salvati nei tuoi progressi: il tempo dell&rsquo;interruzione non è stato contato.</p>
            </>
          ) : status === "ended" ? (
            <>
              <h2>Ottima sessione! 🎉</h2>
              <p className="muted">{mm}:{ss} di inglese parlato davvero, registrati nei tuoi progressi.</p>
            </>
          ) : (
            <>
              <h2>Parla con Sam</h2>
              <p className="muted">Una conversazione vera: ti ascolta, risponde e ti corregge con delicatezza. Serve il permesso del microfono, e dura al massimo 10 minuti.</p>
            </>
          )}
          {status === "error" ? <div className="notice" style={{ margin: "10px 0" }}>{error}</div> : null}
          <p className="composerNote" style={{ marginTop: 10 }}>🎧 Prima di iniziare: alza il volume o metti le cuffie — Sam ti parlerà a voce.</p>
          <button className="primary full" style={{ marginTop: 10, minHeight: 58, fontSize: 18 }} onClick={start}>
            🎙️ {status === "ended" ? "Parla ancora" : "Inizia a parlare"}
          </button>
        </section>
      ) : null}

      {status === "connecting" ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          <div className="voiceOrb pulsing">🎙️</div>
          <p className="muted" style={{ marginTop: 14 }}>Connessione in corso…</p>
        </section>
      ) : null}

      {status === "live" ? (
        <div className="voiceStage">
          <section className="card voiceLive">
            <div className={interrupted === "paused" ? "voiceOrb" : "voiceOrb pulsing"}>🎙️</div>
            <p className="voiceTimer">
              {interrupted === "paused" ? "In pausa" : PHASE_LABEL[phase]}
              {phase === "thinking" && !interrupted ? <span className="voiceDots" aria-hidden>…</span> : null}
              <span className="voiceClock"> · {mm}:{ss}</span>
            </p>
            <p className="composerNote">Parla normalmente in inglese: il coach ti sente e ti risponde a voce.</p>
            <button className="secondary full voiceStop" onClick={stop}>⏹ Termina</button>
            {interrupted === "paused" ? (
              <p className="voiceAlert">📞 Audio sospeso — probabilmente una telefonata. <strong>Il tempo è fermo</strong>: torna qui e riprendi da dove eravate.</p>
            ) : null}
          </section>
          {lines.length > 0 ? (
            <section className="card">
              <div className="kicker">Trascrizione dal vivo</div>
              <div className="voiceLog" ref={logRef} onScroll={onLogScroll}>
                {lines.map((l, i) => (
                  <p key={i} className="voiceLine">
                    <strong style={{ color: l.role === "coach" ? "var(--brandText)" : "inherit" }}>{l.role === "coach" ? "Coach: " : "You: "}</strong>{l.text}
                  </p>
                ))}
                {detached ? (
                  <button type="button" className="voiceCatchUp" onClick={catchUp}>↓ Segui la conversazione</button>
                ) : null}
              </div>
            </section>
          ) : null}
        </div>
      ) : null}
    </>
  );
}
