/**
 * Campaign creative builder: premium dark editorial canvas with an
 * illustrated scene per campaign (video calls, Sam's chat, travel…).
 * Social formats carry no QR (the link travels in the post); the flyer
 * format embeds the partner QR for in-person/print use.
 */

export type CreativeFormat = { id: string; label: string; w: number; h: number; qr?: boolean };

export const CREATIVE_FORMATS: CreativeFormat[] = [
  { id: "ig", label: "Instagram Post", w: 1080, h: 1080 },
  { id: "story", label: "Instagram Story", w: 1080, h: 1920 },
  { id: "li", label: "LinkedIn", w: 1200, h: 1200 },
  { id: "lih", label: "LinkedIn orizzontale", w: 1200, h: 627 },
  { id: "flyer", label: "Volantino con QR", w: 1080, h: 1350, qr: true },
];

export const ACCENTS: Record<string, { a: string; b: string; kicker: string }> = {
  "business-english": { a: "#2f8f63", b: "#e6a94e", kicker: "BUSINESS ENGLISH" },
  "percorso-3-mesi": { a: "#c98a2d", b: "#5ec79a", kicker: "3-MONTH EXECUTIVE PATH" },
  "poco-tempo": { a: "#3b6ea5", b: "#5ec79a", kicker: "ON YOUR TIME" },
  "call-meeting": { a: "#4a72b0", b: "#e6a94e", kicker: "CALL & MEETING" },
  "listen-type": { a: "#7a5aa0", b: "#5ec79a", kicker: "LISTEN + TYPE" },
  "business-travel": { a: "#b0567a", b: "#e6a94e", kicker: "BUSINESS + TRAVEL" },
};

const esc = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");
const SANS = "-apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif";
const SERIF = "'New York', Georgia, 'Times New Roman', serif";

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

/** Abstract person avatar: head + shoulders, warm rim light. Premium-flat. */
function avatar(cx: number, cy: number, r: number, tone: string, rim: string): string {
  return `<g>
    <circle cx="${cx}" cy="${cy - r * 0.35}" r="${r * 0.42}" fill="${tone}"/>
    <path d="M ${cx - r * 0.75} ${cy + r * 0.85} q 0 ${-r * 0.95} ${r * 0.75} ${-r * 0.95} q ${r * 0.75} 0 ${r * 0.75} ${r * 0.95} z" fill="${tone}"/>
    <path d="M ${cx - r * 0.28} ${cy - r * 0.68} a ${r * 0.42} ${r * 0.42} 0 0 1 ${r * 0.62} ${r * 0.18}" fill="none" stroke="${rim}" stroke-width="${r * 0.09}" stroke-linecap="round" opacity=".85"/>
  </g>`;
}

// ---------- scenes: drawn inside box (x, y, w, h) ----------

