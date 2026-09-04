import { NextResponse } from "next/server";
import { z } from "zod";
import { trackEvent } from "@/lib/analytics";
import { clientKey, rateLimit } from "@/lib/rate-limit";
import { getUserId } from "@/lib/auth";

const bodySchema = z.object({
  name: z.enum([
    "page_view",
    "landing_view",
    "landing_cta_register",
    "landing_cta_login",
    "landing_cta_aziende",
    "landing_cta_professionisti",
    "landing_download",
    // A tap on a store button is the last thing we can see: the install and any
    // purchase happen inside Apple's or Google's app, where no campaign
    // parameter reaches. Recording it here at least keeps "ad click → store"
    // measurable per channel.
    "landing_store_cta",
    "landing_store_ios",
    "landing_store_android",
    // Inside the app: the path from the three questions to a session that
    // actually happened. Without these the redesign is an opinion — nobody
    // could say whether people finish onboarding, or whether the one card on
    // the home screen is the one they tap.
    "onboarding_started",
    "onboarding_done",
    "onboarding_skipped",
    "plan_shown",
    "first_session_started",
    "first_session_done",
    "home_session_start",
    "home_shortcut",
    "home_all_trainings",
    "home_rail",
    "voice_invite",
    "chat_starter",
    "first_step",
    "tour_end",
    "doc_train",
    "personalize_shown",
    "personalize_dismissed",
    // Middle of the funnel. The server records the rest itself, where it can
    // see the truth rather than what a page chose to report.
    "prices_shown",
    "checkout_started",
    "checkout_cancelled",
  ]),
  visitorId: z.string().min(8).max(64).optional(),
  ref: z.string().max(200).optional(),
  src: z.string().max(60).optional(),
  medium: z.string().max(60).optional(),
  campaign: z.string().max(80).optional(),
  page: z.string().max(60).optional(),
  where: z.string().max(20).optional(),
});

/** Public beacon endpoint for pre-login funnel events (landing page). */
export async function POST(request: Request) {
  if (!rateLimit(clientKey(request, "track"), 60, 60_000).allowed) {
    return NextResponse.json({ ok: true });
  }
  const parsed = bodySchema.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: "Invalid request" }, { status: 400 });
  const { name, visitorId, ref, src, medium, campaign, page, where } = parsed.data;

  // Only non-empty keys, so `json_extract(meta, '$.src')` in the funnel query
  // reads null for untagged traffic instead of an empty string.
  const meta: Record<string, string> = {};
  if (ref) meta.ref = ref;
  if (src) meta.src = src;
  if (medium) meta.medium = medium;
  if (campaign) meta.campaign = campaign;
  if (page) meta.page = page;
  if (where) meta.where = where;

  // Signed-in events belong to a person, not just a browser: it is the only
  // way to ask whether the people who finished onboarding are the ones who
  // came back.
  const userId = await getUserId().catch(() => null);

  await trackEvent(name, { visitorId, userId, meta: Object.keys(meta).length ? meta : undefined });
  return NextResponse.json({ ok: true });
}
