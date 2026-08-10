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

/** Prefilled WhatsApp share — the fastest promotion channel in Italy. */
export function WhatsAppShare({ text, label }: { text: string; label?: string }) {
  return (
    <a className="pill" href={`https://wa.me/?text=${encodeURIComponent(text)}`} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", borderColor: "#25D366", color: "inherit" }}>
      {label ?? "🟢 Invia su WhatsApp"}
    </a>
  );
}

/** Native share sheet (AirDrop, Messages, social apps); clipboard fallback. */
export function ShareLink({ title, text, url }: { title: string; text: string; url: string }) {
  const [done, setDone] = useState(false);
  return (
    <button
      type="button"
      className="pill"
      onClick={async () => {
        try {
          if (navigator.share) {
            await navigator.share({ title, text, url });
            return;
          }
          await navigator.clipboard.writeText(`${text}\n${url}`);
          setDone(true);
          setTimeout(() => setDone(false), 1600);
        } catch { /* user closed the sheet */ }
      }}
    >
      {done ? "Copiato ✓" : "📤 Condividi"}
    </button>
  );
}

async function creativeAsPng(campaign: string, format: string, w: number, h: number): Promise<Blob | null> {
  const response = await fetch(`/api/partner/creative?campaign=${campaign}&format=${format}`);
  const svgText = await response.text();
  const url = URL.createObjectURL(new Blob([svgText], { type: "image/svg+xml" }));
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
  return new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
}

/** Shares the branded creative straight into WhatsApp/Instagram via the OS sheet. */
export function ShareImage({ campaign, format, w, h, caption }: { campaign: string; format: string; w: number; h: number; caption: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="pill"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await creativeAsPng(campaign, format, w, h);
          if (!blob) throw new Error("png");
          const file = new File([blob], `execlingo-${campaign}.png`, { type: "image/png" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text: caption });
          } else {
            const a = document.createElement("a");
            a.href = URL.createObjectURL(blob);
            a.download = file.name;
            a.click();
          }
        } catch { /* user closed the sheet */ } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : "📤 Condividi immagine"}
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