function sceneCall(x: number, y: number, w: number, h: number, a: string, b: string): string {
  const W = Math.min(w, h * 1.5);
  const X = x + (w - W) / 2;
  const tile = (tx: number, ty: number, tw: number, th: number, tone: string, active: boolean, name: string) => `
    <rect x="${tx}" y="${ty}" width="${tw}" height="${th}" rx="${tw * 0.07}" fill="#161d18" stroke="${active ? b : "#2a332c"}" stroke-width="${active ? W * 0.006 : W * 0.003}"/>
    ${avatar(tx + tw / 2, ty + th * 0.52, th * 0.34, tone, active ? b : "#3c463e")}
    <rect x="${tx + tw * 0.08}" y="${ty + th * 0.82}" width="${tw * 0.36}" height="${th * 0.09}" rx="${th * 0.045}" fill="#232b25"/>
    ${active ? `<g>${[0.62, 0.7, 0.78, 0.86].map((f, i) => `<rect x="${tx + tw * f}" y="${ty + th * (0.8 - (i % 2) * 0.05)}" width="${tw * 0.035}" height="${th * (0.12 + (i % 2) * 0.05)}" rx="${tw * 0.017}" fill="${b}"/>`).join("")}</g>` : ""}
    <title>${name}</title>`;
  const gap = W * 0.025;
  const tw = (W - gap) / 2;
  const th = h * 0.36;
  const topY = y + h * 0.08;
  return `<g>
    <rect x="${X - W * 0.02}" y="${y}" width="${W * 1.04}" height="${h * 0.06}" rx="${h * 0.03}" fill="#161d18"/>
    <circle cx="${X + W * 0.03}" cy="${y + h * 0.03}" r="${h * 0.011}" fill="#c4483a"/>
    <circle cx="${X + W * 0.065}" cy="${y + h * 0.03}" r="${h * 0.011}" fill="${b}"/>
    <circle cx="${X + W * 0.1}" cy="${y + h * 0.03}" r="${h * 0.011}" fill="${a}"/>
    <text x="${X + W * 0.98}" y="${y + h * 0.042}" text-anchor="end" font-family="${SANS}" font-size="${h * 0.032}" font-weight="700" fill="#8d968a">Meeting · EN</text>
    ${tile(X, topY, tw, th, a, false, "p1")}
    ${tile(X + tw + gap, topY, tw, th, "#7a5aa0", true, "p2")}
    ${tile(X, topY + th + gap, tw, th, "#b0567a", false, "p3")}
    ${tile(X + tw + gap, topY + th + gap, tw, th, "#3b6ea5", false, "p4")}
    <rect x="${X + W * 0.3}" y="${y + h * 0.88}" width="${W * 0.4}" height="${h * 0.1}" rx="${h * 0.05}" fill="#161d18"/>
    <circle cx="${X + W * 0.4}" cy="${y + h * 0.93}" r="${h * 0.028}" fill="#232b25" stroke="#3c463e" stroke-width="1.5"/>
    <circle cx="${X + W * 0.5}" cy="${y + h * 0.93}" r="${h * 0.028}" fill="#232b25" stroke="#3c463e" stroke-width="1.5"/>
    <circle cx="${X + W * 0.6}" cy="${y + h * 0.93}" r="${h * 0.028}" fill="#c4483a"/>
  </g>`;
}

