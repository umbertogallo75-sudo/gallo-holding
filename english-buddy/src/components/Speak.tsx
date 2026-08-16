"use client";

import { useRef, useState } from "react";
import { tuneSamUtterance } from "@/lib/voice-prefs";

/**
 * Listen buttons for any English text: normal speed and slow replay.
 *
 * Sam's own voice, from the server, is what plays. The device's built-in
 * synthesis is only the last resort, for when the network is gone.
 *
 * It used to be the other way round, and on iPhone the button did nothing at
 * all. Two reasons, and both are worth writing down because they are invisible
 * from a desktop browser:
 *
 * iOS only lets audio start from a user action, and a network round trip ends
 * that permission — so fetching the clip and *then* playing it is refused
 * every time. The element therefore has to be woken up synchronously inside
 * the tap, before anything is awaited; once woken it can be given a real clip
 * later. And `getVoices()` returns an empty list on the first call in Safari,
 * so a check for a local English voice answers "no" precisely when somebody
 * presses the button for the first time.
 *
 * Choosing the server voice also fixes something quieter: pronunciation is
 * what this product is for, and the device voice varies from phone to phone —
 * on an Italian iPhone it reads English with an Italian accent. Sam should
 * sound the same for everyone.
 */

/** Ten samples of silence: enough to unlock the element, inaudible to anyone. */
const SILENCE =
  "data:audio/wav;base64,UklGRjQAAABXQVZFZm10IBAAAAABAAEAQB8AAIA+AAACABAAZGF0YRAAAAAAAAAAAAAAAAAAAAAAAAAA";

export function Speak({ text, compact = false, lang = "en-US" }: { text: string; compact?: boolean; lang?: "en-US" | "en-GB" }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const urlRef = useRef<string | null>(null);
  const [busy, setBusy] = useState(false);

  /** The device's own voice — only reachable offline, and only if one exists. */
  function speakLocally(rate: number): boolean {
    try {
      if (!("speechSynthesis" in window)) return false;
      const voices = window.speechSynthesis.getVoices();
      // An empty list means Safari has not loaded them yet, not that there are
      // none; with no network there is nothing better to try either way.
      if (voices.length && !voices.some((v) => v.lang.replace("_", "-").startsWith("en"))) return false;
      window.speechSynthesis.cancel();
      const utterance = new SpeechSynthesisUtterance(text.replace(/\([^)]*\)/g, ""));
      tuneSamUtterance(utterance, lang, rate);
      window.speechSynthesis.speak(utterance);
      return true;
    } catch {
      return false;
    }
  }

  async function fetchAndPlay(rate: number, audio: HTMLAudioElement) {
    setBusy(true);
    try {
      const response = await fetch("/api/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text, rate, lang }),
      });
      if (!response.ok) throw new Error(`tts ${response.status}`);
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      const url = URL.createObjectURL(await response.blob());
      urlRef.current = url;
      audio.src = url;
      audio.currentTime = 0;
      await audio.play();
    } catch {
      // Offline, or the voice service is down. The device tries — and if it
      // cannot either, the phrase is still written on screen.
      speakLocally(rate);
    } finally {
      setBusy(false);
    }
  }

  function play(rate: number) {
    if (busy) return;
    // Everything up to here runs inside the tap, on purpose: this is the only
    // moment iOS will let the element start, and it stays unlocked afterwards.
    const audio = audioRef.current ?? new Audio();
    audioRef.current = audio;
    audio.pause();
    audio.src = SILENCE;
    void audio.play().catch(() => undefined);
    void fetchAndPlay(rate, audio);
  }

  return (
    <span className="speakRow">
      <button type="button" className="speakBtn" aria-label="Listen" title="Listen · Ascolta" disabled={busy} onClick={() => play(1)}>{busy ? "…" : "🔊"}</button>
      <button type="button" className="speakBtn" aria-label="Listen slowly" title="Slow · Lento" disabled={busy} onClick={() => play(0.7)}>🐢</button>
      {!compact ? <span className="itHint" style={{ fontStyle: "normal" }}>listen</span> : null}
    </span>
  );
}
