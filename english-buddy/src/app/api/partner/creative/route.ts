import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getUserId } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { CAMPAIGNS, FORMATS } from "@/lib/marketing-kit";

/**
 * Branded campaign creative as SVG with the partner's personal QR embedded.
 * ?campaign=<id>&format=ig|story|li — the dashboard converts to PNG client-side.
 */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = await getPartner(userId);
  if (!partner) return NextResponse.json({ error: "Non sei un partner" }, { status: 403 });

  const url = new URL(request.url);
  const campaign = CAMPAIGNS.find((c) => c.id === url.searchParams.get("campaign")) ?? CAMPAIGNS[0];
  const format = FORMATS.find((f) => f.id === url.searchParams.get("format")) ?? FORMATS[0];

  const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
  const target = `${base}/r/${partner.refCode}?campaign=${encodeURIComponent(campaign.id)}`;
  const qrSvg = await QRCode.toString(target, { type: "svg", margin: 0, color: { dark: "#0a100c", light: "#ffffff" } });
  const qrInner = qrSvg.replace(/<\?xml[^>]*\?>/, "").replace(/<svg[^>]*>/, "").replace("</svg>", "");
  const qrViewBox = qrSvg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 33 33";

  const { w, h } = format;
  const story = format.id === "story";
  const pad = Math.round(w * 0.08);
  const qrSize = Math.round(w * 0.26);
  const headSize = Math.round(w * 0.062);
  const subSize = Math.round(w * 0.034);

  // Wrap the headline into up to 3 lines.
  const words = campaign.headline.split(" ");
  const lines: string[] = [];
  let line = "";
  for (const word of words) {
    if ((line + " " + word).trim().length > 22 && line) {
      lines.push(line.trim());
      line = word;
    } else line = `${line} ${word}`;
  }
  if (line.trim()) lines.push(line.trim());
  const headline = lines
    .slice(0, 3)
    .map((l, i) => `<tspan x="${pad}" dy="${i === 0 ? 0 : headSize * 1.18}">${l.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</tspan>`)
    .join("");

  const headY = story ? h * 0.34 : h * 0.3;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <defs>
    <linearGradient id="glow" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#2f8f63" stop-opacity=".38"/><stop offset="1" stop-color="#e6a94e" stop-opacity=".14"/>
    </linearGradient>
    <linearGradient id="dot" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#5ec79a"/><stop offset="1" stop-color="#e6a94e"/>
    </linearGradient>
  </defs>
  <rect width="${w}" height="${h}" fill="#0a100c"/>
  <ellipse cx="${w * 0.15}" cy="${h * 0.05}" rx="${w * 0.6}" ry="${h * 0.3}" fill="url(#glow)"/>
  <circle cx="${pad + headSize * 0.3}" cy="${h * 0.12}" r="${headSize * 0.28}" fill="url(#dot)"/>
  <text x="${pad + headSize * 0.8}" y="${h * 0.12 + headSize * 0.22}" font-family="Helvetica, Arial, sans-serif" font-size="${subSize}" font-weight="800" letter-spacing="4" fill="#f4f6f0">EXECLINGO</text>
  <text x="${pad}" y="${headY}" font-family="Georgia, 'Times New Roman', serif" font-size="${headSize}" font-weight="700" fill="#f4f6f0">${headline}</text>
  <text x="${pad}" y="${headY + lines.length * headSize * 1.18 + subSize * 1.6}" font-family="Helvetica, Arial, sans-serif" font-size="${subSize}" fill="#cfd6c9">${campaign.sub.replace(/&/g, "&amp;").replace(/</g, "&lt;")}</text>
  <rect x="${pad - 4}" y="${h - pad - qrSize - subSize * 3.4 - 4}" width="${qrSize + 8}" height="${qrSize + 8}" rx="14" fill="#ffffff"/>
  <svg x="${pad}" y="${h - pad - qrSize - subSize * 3.4}" width="${qrSize}" height="${qrSize}" viewBox="${qrViewBox}">${qrInner}</svg>
  <text x="${pad}" y="${h - pad - subSize * 1.5}" font-family="Helvetica, Arial, sans-serif" font-size="${subSize}" font-weight="700" fill="#5ec79a">execlingo.it/r/${partner.refCode}</text>
  <text x="${pad}" y="${h - pad}" font-family="Helvetica, Arial, sans-serif" font-size="${Math.round(subSize * 0.82)}" fill="#8d968a">In 3 mesi sei operativo in inglese · Inquadra il QR per iniziare</text>
</svg>`;

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `attachment; filename="execlingo-${campaign.id}-${format.id}.svg"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