function sceneChat(x: number, y: number, w: number, h: number, a: string, b: string): string {
  const pw = Math.min(w * 0.52, h * 0.62);
  const ph = h;
  const px = x + (w - pw) / 2;
  const r = pw * 0.12;
  const bub = (bx: number, by: number, bw: number, bh: number, fill: string) =>
    `<rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bh * 0.3}" fill="${fill}"/>`;
  return `<g>
    <rect x="${px}" y="${y}" width="${pw}" height="${ph}" rx="${r}" fill="#10150f" stroke="#2a332c" stroke-width="${pw * 0.012}"/>
    <rect x="${px + pw * 0.32}" y="${y + ph * 0.022}" width="${pw * 0.36}" height="${ph * 0.02}" rx="${ph * 0.01}" fill="#232b25"/>
    <circle cx="${px + pw * 0.14}" cy="${y + ph * 0.1}" r="${pw * 0.055}" fill="${a}"/>
    <text x="${px + pw * 0.14}" y="${y + ph * 0.115}" text-anchor="middle" font-family="${SERIF}" font-size="${pw * 0.055}" font-weight="700" fill="#0a100c">S</text>
    <text x="${px + pw * 0.23}" y="${y + ph * 0.095}" font-family="${SANS}" font-size="${pw * 0.052}" font-weight="700" fill="#f4f6f0">Sam</text>
    <text x="${px + pw * 0.23}" y="${y + ph * 0.125}" font-family="${SANS}" font-size="${pw * 0.036}" fill="#5ec79a">il tuo coach</text>
    ${bub(px + pw * 0.08, y + ph * 0.18, pw * 0.66, ph * 0.075, "#1c241e")}
    <text x="${px + pw * 0.13}" y="${y + ph * 0.228}" font-family="${SANS}" font-size="${pw * 0.042}" fill="#cfd6c9">Ready for your call?</text>
    ${bub(px + pw * 0.28, y + ph * 0.28, pw * 0.62, ph * 0.075, a)}
    <text x="${px + pw * 0.33}" y="${y + ph * 0.328}" font-family="${SANS}" font-size="${pw * 0.042}" fill="#ffffff">Yes, I am agree</text>
    ${bub(px + pw * 0.08, y + ph * 0.38, pw * 0.74, ph * 0.115, "#1c241e")}
    <text x="${px + pw * 0.13}" y="${y + ph * 0.425}" font-family="${SANS}" font-size="${pw * 0.04}" fill="#cfd6c9">Almost! Say: <tspan font-weight="800" fill="${b}">&#8220;I agree&#8221;</tspan></text>
    <text x="${px + pw * 0.13}" y="${y + ph * 0.468}" font-family="${SANS}" font-size="${pw * 0.036}" fill="#8d968a">agree non vuole &#8220;am&#8221; &#10003;</text>
    ${bub(px + pw * 0.28, y + ph * 0.53, pw * 0.5, ph * 0.075, a)}
    <text x="${px + pw * 0.33}" y="${y + ph * 0.578}" font-family="${SANS}" font-size="${pw * 0.042}" fill="#ffffff">I agree &#128077;</text>
    <rect x="${px + pw * 0.08}" y="${y + ph * 0.66}" width="${pw * 0.84}" height="${ph * 0.07}" rx="${ph * 0.035}" fill="#161d18" stroke="#2a332c" stroke-width="1.5"/>
    <circle cx="${px + pw * 0.85}" cy="${y + ph * 0.695}" r="${ph * 0.024}" fill="${a}"/>
    <text x="${px + pw * 0.13}" y="${y + ph * 0.703}" font-family="${SANS}" font-size="${pw * 0.038}" fill="#5c665e">Message Sam…</text>
  </g>`;
}

function sceneTime(x: number, y: number, w: number, h: number, a: string, b: string): string {
  const cx = x + w / 2;
  const cy = y + h * 0.44;
  const R = Math.min(w, h) * 0.32;
  const ticks = Array.from({ length: 12 }, (_, i) => {
    const ang = (i * 30 * Math.PI) / 180;
    const r1 = R * 0.88;
    const r2 = i % 3 === 0 ? R * 0.76 : R * 0.82;
    return `<line x1="${cx + r1 * Math.sin(ang)}" y1="${cy - r1 * Math.cos(ang)}" x2="${cx + r2 * Math.sin(ang)}" y2="${cy - r2 * Math.cos(ang)}" stroke="#3c463e" stroke-width="${R * 0.035}" stroke-linecap="round"/>`;
  }).join("");
  const chip = (t: string, dx: number, dy: number, hot: boolean) => `
    <rect x="${cx + dx - R * 0.34}" y="${cy + dy - R * 0.2}" width="${R * 0.68}" height="${R * 0.4}" rx="${R * 0.2}" fill="${hot ? a : "#161d18"}" stroke="${hot ? a : "#2a332c"}" stroke-width="2"/>
    <text x="${cx + dx}" y="${cy + dy + R * 0.075}" text-anchor="middle" font-family="${SERIF}" font-size="${R * 0.22}" font-weight="700" fill="${hot ? "#ffffff" : "#aeb6a9"}">${t}</text>`;
  return `<g>
    <circle cx="${cx}" cy="${cy}" r="${R}" fill="#10150f" stroke="#2a332c" stroke-width="${R * 0.04}"/>
    ${ticks}
    <line x1="${cx}" y1="${cy}" x2="${cx}" y2="${cy - R * 0.55}" stroke="${b}" stroke-width="${R * 0.05}" stroke-linecap="round"/>
    <line x1="${cx}" y1="${cy}" x2="${cx + R * 0.38}" y2="${cy + R * 0.12}" stroke="#f4f6f0" stroke-width="${R * 0.035}" stroke-linecap="round"/>
    <circle cx="${cx}" cy="${cy}" r="${R * 0.06}" fill="${b}"/>
    ${chip("2'", -R * 1.05, -R * 0.55, false)}
    ${chip("5'", -R * 1.18, R * 0.5, false)}
    ${chip("20'", R * 1.15, -R * 0.05, true)}
  </g>`;
}

