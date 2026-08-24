/**
 * Cookie consent for third-party marketing tags.
 *
 * The rule that shapes this file: in the EU an advertising pixel may not run
 * before the visitor says yes, refusing has to be exactly as easy as
 * accepting, and scrolling is not an answer. So nothing loads until there is
 * a recorded choice, and the two buttons are the same size.
 *
 * Our own first-party analytics — the funnel events and the acquisition
 * cookie — are not gated here: they never leave our database, are read only
 * in aggregate and follow nobody across other sites.
 */

export const CONSENT_COOKIE = "eb_consent";

/**
 * Bump when the set of tags changes: an old choice was made about a different
 * list of recipients, so it stops counting as consent and the banner returns.
 */
export const CONSENT_VERSION = "1";

/** Six months, then ask again — the interval the Garante considers reasonable. */
export const CONSENT_MAX_AGE_SECONDS = 180 * 24 * 60 * 60;

export type ConsentChoice = "granted" | "denied";

/** What the server-side log records — withdrawal is an event worth proving too. */
export type ConsentEvent = ConsentChoice | "withdrawn";

/**
 * Cookie layout: `version:choice:receipt`. The receipt is the id of the row
 * in the consent log, so the visitor's own device carries the key to their
 * record and we do not have to store anything identifying to find it again.
 */
function parts(cookieHeader: string | null | undefined): string[] | null {
  const raw = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  try {
    return decodeURIComponent(raw).split(":");
  } catch {
    return null;
  }
}

/** Reads a recorded choice. Returns null when there is none, or it is stale. */
export function readConsent(cookieHeader: string | null | undefined): ConsentChoice | null {
  const segments = parts(cookieHeader);
  if (!segments || segments[0] !== CONSENT_VERSION) return null;
  const choice = segments[1];
  return choice === "granted" || choice === "denied" ? choice : null;
}

/** The id of the log row this choice was written to, when there is one. */
export function readConsentReceipt(cookieHeader: string | null | undefined): string | null {
  const segments = parts(cookieHeader);
  if (!segments || segments[0] !== CONSENT_VERSION) return null;
  const receipt = segments[2]?.trim();
  return receipt && receipt.length <= 64 ? receipt : null;
}

export function consentCookieValue(choice: ConsentChoice, receipt: string): string {
  return `${CONSENT_VERSION}:${choice}:${receipt}`;
}

/**
 * The third parties in play when the question is asked, recorded alongside the
 * answer: consent to an unnamed list is not consent to anything.
 */
export function activeTagNames(): string {
  const { metaPixelId, googleAdsId, analyticsId } = marketingTags();
  return [metaPixelId ? "meta" : "", googleAdsId ? "google" : "", analyticsId ? "ga4" : ""].filter(Boolean).join(",");
}

/**
 * The tags this build would load. Read statically so Next can inline them.
 * Both empty is the normal state until advertising actually starts — and then
 * there is nothing to consent to, so no banner is shown at all.
 */
export function marketingTags(): { metaPixelId: string; googleAdsId: string; analyticsId: string } {
  return {
    metaPixelId: (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim(),
    googleAdsId: (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "").trim(),
    // Google Analytics 4. It rides the same gtag loader as the Ads tag: one
    // script, two configs, and — the reason it belongs here rather than in the
    // layout — one consent gate. An analytics tag that loads before the
    // visitor has answered the banner is the exact thing the banner exists to
    // prevent.
    analyticsId: (process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID ?? "").trim(),
  };
}

/**
 * Where a completed registration is reported in Google Ads.
 *
 * Kept as the label alone rather than the whole `send_to` string so the
 * account id lives in exactly one place: two copies of it in the environment
 * is one chance to update only one of them and lose every conversion without
 * anything appearing broken.
 */
export function googleAdsSignupTarget(): string {
  const { googleAdsId } = marketingTags();
  const label = (process.env.NEXT_PUBLIC_GOOGLE_ADS_SIGNUP_LABEL ?? "").trim();
  return googleAdsId && label ? `${googleAdsId}/${label}` : "";
}

export function hasMarketingTags(): boolean {
  // Analytics counts. Leaving it out would be a silent failure of the worst
  // kind: with only GA4 configured there would be no banner, so no consent,
  // so no analytics — and nothing anywhere saying why.
  const { metaPixelId, googleAdsId, analyticsId } = marketingTags();
  return Boolean(metaPixelId || googleAdsId || analyticsId);
}
