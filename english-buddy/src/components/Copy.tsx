"use client";

import { useState } from "react";

/**
 * Copies an English phrase to the clipboard, so it can go straight into a
 * chat, an email or a message — often what happens to a phrase after it has
 * been said once. Falls back to the old selection trick in the webviews where
 * the clipboard API is not granted.
 */
export function Copy({ text }: { text: string }) {
  const [done, setDone] = useState(false);

  async function copy() {
    let ok = false;
    try {
      await navigator.clipboard.writeText(text);
      ok = true;
    } catch {
      try {
        const area = document.createElement("textarea");
        area.value = text;
        area.setAttribute("readonly", "");
        area.style.position = "fixed";
        area.style.opacity = "0";
        document.body.appendChild(area);
        area.select();
        ok = document.execCommand("copy");
        document.body.removeChild(area);
      } catch {
        ok = false;
      }
    }
    if (!ok) return;
    setDone(true);
    setTimeout(() => setDone(false), 1600);
  }

  return (
    <button type="button" className="speakBtn" title="Copia · Copy" aria-label="Copia" onClick={copy}>
      {done ? "✓" : "📋"}
    </button>
  );
}
