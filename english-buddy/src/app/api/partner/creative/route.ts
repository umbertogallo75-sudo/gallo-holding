import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getUserId } from "@/lib/auth";
import { getPartner } from "@/lib/partners";
import { CAMPAIGNS } from "@/lib/marketing-kit";
import { buildCreativeSvg, CREATIVE_FORMATS } from "@/lib/creative";

/**
 * Campaign creatives as SVG. Social formats are pure visuals (the partner's
 * link travels in the post copy); only the flyer format embeds the QR for
 * print/in-person use. ?inline=1 serves for <img> previews.
 */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = await getPartner(userId);
  if (!partner) return NextResponse.json({ error: "Non sei un partner" }, { status: 403 });

  const url = new URL(request.url);
  const campaign = CAMPAIGNS.find((c) => c.id === url.searchParams.get("campaign")) ?? CAMPAIGNS[0];
  const format = CREATIVE_FORMATS.find((f) => f.id === url.searchParams.get("format")) ?? CREATIVE_FORMATS[0];
  const inline = url.searchParams.get("inline") === "1";

  let qrInner: string | undefined;
  let qrViewBox: string | undefined;
  if (format.qr) {
    const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
    const target = `${base}/r/${partner.refCode}?campaign=${encodeURIComponent(campaign.id)}`;
    const qrSvg = await QRCode.toString(target, { type: "svg", margin: 0, color: { dark: "#101511", light: "#ffffff" } });
    qrInner = qrSvg.replace(/<\?xml[^>]*\?>/, "").replace(/<svg[^>]*>/, "").replace("</svg>", "");
    qrViewBox = qrSvg.match(/viewBox="([^"]+)"/)?.[1] ?? "0 0 33 33";
  }

  const svg = buildCreativeSvg({
    campaignId: campaign.id,
    headline: campaign.headline,
    sub: campaign.sub,
    format,
    refCode: partner.refCode,
    qrInner,
    qrViewBox,
  });

  return new NextResponse(svg, {
    headers: {
      "Content-Type": "image/svg+xml",
      "Content-Disposition": `${inline ? "inline" : "attachment"}; filename="execlingo-${campaign.id}-${format.id}.svg"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
