import { NextResponse, type NextRequest } from "next/server";
import { getPartnerByCode, recordClick, ATTRIBUTION_DAYS } from "@/lib/partners";

/**
 * Partner referral entry point: /r/MARIO-XXXX?campaign=linkedin-business
 * Logs the click, sets the first-party attribution cookie and lands on the
 * public marketing page. Invalid codes still land gracefully.
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const campaign = request.nextUrl.searchParams.get("campaign")?.slice(0, 80) ?? null;
  const response = NextResponse.redirect(new URL("/", request.url), 307);
  try {
    const partner = await getPartnerByCode(code);
    if (partner && partner.status === "ACTIVE") {
      await recordClick(partner.userId, campaign);
      response.cookies.set("eb_ref", JSON.stringify({ c: partner.refCode, k: campaign }), {
        httpOnly: true,
        secure: true,
        sameSite: "lax",
        path: "/",
        maxAge: ATTRIBUTION_DAYS * 86_400,
      });
    }
  } catch {
    // A broken referral must never break the landing.
  }
  return response;
}
