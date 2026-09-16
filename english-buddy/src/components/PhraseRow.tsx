"use client";

import { useState } from "react";
import { Copy } from "@/components/Copy";
import { RememberPhrase } from "@/components/RememberPhrase";
import { Speak } from "@/components/Speak";

/**
 * One phrase in the phrasebook, with the way out.
 *
 * The row disappears the moment it is removed rather than after a reload: a
 * list that still shows what you just deleted is a list you stop trusting.
 */
export function PhraseRow({ text, meaning }: { text: string; meaning: string | null }) {
  const [gone, setGone] = useState(false);
  if (gone) return null;

  return (
    <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 10, padding: "11px 0", borderBottom: "1px solid var(--line)" }}>
      <div style={{ minWidth: 0 }}>
        <strong style={{ fontSize: 16 }}>{text}</strong>
        {meaning ? <div className="itHint">{meaning}</div> : null}
      </div>
      <span style={{ display: "flex", gap: 4, flexShrink: 0, alignItems: "center" }}>
        <Speak text={text} compact />
        <Copy text={text} />
        <RememberPhrase text={text} compact saved onChange={(saved) => setGone(!saved)} />
      </span>
    </div>
  );
}
