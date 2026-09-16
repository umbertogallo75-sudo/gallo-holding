"use client";

import { useState } from "react";
import { track } from "@/lib/track-client";

/**
 * The button that puts a sentence in your own phrasebook.
 *
 * Testers asked for it in both places: "durante una conversazione scritta o
 * parlata, una funzionalità ricorda frase". The phrasebook already existed —
 * what was missing was any way for the learner to add to it. Sam decided what
 * was worth keeping, and the sentence somebody had been reaching for all month
 * went past unrecorded.
 *
 * It answers immediately and never blocks the conversation: the save is a
 * request that has already been decided by the time the tick appears, and a
 * failure says so quietly rather than throwing anything away.
 */
export function RememberPhrase({
  text,
  from = "chat",
  compact = false,
}: {
  text: string;
  from?: "chat" | "voice" | "transcript";
  compact?: boolean;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">("idle");
  const phrase = text.replace(/\s+/g, " ").trim();
  if (phrase.length < 2) return null;

  async function save() {
    if (state === "saving" || state === "saved") return;
    setState("saving");
    try {
      const response = await fetch("/api/frasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase.slice(0, 300), from }),
      });
      if (!response.ok) throw new Error("no");
      setState("saved");
      track("phrase_saved", { where: from });
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      className={`rememberBtn${compact ? " rememberCompact" : ""}${state === "saved" ? " rememberOn" : ""}`}
      onClick={save}
      disabled={state === "saving" || state === "saved"}
      aria-label={state === "saved" ? "Frase salvata nel frasario" : "Ricorda questa frase"}
      title={state === "saved" ? "È nel tuo frasario" : "Ricorda questa frase"}
    >
      {state === "saved" ? (
        <>★<span className="rememberLabel"> Nel frasario</span></>
      ) : state === "saving" ? (
        <>☆<span className="rememberLabel"> Salvo…</span></>
      ) : state === "failed" ? (
        <>↻<span className="rememberLabel"> Riprova</span></>
      ) : (
        <>☆<span className="rememberLabel"> Ricorda</span></>
      )}
    </button>
  );
}
