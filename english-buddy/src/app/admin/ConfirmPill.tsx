"use client";

import { useState } from "react";

/**
 * A button that asks before it acts, without stopping the browser.
 *
 * window.confirm halts the main thread: nothing repaints while the dialog is
 * open, so the whole span from the click to the answer is counted as one
 * blocked interaction — which is what raised a 1.45-second warning on an admin
 * button that does nothing slow at all.
 *
 * It is also the weaker guard. A native dialog looks identical whatever it is
 * about, so the second "are you sure?" of a two-step delete reads exactly like
 * the first and is clicked through on reflex. Here the question takes the
 * button's own place and says what is about to happen, in red when it cannot
 * be undone.
 */
export function ConfirmPill({
  label,
  question,
  onConfirm,
  disabled,
  danger,
  title,
  style,
}: {
  label: string;
  /** What is about to happen, in the button's own place. Short: it has to fit. */
  question: string;
  onConfirm: () => void;
  disabled?: boolean;
  danger?: boolean;
  title?: string;
  style?: React.CSSProperties;
}) {
  const [asking, setAsking] = useState(false);

  if (!asking) {
    return (
      <button
        type="button"
        className="pill"
        disabled={disabled}
        title={title}
        style={danger ? { borderColor: "#b3362a", color: "#b3362a", ...style } : style}
        onClick={() => setAsking(true)}
      >
        {label}
      </button>
    );
  }

  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
      <span style={{ fontSize: 13, color: danger ? "#b3362a" : "var(--muted)" }}>{question}</span>
      <button
        type="button"
        className="pill"
        disabled={disabled}
        style={{ borderColor: danger ? "#b3362a" : "var(--accent)", color: danger ? "#b3362a" : "var(--accent)", fontWeight: 700 }}
        onClick={() => {
          setAsking(false);
          onConfirm();
        }}
      >
        Sì, procedi
      </button>
      <button type="button" className="pill" onClick={() => setAsking(false)}>Annulla</button>
    </span>
  );
}
