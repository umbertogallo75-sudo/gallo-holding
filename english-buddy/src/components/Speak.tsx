"use client";

import { tuneSamUtterance } from "@/lib/voice-prefs";

/**
 * Listen buttons for any English text: normal speed and slow replay.
 * Uses the device's speech synthesis (free, offline-capable, works on iOS)
 * with Sam's voice preferences (male, gentle).
 */
export function Speak({ text, compact = false, lang = "en-US" }: { text: string; compact?: boolean; lang?: "en-US" | "en-GB" }) {
  if (typeof window !== "undefined" && !("speechSynthesis" in window)) return null;

  function play(rate: number) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/\([^)]*\)/g, ""));
      tuneSamUtterance(utterance, lang, rate);
      window.speechSynthesis.speak(utterance);
    } catch {
      // Speech not available right now — button simply does nothing.
    }
  }

  return (
    <span className="speakRow">
      <button type="button" className="speakBtn" aria-label="Listen" title="Listen · Ascolta" onClick={() => play(1)}>🔊</button>
      <button type="button" className="speakBtn" aria-label="Listen slowly" title="Slow · Lento" onClick={() => play(0.68)}>🐢</button>
      {!compact ? <span className="itHint" style={{ fontStyle: "normal" }}>listen</span> : null}
    </span>
  );
}
