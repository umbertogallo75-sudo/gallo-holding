"use client";

import { useRef, useState } from "react";
import { tuneSamUtterance } from "@/lib/voice-prefs";

/**
 * Listen buttons for any English text: normal speed and slow replay.
 *
 * First choice is the device's own speech synthesis — free, instant, offline.
 * Inside the Android app that API exists but has no engine behind it: the
 * button appeared and nothing was heard. So a failure to start falls back to
 * Sam's voice from the server, and the phrase is always audible.
 */
export function Speak({ text, compact = false, lang = "en-US" }: { text: string; compact?: boolean; lang?: "en-US" | "en-GB" }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [busy, setBusy] = useState(false);

  /** True when the device can really speak: the API alone is not enough. */
  function hasLocalVoice(): boolean {
    try {
      if (!("speechSynthesis" in window)) return false;
      return window.speechSynthesis.getVoices().some((v) => v.lang.replace("_", "-").startsWith("en"));
    } catch {
      return false;
    }
  }

  async function playFromServer(rate: number) {
    setBusy(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, rate, lang }),
      });
      if (!response.ok) return;
      const url = URL.createObjectURL(await response.blob());
      audioRef.current?.pause();
      const audio = audioRef.current ?? new Audio();
      audioRef.current = audio;
      audio.src = url;
      audio.onended = () => URL.revokeObjectURL(url);
      await audio.play().catch(() => undefined);
    } catch {
      // Nothing more to try — the text stays on screen.
    } finally {
      setBusy(false);
    }
  }

  function play(rate: number) {
    if (busy) return;
    if (!hasLocalVoice()) { void playFromServer(rate); return; }
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/\([^)]*\)/g, ""));
      tuneSamUtterance(utterance, lang, rate);
      // Some engines accept the utterance and never speak it; if nothing has
      // started shortly after, the server takes over.
      let started = false;
      utterance.onstart = () => { started = true; };
      utterance.onerror = () => { if (!started) void playFromServer(rate); };
      window.speechSynthesis.speak(utterance);
      setTimeout(() => { if (!started) void playFromServer(rate); }, 700);
    } catch {
      void playFromServer(rate);
    }
  }

  return (
    <span className="speakRow">
      <button type="button" className="speakBtn" aria-label="Listen" title="Listen · Ascolta" onClick={() => play(1)}>{busy ? "…" : "🔊"}</button>
      <button type="button" className="speakBtn" aria-label="Listen slowly" title="Slow · Lento" onClick={() => play(0.7)}>🐢</button>
      {!compact ? <span className="itHint" style={{ fontStyle: "normal" }}>listen</span> : null}
    </span>
  );
}
