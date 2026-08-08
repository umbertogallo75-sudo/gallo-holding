"use client";

import { useEffect, useRef, useState } from "react";

type Line = { role: "you" | "coach"; text: string };
type Status = "idle" | "connecting" | "live" | "ended" | "error";

const MAX_SECONDS = 600; // hard cap per conversation to keep costs sane

export function VoiceClient() {
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

  useEffect(() => () => { cleanup(false); }, []);

  function cleanup(report: boolean) {
    if (timerRef.current) { clearInterval(timerRef.current); timerRef.current = null; }
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
    setStatus("connecting"); setError(""); setLines([]); setSeconds(0); secondsRef.current = 0; linesRef.current = [];
    try {
      const tokenResponse = await fetch("/api/voice/session", { method: "POST" });
      const tokenData = await tokenResponse.json();
      if (!tokenResponse.ok) throw new Error(tokenData.error || "Voice unavailable");

      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const pc = new RTCPeerConnection();
      pcRef.current = pc;
      pc.ontrack = (event) => {
        if (audioRef.current) { audioRef.current.srcObject = event.streams[0]; void audioRef.current.play().catch(() => null); }
      };
      pc.addTrack(stream.getAudioTracks()[0], stream);

      const channel = pc.createDataChannel("oai-events");
      channel.onmessage = (message) => {
        try {
          const event = JSON.parse(message.data as string) as { type?: string; transcript?: string };
          if (event.type === "conversation.item.input_audio_transcription.completed" && event.transcript) push("you", event.transcript);
          if ((event.type === "response.output_audio_transcript.done" || event.type === "response.audio_transcript.done") && event.transcript) push("coach", event.transcript);
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

      setStatus("live");
      timerRef.current = setInterval(() => {
        secondsRef.current += 1;
        setSeconds(secondsRef.current);
        if (secondsRef.current >= MAX_SECONDS) stop();
      }, 1000);
    } catch (e) {
      cleanup(false);
      setStatus("error");
      setError(e instanceof Error ? e.message : "Voice unavailable");
    }
  }

  function stop() {
    cleanup(true);
    setStatus("ended");
  }

  const mm = String(Math.floor(seconds / 60)).padStart(1, "0");
  const ss = String(seconds % 60).padStart(2, "0");

  return (
    <>
      <audio ref={audioRef} autoPlay playsInline hidden />

      {status === "idle" || status === "error" || status === "ended" ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          {status === "ended" ? (
            <>
              <h2>Great session! 🎉</h2>
              <p className="muted">{mm}:{ss} of real spoken English.</p>
              <p className="itHint">Ottima sessione: {mm}:{ss} di vero inglese parlato, registrati nei tuoi progressi.</p>
            </>
          ) : (
            <>
              <h2>Talk with your coach</h2>
              <p className="muted">A real spoken conversation: the coach listens, answers and gently corrects you. Max 10 minutes.</p>
              <p className="itHint">Una vera conversazione a voce: il coach ti ascolta, risponde e ti corregge con delicatezza. Serve il permesso del microfono. Massimo 10 minuti a sessione.</p>
            </>
          )}
          {status === "error" ? <div className="notice" style={{ margin: "10px 0" }}>{error}</div> : null}
          <button className="primary full" style={{ marginTop: 12, minHeight: 58, fontSize: 18 }} onClick={start}>
            🎙️ {status === "ended" ? "Talk again · Parla ancora" : "Start talking · Inizia a parlare"}
          </button>
        </section>
      ) : null}

      {status === "connecting" ? (
        <section className="card" style={{ textAlign: "center", padding: 28 }}>
          <div className="voiceOrb pulsing">🎙️</div>
          <p className="muted" style={{ marginTop: 14 }}>Connecting… <span className="itHint">Connessione in corso…</span></p>
        </section>
      ) : null}

      {status === "live" ? (
        <>
          <section className="card" style={{ textAlign: "center", padding: 24 }}>
            <div className="voiceOrb pulsing">🎙️</div>
            <p style={{ margin: "12px 0 2px", fontWeight: 750, fontSize: 18 }}>In conversation · {mm}:{ss}</p>
            <p className="itHint">Parla normalmente in inglese: il coach ti sente e ti risponde a voce.</p>
            <button className="secondary full" style={{ marginTop: 12 }} onClick={stop}>⏹ End conversation · Termina</button>
          </section>
          {lines.length > 0 ? (
            <section className="card">
              <div className="kicker">Live transcript</div>
              {lines.map((l, i) => (
                <p key={i} style={{ margin: "8px 0", fontSize: 15.5 }}>
                  <strong style={{ color: l.role === "coach" ? "var(--brandText)" : "inherit" }}>{l.role === "coach" ? "Coach: " : "You: "}</strong>{l.text}
                </p>
              ))}
            </section>
          ) : null}
        </>
      ) : null}
    </>
  );
}
