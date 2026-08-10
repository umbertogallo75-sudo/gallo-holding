import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getUserId } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { CAMPAIGNS, FORMATS } from "@/lib/marketing-kit";

/**
 * Premium branded campaign creatives as SVG, personalized with the partner's
 * QR. Art direction: dark editorial canvas, layered light, campaign-specific
 * accent + motif, display serif headline, glass QR card. The dashboard
 * rasterizes to PNG client-side; ?inline=1 serves for <img> previews.
 */

const ACCENTS: Record<string, { a: string; b: string; kicker: string }> = {
  "business-english": { a: "#2f8f63", b: "#e6a94e", kicker: "BUSINESS ENGLISH" },
  "percorso-3-mesi": { a: "#c98a2d", b: "#5ec79a", kicker: "3-MONTH EXECUTIVE PATH" },
  "poco-tempo": { a: "#3b6ea5", b: "#5ec79a", kicker: "ON YOUR TIME" },
  "call-meeting": { a: "#4a72b0", b: "#e6a94e", kicker: "CALL & MEETING" },
  "listen-type": { a: "#7a5aa0", b: "#5ec79a", kicker: "LISTEN + TYPE" },
  "business-travel": { a: "#b0567a", b: "#e6a94e", kicker: "BUSINESS + TRAVEL" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

function wrap(text: string, max: number, lines: number): string[] {
  const words = text.split(" ");
  const out: string[] = [];
  let line = "";
  for (const w of words) {
    if ((line + " " + w).trim().length > max && line) {
      out.push(line.trim());
      line = w;
    } else line = `${line} ${w}`;
  }
  if (line.trim()) out.push(line.trim());
  return out.slice(0, lines);
}

/** Campaign-specific decorative motif, drawn inside a given box. */
function motif(id: string, x: number, y: number, w: number, a: string, b: string): string {
  const s = w / 100;
  switch (id) {
    case "business-english": {
      // rising bars — growth
      const bars = [28, 44, 36, 58, 50, 74].map((h, i) =>
        `<rect x="${x + i * 16 * s}" y="${y + (80 - h) * s}" width="10${""} " height="${h * s}" rx="${4 * s}" fill="${i === 5 ? b : a}" opacity="${0.25 + i * 0.12}"/>`.replace('width="10 "', `width="${10 * s}"`)
      );
      return bars.join("");
    }
    case "percorso-3-mesi": {
      const step = (i: number, cx: number, filled: boolean) =>
        `<circle cx="${x + cx * s}" cy="${y + 40 * s}" r="${16 * s}" fill="${filled ? a : "none"}" stroke="${filled ? a : "#4a544c"}" stroke-width="${2.5 * s}"/>
         <text x="${x + cx * s}" y="${y + 47 * s}" text-anchor="middle" font-family="Georgia, serif" font-size="${18 * s}" font-weight="700" fill="${filled ? "#0a100c" : "#8d968a"}">${i}</text>`;
      return `<line x1="${x + 16 * s}" y1="${y + 40 * s}" x2="${x + 96 * s}" y2="${y + 40 * s}" stroke="#4a544c" stroke-width="${2 * s}" stroke-dasharray="${5 * s} ${5 * s}"/>
        ${step(1, 16, true)}${step(2, 56, true)}${step(3, 96, false)}
        <text x="${x + 96 * s}" y="${y + 76 * s}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial" font-size="${10 * s}" letter-spacing="${1.5 * s}" fill="${b}">OPERATIVO</text>`;
    }
    case "poco-tempo": {
      const chip = (t: string, cx: number, big: boolean) =>
        `<rect x="${x + cx * s}" y="${y + (big ? 18 : 26) * s}" width="${(big ? 44 : 34) * s}" height="${(big ? 44 : 34) * s}" rx="${12 * s}" fill="none" stroke="${big ? a : "#4a544c"}" stroke-width="${2.5 * s}"/>
         <text x="${x + (cx + (big ? 22 : 17)) * s}" y="${y + (big ? 47 : 50) * s}" text-anchor="middle" font-family="Georgia, serif" font-size="${(big ? 22 : 16) * s}" font-weight="700" fill="${big ? b : "#aeb6a9"}">${t}</text>`;
      return `${chip("2'", 0, false)}${chip("5'", 42, false)}${chip("20'", 84, true)}`;
    }
    case "call-meeting": {
      return `<rect x="${x}" y="${y + 14 * s}" width="${86 * s}" height="${54 * s}" rx="${10 * s}" fill="none" stroke="${a}" stroke-width="${2.5 * s}"/>
        <circle cx="${x + 22 * s}" cy="${y + 36 * s}" r="${8 * s}" fill="${a}" opacity=".8"/>
        <circle cx="${x + 44 * s}" cy="${y + 36 * s}" r="${8 * s}" fill="${b}" opacity=".8"/>
        <circle cx="${x + 66 * s}" cy="${y + 36 * s}" r="${8 * s}" fill="#5ec79a" opacity=".8"/>
        <rect x="${x + 14 * s}" y="${y + 52 * s}" width="${58 * s}" height="${5 * s}" rx="${2.5 * s}" fill="#4a544c"/>
        <circle cx="${x + 96 * s}" cy="${y + 22 * s}" r="${7 * s}" fill="${b}"/>
        <text x="${x + 96 * s}" y="${y + 26 * s}" text-anchor="middle" font-family="-apple-system, Helvetica" font-size="${9 * s}" font-weight="700" fill="#0a100c">EN</text>`;
    }
    case "listen-type": {
      const heights = [18, 34, 52, 68, 52, 38, 58, 44, 26, 14];
      return heights
        .map((h, i) => `<rect x="${x + i * 11 * s}" y="${y + (80 - h) * s / 1.15}" width="${6 * s}" height="${h * s}" rx="${3 * s}" fill="${i % 3 === 0 ? a : i % 3 === 1 ? "#5ec79a" : b}" opacity="${0.5 + (h / 140)}"/>`)
        .join("");
    }
    case "business-travel": {
      return `<path d="M ${x} ${y + 64 * s} Q ${x + 50 * s} ${y - 6 * s} ${x + 100 * s} ${y + 30 * s}" fill="none" stroke="${a}" stroke-width="${2.5 * s}" stroke-dasharray="${7 * s} ${6 * s}"/>
        <circle cx="${x}" cy="${y + 64 * s}" r="${5 * s}" fill="${b}"/>
        <circle cx="${x + 100 * s}" cy="${y + 30 * s}" r="${5 * s}" fill="${b}"/>
        <path d="M ${x + 52 * s} ${y + 14 * s} l ${14 * s} ${7 * s} l ${-5 * s} ${3 * s} l ${5 * s} ${8 * s} l ${-4 * s} ${2 * s} l ${-8 * s} ${-7 * s} l ${-6 * s} ${3 * s} l ${-1 * s} ${6 * s} l ${-3 * s} ${1 * s} l ${-1 * s} ${-8 * s} l ${-7 * s} ${-4 * s} z" fill="#f4f6f0" opacity=".92"/>`;
    }
    default:
      return "";
  }
}

function glassQr(x: number, y: number, size: number, qrInner: string, qrViewBox: string, refCode: string, fontScale: number): string {
  const pad = size * 0.09;
  const cardW = size + pad * 2;
  const cardH = size + pad * 2 + 30 * fontScale;
  return `<g>
    <rect x="${x}" y="${y}" width="${cardW}" height="${cardH}" rx="${size * 0.12}" fill="#ffffff" opacity=".97"/>
    <svg x="${x + pad}" y="${y + pad}" width="${size}" height="${size}" viewBox="${qrViewBox}">${qrInner}</svg>
    <text x="${x + cardW / 2}" y="${y + size + pad * 1.7 + 12 * fontScale}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial" font-size="${11 * fontScale}" font-weight="700" letter-spacing="${0.4 * fontScale}" fill="#1c241e">INQUADRA · PROVA GRATIS</text>
  </g>`;
}

export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = await getPartner(userId);
  if (!partner) return NextResponse.json({ error: "Non sei un partner" }, { status: 403 });

  const url = new URL(request.url);
  const campaign = CAMPAIGNS.find((c) => c.id === url.searchParams.get("campaign")) ?? CAMPAIGNS[0];
  const format = FORMATS.find((f) => f.id === url.searchParams.get("format")) ?? FORMATS[0];
  const inline = url.searchParams.get("inline") === "1";
  const accent = ACCENTS[campaign.id] ?? ACCENTS["business-english"];

  const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
  const target = `${base}/r/${partner.refCode}?campaign=${encodeURIComponent(campaign.id)}`;
  const qrSvg = await QRCode.toString(target, { type: "svg", margin: 0, color: { dark: "#101511", light: "#ffffff" } });
  const qrInner = qrSvg.replace(/<\?xml[^>]*\?>/, "").replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const qrViewBox = qrSvg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 33 33";

  const { w, h } = format;
  const landscape = w > h;
  const story = h / w > 1.4;
  const u = w / 1080; // scale unit
  const pad = Math.round(w * (landscape ? 0.055 : 0.074));

  const headLines = wrap(campaign.headline, landscape ? 17 : 18, 4);
  const headShrink = headLines.length >= 4 ? 0.82 : headLines.length === 3 ? 0.94 : 1;
  const headSize = Math.round((landscape ? 62 : story ? 86 : 82) * u * (landscape ? 1.18 : 1) * headShrink);
  const headline = headLines
    .map((l, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : headSize * 1.08}">${esc(l)}</tspan>`)
    .join("");
  const subSize = Math.round((landscape ? 29 : 34) * u);

  const headY = story ? h * 0.2 : landscape ? h * 0.3 : h * 0.26;
  const subY = headY + headLines.length * headSize * 1.08 + subSize * (landscape ? 1.2 : 1.7);

  // Motif placement: clear of text and QR card.
  const motifW = landscape ? w * 0.14 : w * 0.32;
  const motifX = landscape ? w * 0.56 : w * 0.6;
  const motifY = story ? h * 0.52 : landscape ? h * 0.08 : h * 0.42;

  // QR card: bottom-left on vertical formats, right-center on landscape.
  const qrSize = Math.round(landscape ? h * 0.36 : w * (story ? 0.2 : 0.18));
  const fontScale = (landscape ? 1.0 : 1.25) * u;
  const cardW = qrSize * 1.18;
  const cardH = qrSize + qrSize * 0.18 + 30 * fontScale;
  const qrX = landscape ? w - pad - cardW : pad;
  const qrY = landscape ? (h - cardH) / 2 : h - pad - cardH;

  // CTA pill + link block: next to QR on vertical, under the sub on landscape.
  const ctaY = landscape ? subY + 26 * fontScale : qrY + cardH * 0.18;
  const pillX = landscape ? pad : qrX + cardW + pad * 0.5;

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g1" cx="0.14" cy="0.02" r="1"><stop offset="0" stop-color="${accent.a}" stop-opacity=".5"/><stop offset=".55" stop-color="${accent.a}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="0.95" cy="0.2" r="0.9"><stop offset="0" stop-color="${accent.b}" stop-opacity=".32"/><stop offset=".6" stop-color="${accent.b}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g3" cx="0.5" cy="1.1" r="1"><stop offset="0" stop-color="${accent.a}" stop-opacity=".25"/><stop offset=".6" stop-color="${accent.a}" stop-opacity="0"/></radialGradient>
    <linearGradient id="dot" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#5ec79a"/><stop offset="1" stop-color="${accent.b}"/></linearGradient>
    <linearGradient id="rule" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="${accent.a}"/><stop offset="1" stop-color="${accent.b}"/></linearGradient>
    <filter id="grain"><feTurbulence type="fractalNoise" baseFrequency="0.9" numOctaves="2" result="n"/><feColorMatrix in="n" type="matrix" values="0 0 0 0 1  0 0 0 0 1  0 0 0 0 1  0 0 0 0.028 0"/><feComposite operator="over" in2="SourceGraphic"/></filter>
  </defs>
  <rect width="${w}" height="${h}" fill="#0a100c"/>
  <rect width="${w}" height="${h}" fill="url(#g1)"/>
  <rect width="${w}" height="${h}" fill="url(#g2)"/>
  <rect width="${w}" height="${h}" fill="url(#g3)"/>
  <rect width="${w}" height="${h}" fill="transparent" filter="url(#grain)"/>

  <g>
    <circle cx="${pad + 12 * u}" cy="${pad + 10 * u}" r="${11 * u}" fill="url(#dot)"/>
    <text x="${pad + 34 * u}" y="${pad + 20 * u}" font-family="-apple-system, 'Helvetica Neue', Helvetica, Arial" font-size="${30 * u}" font-weight="800" letter-spacing="${5 * u}" fill="#f4f6f0">EXECLINGO</text>
  </g>
  <text x="${pad}" y="${headY - headSize * 0.9}" font-family="-apple-system, Helvetica, Arial" font-size="${Math.round(24 * u * (landscape ? 1.2 : 1))}" font-weight="700" letter-spacing="${4 * u}" fill="${accent.b}">${esc(accent.kicker)}</text>
  <text x="${pad}" y="${headY}" font-family="'New York', Georgia, 'Times New Roman', serif" font-size="${headSize}" font-weight="700" fill="#f4f6f0">${headline}</text>
  <rect x="${pad}" y="${subY - subSize * 1.35}" width="${86 * u}" height="${5 * u}" rx="${2.5 * u}" fill="url(#rule)"/>
  <text x="${pad}" y="${subY}" font-family="-apple-system, Helvetica, Arial" font-size="${subSize}" fill="#c3cabe">${esc(campaign.sub)}</text>

  <g opacity=".9">${motif(campaign.id, motifX, motifY, motifW, accent.a, accent.b)}</g>

  ${glassQr(qrX, qrY, qrSize, qrInner, qrViewBox, partner.refCode, fontScale)}
  <g>
    <rect x="${pillX}" y="${ctaY}" rx="${26 * fontScale}" width="${300 * fontScale}" height="${52 * fontScale}" fill="${accent.a}"/>
    <text x="${pillX + 150 * fontScale}" y="${ctaY + 34 * fontScale}" text-anchor="middle" font-family="-apple-system, Helvetica, Arial" font-size="${20 * fontScale}" font-weight="800" fill="#ffffff">Test gratuito di 3 minuti</text>
    ${landscape
      ? `<text x="${pillX + 320 * fontScale}" y="${ctaY + 34 * fontScale}" font-family="-apple-system, Helvetica, Arial" font-size="${19 * fontScale}" font-weight="700" fill="#5ec79a">execlingo.it/r/${esc(partner.refCode)}</text>`
      : `<text x="${pillX}" y="${ctaY + 52 * fontScale + 38 * fontScale}" font-family="-apple-system, Helvetica, Arial" font-size="${19 * fontScale}" font-weight="700" fill="#5ec79a">execlingo.it/r/${esc(partner.refCode)}</text>
    <text x="${pillX}" y="${ctaY + 52 * fontScale + 72 * fontScale}" font-family="-apple-system, Helvetica, Arial" font-size="${14 * fontScale}" fill="#8d968a">In 3 mesi sei operativo in inglese</text>`}
  </g>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="execlingo-${campaign.id}-${format.id}.svg"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
