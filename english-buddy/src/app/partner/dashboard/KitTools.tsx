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

/**
 * Hands an image to the device. On phones the Web Share sheet is the only
 * web-allowed route into the photo library ("Salva immagine" on iOS/Android),
 * so we prefer it; on desktop we fall back to a normal file download.
 */
async function saveImageToDevice(blob: Blob, name: string, caption?: string): Promise<void> {
  const file = new File([blob], name, { type: blob.type || "image/png" });
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file], ...(caption ? { text: caption } : {}) });
      return;
    } catch { /* sheet dismissed — fall through to download */ }
  }
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = name;
  a.click();
  setTimeout(() => URL.revokeObjectURL(a.href), 10_000);
}

/**
 * WhatsApp with the photo attached. wa.me links can only carry text, so on
 * phones this goes through the OS share sheet with the file + caption
 * (choose WhatsApp there and the photo is already attached). The text is
 * also on the clipboard for apps that drop captions. Desktop falls back to
 * text-only wa.me — the web offers no other route into WhatsApp.
 */
export function WhatsAppPhotoShare({ src, name, text }: { src: string; name: string; text: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");
  return (
    <button
      type="button"
      className="pill"
      style={{ borderColor: "#25D366" }}
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
          const blob = await (await fetch(src)).blob();
          const file = new File([blob], name, { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text });
            setState("copied");
            setTimeout(() => setState("idle"), 2600);
          } else {
            window.open(`https://wa.me/?text=${encodeURIComponent(text)}`, "_blank", "noopener");
            setState("idle");
          }
        } catch { setState("idle"); }
      }}
    >
      {state === "busy" ? "…" : state === "copied" ? "Foto allegata ✓ testo copiato" : "🟢 WhatsApp: foto + testo"}
    </button>
  );
}

/**
 * Shares a photo WITH its accompanying copy (partner link included) via the
 * OS share sheet — pick WhatsApp, LinkedIn, Instagram… Some apps drop the
 * text when a file is attached, so the copy is also placed on the clipboard
 * ready to paste. Desktop fallback: download the photo + copy the text.
 */
export function SharePhotoWithText({ src, name, text }: { src: string; name: string; text: string }) {
  const [state, setState] = useState<"idle" | "busy" | "copied">("idle");
  return (
    <button
      type="button"
      className="pill"
      disabled={state === "busy"}
      onClick={async () => {
        setState("busy");
        try {
          try { await navigator.clipboard.writeText(text); } catch { /* clipboard unavailable */ }
          const blob = await (await fetch(src)).blob();
          const file = new File([blob], name, { type: blob.type || "image/jpeg" });
          if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], text });
          } else {
            await saveImageToDevice(blob, name);
          }
          setState("copied");
          setTimeout(() => setState("idle"), 2600);
        } catch { setState("idle"); }
      }}
    >
      {state === "busy" ? "…" : state === "copied" ? "Testo copiato ✓ incollalo nel post" : "📤 Condividi con testo"}
    </button>
  );
}

/** Official photographic creative: preview-sized button that saves to the gallery. */
export function SavePhoto({ src, name, label }: { src: string; name: string; label: string }) {
  const [busy, setBusy] = useState(false);
  return (
    <button
      type="button"
      className="pill"
      disabled={busy}
      onClick={async () => {
        setBusy(true);
        try {
          const blob = await (await fetch(src)).blob();
          await saveImageToDevice(blob, name);
        } catch { window.open(src, "_blank"); } finally {
          setBusy(false);
        }
      }}
    >
      {busy ? "…" : label}
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
          try { await navigator.clipboard.writeText(caption); } catch { /* clipboard unavailable */ }
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
      const blob = await creativeAsPng(campaign, format, w, h);
      if (!blob) throw new Error("png");
      await saveImageToDevice(blob, `execlingo-${campaign}-${format}.png`);
    } catch {
      window.open(`/api/partner/creative?campaign=${campaign}&format=${format}`, "_blank");
    } finally {
      setBusy(false);
    }
  }
  return <button type="button" className="pill" disabled={busy} onClick={download}>{busy ? "…" : label}</button>;
}
