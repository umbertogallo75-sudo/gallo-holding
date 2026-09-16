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
 * It answers immediately and never blocks the conversation, and it goes both
 * ways: tapping a filled star takes the phrase back out, because a star that
 * only fills is a trap — a phrase saved by a mistyped tap would keep coming
 * back in the reviews and in the gym for weeks.
 */
export function RememberPhrase({
  text,
  from = "chat",
  compact = false,
  saved = false,
  onChange,
}: {
  text: string;
  from?: "chat" | "voice" | "transcript";
  compact?: boolean;
  /** Already in the phrasebook: the star starts filled. */
  saved?: boolean;
  /** Told when it changes, for a list that has to remove the row. */
  onChange?: (saved: boolean) => void;
}) {
  const [state, setState] = useState<"idle" | "saving" | "saved" | "failed">(saved ? "saved" : "idle");
  const phrase = text.replace(/\s+/g, " ").trim();
  if (phrase.length < 2) return null;

  async function toggle() {
    if (state === "saving") return;
    // Tapping a filled star takes the phrase back out. A star you cannot
    // un-star is a trap: a mistyped tap would otherwise keep coming back in
    // the reviews and in the gym for weeks.
    const removing = state === "saved";
    setState("saving");
    try {
      const response = await fetch("/api/frasi", {
        method: removing ? "DELETE" : "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase.slice(0, 300), from }),
      });
      if (!response.ok) throw new Error("no");
      setState(removing ? "idle" : "saved");
      if (!removing) track("phrase_saved", { where: from });
      onChange?.(!removing);
    } catch {
      setState("failed");
    }
  }

  return (
    <button
      type="button"
      className={`rememberBtn${compact ? " rememberCompact" : ""}${state === "saved" ? " rememberOn" : ""}`}
      onClick={toggle}
      disabled={state === "saving"}
      aria-pressed={state === "saved"}
      aria-label={state === "saved" ? "Togli dal frasario" : "Ricorda questa frase"}
      title={state === "saved" ? "È nel frasario — tocca per toglierla" : "Ricorda questa frase"}
    >
      {state === "saved" ? (
        <>★<span className="rememberLabel"> Nel frasario</span></>
      ) : state === "saving" ? (
        <>☆<span className="rememberLabel"> Un attimo…</span></>
      ) : state === "failed" ? (
        <>↻<span className="rememberLabel"> Riprova</span></>
      ) : (
        <>☆<span className="rememberLabel"> Ricorda</span></>
      )}
    </button>
  );
}
