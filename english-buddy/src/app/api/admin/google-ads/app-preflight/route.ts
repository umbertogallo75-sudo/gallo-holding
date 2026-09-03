import { NextResponse } from "next/server";
import { getAuthSession } from "@/lib/auth";
import { isAdminUser } from "@/lib/admin-access";
import { validateGoogleAdsAppCampaignPreflight } from "@/lib/marketing/google-ads-app-preflight";

export const dynamic = "force-dynamic";
export const maxDuration = 30;

function json(body: Record<string, unknown>, status = 200) {
  return NextResponse.json(body, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

/**
 * Validates the fixed ExecLingo Android App campaign server-side. The request
 * body is intentionally never read: the client cannot inject campaign data.
 * Google Ads receives validateOnly=true, so this route cannot create resources
 * or enable spending.
 */
export async function POST(request: Request) {
  const origin = request.headers.get("origin");
  if (!origin || origin !== new URL(request.url).origin) {
    return json({ error: "Richiesta non autorizzata." }, 403);
  }

  const session = await getAuthSession();
  if (!session || !(await isAdminUser(session.userId, session.method))) {
    return json({ error: "Sessione ADMIN non valida. Accedi nuovamente." }, 403);
  }

  const result = await validateGoogleAdsAppCampaignPreflight();
  const status = result.status === "valid"
    ? 200
    : result.status === "invalid"
      ? 422
      : result.status === "not_configured"
        ? 503
        : 502;

  return json(result, status);
}