function scenePath(x: number, y: number, w: number, h: number, a: string, b: string): string {
  const stepW = w * 0.26;
  const baseY = y + h * 0.86;
  const step = (i: number, sh: number, label: string) => `
    <rect x="${x + w * 0.06 + i * stepW * 1.15}" y="${baseY - sh}" width="${stepW}" height="${sh}" rx="${stepW * 0.09}" fill="#161d18" stroke="#2a332c" stroke-width="2"/>
    <rect x="${x + w * 0.06 + i * stepW * 1.15}" y="${baseY - sh}" width="${stepW}" height="${stepW * 0.09}" rx="${stepW * 0.045}" fill="${i === 2 ? b : a}" opacity="${0.5 + i * 0.25}"/>
    <text x="${x + w * 0.06 + i * stepW * 1.15 + stepW / 2}" y="${baseY + h * 0.09}" text-anchor="middle" font-family="${SANS}" font-size="${h * 0.055}" font-weight="700" letter-spacing="1" fill="#8d968a">${label}</text>`;
  const figX = x + w * 0.06 + 1.15 * stepW + stepW / 2;
  const figY = baseY - h * 0.44;
  const flagX = x + w * 0.06 + 2.3 * stepW + stepW / 2;
  const flagY = baseY - h * 0.62;
  return `<g>
    ${step(0, h * 0.24, "MESE 1")}
    ${step(1, h * 0.44, "MESE 2")}
    ${step(2, h * 0.62, "MESE 3")}
    ${avatar(figX, figY - h * 0.05, h * 0.105, "#e8ebe4", b)}
    <line x1="${flagX}" y1="${flagY}" x2="${flagX}" y2="${flagY - h * 0.16}" stroke="#e8ebe4" stroke-width="${h * 0.012}" stroke-linecap="round"/>
    <path d="M ${flagX} ${flagY - h * 0.16} l ${w * 0.1} ${h * 0.035} l ${-w * 0.1} ${h * 0.035} z" fill="${b}"/>
    <text x="${flagX + w * 0.02}" y="${flagY - h * 0.112}" font-family="${SANS}" font-size="${h * 0.032}" font-weight="800" fill="#0a100c">EN</text>
  </g>`;
}

