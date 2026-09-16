"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";
import { track } from "@/lib/track-client";

/**
 * Adding a phrase by hand.
 *
 * The one somebody heard in a real meeting this morning, or read in an email,
 * belongs here as much as the ones Sam taught — and it is the one they are
 * most likely to actually need again. The Italian is filled in afterwards by
 * the server, so this stays a single field and a button.
 */
export function AddPhrase() {
  const [text, setText] = useState("");
  const [state, setState] = useState<"idle" | "saving" | "failed">("idle");
  const router = useRouter();

  async function submit(event: React.FormEvent) {
    event.preventDefault();
    const phrase = text.replace(/\s+/g, " ").trim();
    if (phrase.length < 2 || state === "saving") return;
    setState("saving");
    try {
      const response = await fetch("/api/frasi", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: phrase.slice(0, 300), from: "chat" }),
      });
      if (!response.ok) throw new Error("no");
      setText("");
      setState("idle");
      track("phrase_saved", { where: "phrasebook" });
      router.refresh();
    } catch {
      setState("failed");
    }
  }

  return (
    <form onSubmit={submit} style={{ display: "flex", gap: 8, marginTop: 10, flexWrap: "wrap" }}>
      <input
        value={text}
        onChange={(e) => { setText(e.target.value); if (state === "failed") setState("idle"); }}
        placeholder="Una frase che vuoi tenere — anche sentita fuori da qui"
        aria-label="Frase da ricordare"
        maxLength={300}
        style={{
          flex: "1 1 220px", minWidth: 0, padding: "12px 14px", fontSize: 16, borderRadius: 14,
          border: "1px solid var(--line)", background: "var(--surface)", color: "var(--ink)", fontFamily: "inherit",
        }}
      />
      <button type="submit" className="primary" style={{ minWidth: 0, padding: "12px 18px" }} disabled={state === "saving" || text.trim().length < 2}>
        {state === "saving" ? "Salvo…" : "★ Tieni"}
      </button>
      {state === "failed" ? <span className="composerNote" style={{ flexBasis: "100%" }}>Non è andata — riprova tra un attimo.</span> : null}
    </form>
  );
}
