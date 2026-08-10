import { NextResponse } from "next/server";
import QRCode from "qrcode";
import { getUserId } from "@/lib/auth";
import { getPartner } from "@/lib/partners";

/** Personal referral QR (PNG). ?campaign=xyz appends campaign attribution. */
export async function GET(request: Request) {
  const userId = await getUserId();
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });
  const partner = await getPartner(userId);
  if (!partner) return NextResponse.json({ error: "Non sei un partner" }, { status: 403 });

  const campaign = new URL(request.url).searchParams.get("campaign")?.slice(0, 80);
  const base = (process.env.APP_BASE_URL || "https://www.execlingo.it").replace(/\/$/, "");
  const target = `${base}/r/${partner.refCode}${campaign ? `?campaign=${encodeURIComponent(campaign)}` : ""}`;

  const png = await QRCode.toBuffer(target, { width: 640, margin: 2, color: { dark: "#0a100c", light: "#ffffff" } });
  return new NextResponse(new Uint8Array(png), {
    headers: {
      "Content-Type": "image/png",
      "Content-Disposition": `attachment; filename="execlingo-qr-${partner.refCode}.png"`,
      "Cache-Control": "private, max-age=3600",
    },
  });
}
