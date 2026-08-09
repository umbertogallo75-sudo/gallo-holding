import { NextResponse } from "next/server";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";

const bodySchema = z.object({
  name: z.enum(["landing_view", "landing_cta_register", "landing_cta_login", "landing_cta_aziende"]),
  visitorId: z.string().min(8).max(64).optional(),
  ref: z.string().max(200).optional(),
});

/** Public beacon endpoint for pre-login funnel events (landing page). */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "track"), 60, 60_000).allowed) {
    return NextResponse.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, visitorId, ref } = parsed.data;
  await trackEvent(name, { visitorId, meta: ref ? { ref } : undefined });
  return NextResponse.json({ ok: true });
}