function sceneListen(x: number, y: number, w: number, h: number, a: string, b: string): string {
  const cx = x + w / 2;
  const pw = Math.min(w * 0.6, h * 0.9);
  const px = cx - pw / 2;
  const py = y + h * 0.16;
  const ph = h * 0.66;
  const bars = Array.from({ length: 14 }, (_, i) => {
    const bh = [0.2, 0.42, 0.62, 0.82, 0.6, 0.4, 0.68, 0.9, 0.55, 0.35, 0.62, 0.44, 0.26, 0.16][i];
    return `<rect x="${px + pw * 0.12 + i * pw * 0.056}" y="${py + ph * 0.36 - (ph * 0.24 * bh) / 2}" width="${pw * 0.028}" height="${ph * 0.24 * bh}" rx="${pw * 0.014}" fill="${i % 3 === 0 ? a : i % 3 === 1 ? "#5ec79a" : b}"/>`;
  }).join("");
  const keyRow = (ky: number, keys: number, off: number) =>
    Array.from({ length: keys }, (_, i) =>
      `<rect x="${px + pw * (0.1 + off) + i * pw * ((0.8 - 2 * off) / keys)}" y="${ky}" width="${pw * ((0.8 - 2 * off) / keys) * 0.82}" height="${ph * 0.055}" rx="${pw * 0.012}" fill="#232b25"/>`
    ).join("");
  const cupY = py + ph * 0.3;
  const arcR = Math.min(pw * 0.62, (cupY - y) * 0.92);
  return `<g>
    <path d="M ${cx - arcR} ${cupY} a ${arcR} ${arcR} 0 0 1 ${arcR * 2} 0" fill="none" stroke="${a}" stroke-width="${pw * 0.035}" stroke-linecap="round" opacity=".9"/>
    <rect x="${cx - arcR - pw * 0.05}" y="${cupY - ph * 0.04}" width="${pw * 0.1}" height="${ph * 0.22}" rx="${pw * 0.05}" fill="${a}"/>
    <rect x="${cx + arcR - pw * 0.05}" y="${cupY - ph * 0.04}" width="${pw * 0.1}" height="${ph * 0.22}" rx="${pw * 0.05}" fill="${a}"/>
    <rect x="${px}" y="${py}" width="${pw}" height="${ph}" rx="${pw * 0.1}" fill="#10150f" stroke="#2a332c" stroke-width="${pw * 0.012}"/>
    <text x="${cx}" y="${py + ph * 0.16}" text-anchor="middle" font-family="${SANS}" font-size="${ph * 0.06}" font-weight="700" fill="#cfd6c9">Listen&#8230;</text>
    ${bars}
    <text x="${cx}" y="${py + ph * 0.6}" text-anchor="middle" font-family="${SANS}" font-size="${ph * 0.05}" fill="#8d968a">&#8230;then type what you heard</text>
    ${keyRow(py + ph * 0.68, 9, 0)}
    ${keyRow(py + ph * 0.76, 8, 0.03)}
    ${keyRow(py + ph * 0.84, 6, 0.1)}
  </g>`;
}

function sceneTravel(x: number, y: number, w: number, h: number, a: string, b: string): string {
  const bw = Math.min(w * 0.86, h * 1.4);
  const bx = x + (w - bw) / 2;
  const by = y + h * 0.08;
  const bh = h * 0.56;
  const row = (ry: number, city: string, status: string, hot: boolean) => `
    <text x="${bx + bw * 0.06}" y="${ry}" font-family="${SANS}" font-size="${bh * 0.09}" font-weight="${hot ? 800 : 500}" letter-spacing="2" fill="${hot ? "#f4f6f0" : "#5c665e"}">${city}</text>
    <text x="${bx + bw * 0.94}" y="${ry}" text-anchor="end" font-family="${SANS}" font-size="${bh * 0.09}" font-weight="${hot ? 800 : 500}" letter-spacing="2" fill="${hot ? b : "#5c665e"}">${status}</text>`;
  return `<g>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh}" rx="${bw * 0.03}" fill="#10150f" stroke="#2a332c" stroke-width="2"/>
    <rect x="${bx}" y="${by}" width="${bw}" height="${bh * 0.16}" rx="${bw * 0.03}" fill="#161d18"/>
    <text x="${bx + bw * 0.06}" y="${by + bh * 0.115}" font-family="${SANS}" font-size="${bh * 0.085}" font-weight="800" letter-spacing="3" fill="#f4f6f0">DEPARTURES</text>
    <circle cx="${bx + bw * 0.9}" cy="${by + bh * 0.08}" r="${bh * 0.035}" fill="${b}"/>
    ${row(by + bh * 0.34, "LONDON", "BOARDING", true)}
    ${row(by + bh * 0.52, "NEW YORK", "ON TIME", false)}
    ${row(by + bh * 0.7, "FRANKFURT", "ON TIME", false)}
    ${row(by + bh * 0.88, "SINGAPORE", "GATE 12", false)}
    <path d="M ${x + w * 0.12} ${y + h * 0.92} Q ${x + w * 0.5} ${y + h * 0.62} ${x + w * 0.88} ${y + h * 0.78}" fill="none" stroke="${a}" stroke-width="${h * 0.012}" stroke-dasharray="${h * 0.03} ${h * 0.025}" stroke-linecap="round"/>
    ${avatar(x + w * 0.16, y + h * 0.84, h * 0.075, "#e8ebe4", b)}
    <rect x="${x + w * 0.205}" y="${y + h * 0.83}" width="${h * 0.05}" height="${h * 0.085}" rx="${h * 0.012}" fill="#2a332c" stroke="#3c463e" stroke-width="1.5"/>
    <g transform="translate(${x + w * 0.86} ${y + h * 0.76}) rotate(24)">
      <path d="M 0 0 L ${-w * 0.075} ${-h * 0.016} L ${-w * 0.062} 0 L ${-w * 0.075} ${h * 0.016} z" fill="#f4f6f0"/>
      <path d="M ${-w * 0.062} 0 L ${-w * 0.07} ${h * 0.03} L ${-w * 0.055} ${h * 0.008} z" fill="#c3cabe"/>
    </g>
  </g>`;
}

