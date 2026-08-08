"use client";

/**
 * Listen buttons for any English text: normal speed and slow replay.
 * Uses the device's speech synthesis (free, offline-capable, works on iOS).
 */
export function Speak({ text, compact = false, lang = "en-US" }: { text: string; compact?: boolean; lang?: "en-US" | "en-GB" }) {
  if (typeof window !== "undefined" && !("speechSynthesis" in window)) return null;

  function play(rate: number) {
    try {
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/\([^)]*\)/g, ""));
      utterance.lang = lang;
      utterance.rate = rate;
      const voices = window.speechSynthesis.getVoices();
      const voice = voices.find((v) => v.lang.replace("_", "-").startsWith(lang)) || voices.find((v) => v.lang.startsWith("en"));
      if (voice) utterance.voice = voice;
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
