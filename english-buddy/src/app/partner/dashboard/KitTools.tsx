"use client";

import { useState } from "react";

/** Copy-to-clipboard + SVG→PNG download helpers for the marketing kit. */

export function CopyButton({ text, label }: { text: string; label: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pill"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch { /* clipboard unavailable */ }
      }}
    >
      {done ? "Copiato ✓" : label}
    </button>
  );
}

export function DownloadPng({ campaign, format, w, h, label }: { campaign: string; format: string; w: number; h: number; label: string }) {
  const [busy, setBusy] = useState(false);
  async function download() {
    setBusy(true);
    try {
      const response = await fetch(`/api/partner/creative?campaign=${campaign}&format=${format}`);
      const svgText = await response.text();
      const blob = new Blob([svgText], { type: "image/svg+xml" });
      const url = URL.createObjectURL(blob);
      const img = new Image();
      await new Promise<void>((resolve, reject) => {
        img.onload = () => resolve();
        img.onerror = () => reject(new Error("img"));
        img.src = url;
      });
      const canvas = document.createElement("canvas");
      canvas.width = w;
      canvas.height = h;
      canvas.getContext("2d")?.drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url);
      const png = canvas.toDataURL("image/png");
      const a = document.createElement("a");
      a.href = png;
      a.download = `execlingo-${campaign}-${format}.png`;
      a.click();
    } catch {
      window.open(`/api/partner/creative?campaign=${campaign}&format=${format}`, "_blank");
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="pill" disabled={busy} onClick={download}>{busy ? "…" : label}</button>;
}