export function sceneFor(id: string, x: number, y: number, w: number, h: number, a: string, b: string): string {
  switch (id) {
    case "call-meeting": return sceneCall(x, y, w, h, a, b);
    case "business-english": return sceneChat(x, y, w, h, a, b);
    case "poco-tempo": return sceneTime(x, y, w, h, a, b);
    case "percorso-3-mesi": return scenePath(x, y, w, h, a, b);
    case "listen-type": return sceneListen(x, y, w, h, a, b);
    case "business-travel": return sceneTravel(x, y, w, h, a, b);
    default: return sceneChat(x, y, w, h, a, b);
  }
}

export function buildCreativeSvg(input: {
  campaignId: string;
  headline: string;
  sub: string;
  format: CreativeFormat;
  refCode: string;
  qrInner?: string;
  qrViewBox?: string;
}): string {
  const { format } = input;
  const accent = ACCENTS[input.campaignId] ?? ACCENTS["business-english"];
  const { w, h } = format;
  const landscape = w > h;
  const story = h / w > 1.4;
  const u = w / 1080;
  const pad = Math.round(w * (landscape ? 0.055 : 0.074));
  const withQr = Boolean(format.qr && input.qrInner);

  const headLines = wrap(input.headline, landscape ? 17 : 18, 4);
  const headShrink = headLines.length >= 4 ? 0.82 : headLines.length === 3 ? 0.94 : 1;
  const headSize = Math.round((landscape ? 62 : story ? 84 : 78) * u * (landscape ? 1.18 : 1) * headShrink);
  const headline = headLines
    .map((l, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : headSize * 1.08}">${esc(l)}</tspan>`)
    .join("");
  const subSize = Math.round((landscape ? 29 : 33) * u);
  const headY = story ? h * 0.145 : landscape ? h * 0.3 : h * 0.19;
  const subY = headY + headLines.length * headSize * 1.08 + subSize * (landscape ? 1.2 : 1.5);
  // Landscape: the sub shares the row with the scene, so wrap it inside the left column.
  const subLines = landscape ? wrap(input.sub, 30, 2) : [input.sub];
  const subTspans = subLines
    .map((l, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : subSize * 1.25}">${esc(l)}</tspan>`)
    .join("");

  // Scene box
  const sceneX = landscape ? w * 0.52 : pad * 0.6;
  const sceneW = landscape ? w * 0.44 : w - pad * 1.2;
  const sceneY = landscape ? h * 0.12 : subY + subSize * (story ? 1.6 : 1.1);
  const bottomBlockH = (withQr ? 200 : 120) * u;
  const sceneH = (landscape ? h * 0.76 : h - pad - bottomBlockH - sceneY) * (landscape ? 1 : 0.98);

  // Bottom-left CTA block
  const fontScale = (landscape ? 1.0 : 1.2) * u;
  const ctaY = landscape ? subY + (subLines.length - 1) * subSize * 1.25 + 26 * fontScale : h - pad - 92 * fontScale;

  // Flyer QR card bottom-right
  const qrSize = Math.round(w * 0.17);
  const cardW = qrSize * 1.18;
  const cardH = qrSize + qrSize * 0.18 + 26 * fontScale;
  const qrX = w - pad - cardW;
  const qrY = h - pad * 0.8 - cardH;

  return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <radialGradient id="g1" cx="0.14" cy="0.02" r="1"><stop offset="0" stop-color="${accent.a}" stop-opacity=".5"/><stop offset=".55" stop-color="${accent.a}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g2" cx="0.95" cy="0.2" r="0.9"><stop offset="0" stop-color="${accent.b}" stop-opacity=".3"/><stop offset=".6" stop-color="${accent.b}" stop-opacity="0"/></radialGradient>
    <radialGradient id="g3" cx="0.5" cy="1.1" r="1"><stop offset="0" stop-color="${accent.a}" stop-opacity=".24"/><stop offset=".6" stop-color="${accent.a}" stop-opacity="0"/></radialGradient>
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
    <text x="${pad + 34 * u}" y="${pad + 20 * u}" font-family="${SANS}" font-size="${30 * u}" font-weight="800" letter-spacing="${5 * u}" fill="#f4f6f0">EXECLINGO</text>
  </g>
  <text x="${pad}" y="${headY - headSize * 0.9}" font-family="${SANS}" font-size="${Math.round(24 * u * (landscape ? 1.2 : 1))}" font-weight="700" letter-spacing="${4 * u}" fill="${accent.b}">${esc(accent.kicker)}</text>
  <text x="${pad}" y="${headY}" font-family="${SERIF}" font-size="${headSize}" font-weight="700" fill="#f4f6f0">${headline}</text>
  <rect x="${pad}" y="${subY - subSize * 1.3}" width="${86 * u}" height="${5 * u}" rx="${2.5 * u}" fill="url(#rule)"/>
  <text x="${pad}" y="${subY}" font-family="${SANS}" font-size="${subSize}" fill="#c3cabe">${subTspans}</text>

  ${sceneFor(input.campaignId, sceneX, sceneY, sceneW, Math.max(sceneH, 100), accent.a, accent.b)}

  <g>
    <rect x="${pad}" y="${ctaY}" rx="${26 * fontScale}" width="${300 * fontScale}" height="${52 * fontScale}" fill="${accent.a}"/>
    <text x="${pad + 150 * fontScale}" y="${ctaY + 34 * fontScale}" text-anchor="middle" font-family="${SANS}" font-size="${20 * fontScale}" font-weight="800" fill="#ffffff">Test gratuito di 3 minuti</text>
    <text x="${pad + 320 * fontScale}" y="${ctaY + 34 * fontScale}" font-family="${SANS}" font-size="${20 * fontScale}" font-weight="700" fill="#5ec79a">execlingo.it</text>
  </g>

  ${withQr
    ? `<g>
    <rect x="${qrX}" y="${qrY}" width="${cardW}" height="${cardH}" rx="${qrSize * 0.12}" fill="#ffffff" opacity=".97"/>
    <svg x="${qrX + qrSize * 0.09}" y="${qrY + qrSize * 0.09}" width="${qrSize}" height="${qrSize}" viewBox="${input.qrViewBox}">${input.qrInner}</svg>
    <text x="${qrX + cardW / 2}" y="${qrY + qrSize + qrSize * 0.155 + 10 * fontScale}" text-anchor="middle" font-family="${SANS}" font-size="${10.5 * fontScale}" font-weight="700" letter-spacing="${0.4 * fontScale}" fill="#1c241e">INQUADRA · PROVA GRATIS</text>
  </g>
  <text x="${pad}" y="${h - pad * 0.9}" font-family="${SANS}" font-size="${15 * fontScale}" fill="#8d968a">Codice partner: <tspan font-weight="700" fill="#5ec79a">${esc(input.refCode)}</tspan> · In 3 mesi sei operativo in inglese</text>`
    : ""}
</svg>`;
}
