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

/** Fired once the consent-gated browser queues are ready to accept events. */
export const MARKETING_TAGS_READY_EVENT = "execlingo:marketing-tags-ready";

/** Public GA4 Measurement ID assigned to the ExecLingo web stream. */
export const GA4_MEASUREMENT_ID = "G-Y5BX21MQYQ";

/** Public LinkedIn identifier assigned to ExecLingo; it is not a secret. */
export const LINKEDIN_PARTNER_ID = "9624362";

/** Public event-specific ID for ExecLingo's completed-registration conversion. */
export const LINKEDIN_SIGNUP_CONVERSION_ID = "29840122";

/** Public TikTok Pixel ID assigned to the ExecLingo website data source. */
export const TIKTOK_PIXEL_ID = "DAD8VUBC77UC8FLJL7O0";

/**
 * Bump when the set of tags changes: an old choice was made about a different
 * list of recipients, so it stops counting as consent and the banner returns.
 */
export const CONSENT_VERSION = "3";

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
  if (!segments) return null;
  const choice = segments[1];
  // Adding a new advertising provider requires a fresh yes, but a visitor who
  // already refused every optional marketing tag must not be asked again.
  if (segments[0] === "2" && choice === "denied") return "denied";
  if (segments[0] !== CONSENT_VERSION) return null;
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
  const { metaPixelId, googleAdsId, analyticsId, linkedinPartnerId, tiktokPixelId } = marketingTags();
  return [
    metaPixelId ? "meta" : "",
    googleAdsId ? "google" : "",
    analyticsId ? "ga4" : "",
    linkedinPartnerId ? "linkedin" : "",
    tiktokPixelId ? "tiktok" : "",
  ].filter(Boolean).join(",");
}

/**
 * The checked-in Measurement ID is a production convenience, not a preview
 * default. In the browser the hostname is the reliable distinction because a
 * Vercel preview is also compiled with NODE_ENV=production. On the server use
 * VERCEL_ENV when available and preserve the production build fallback for
 * non-Vercel deployments.
 */
function productionFallbackEnabled(): boolean {
  if (typeof window !== "undefined") {
    const hostname = window.location?.hostname?.toLowerCase() ?? "";
    return hostname === "execlingo.it" || hostname === "www.execlingo.it";
  }
  const vercelEnv = (process.env.VERCEL_ENV ?? "").trim().toLowerCase();
  if (vercelEnv) return vercelEnv === "production";
  return process.env.NODE_ENV === "production";
}

function analyticsMeasurementId(): string {
  const configured = process.env.NEXT_PUBLIC_GA_MEASUREMENT_ID;
  if (configured !== undefined) return configured.trim();
  return productionFallbackEnabled() ? GA4_MEASUREMENT_ID : "";
}

function tiktokPixelId(): string {
  const configured = process.env.NEXT_PUBLIC_TIKTOK_PIXEL_ID;
  if (configured !== undefined) return configured.trim();
  return productionFallbackEnabled() ? TIKTOK_PIXEL_ID : "";
}

/**
 * The tags this build would load. Read statically so Next can inline them.
 * Advertising identifiers are public by design: they are visible in every
 * browser that loads the corresponding tag.
 */
export function marketingTags(): {
  metaPixelId: string;
  googleAdsId: string;
  analyticsId: string;
  linkedinPartnerId: string;
  tiktokPixelId: string;
} {
  return {
    metaPixelId: (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim(),
    googleAdsId: (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "").trim(),
    // Google Analytics 4. It rides the same gtag loader as the Ads tag: one
    // script, two configs, and — the reason it belongs here rather than in the
    // layout — one consent gate. An analytics tag that loads before the
    // visitor has answered the banner is the exact thing the banner exists to
    // prevent.
    analyticsId: analyticsMeasurementId(),
    // The production tag requested in LinkedIn Campaign Manager. Keeping the
    // public id as a fallback makes preview and production behave identically;
    // an explicit empty environment value can still disable it.
    linkedinPartnerId: (process.env.NEXT_PUBLIC_LINKEDIN_PARTNER_ID ?? LINKEDIN_PARTNER_ID).trim(),
    // TikTok is enabled by fallback only on the real ExecLingo host. Preview
    // deployments must never contaminate the production Pixel.
    tiktokPixelId: tiktokPixelId(),
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

/**
 * Numeric ID generated by LinkedIn for the event-specific signup conversion.
 * Invalid or missing values disable only this conversion, never registration.
 */
export function linkedinSignupConversionId(): number | null {
  const raw = (
    process.env.NEXT_PUBLIC_LINKEDIN_SIGNUP_CONVERSION_ID ?? LINKEDIN_SIGNUP_CONVERSION_ID
  ).trim();
  if (!/^\d+$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}

export function hasMarketingTags(): boolean {
  // Analytics counts. Leaving it out would be a silent failure of the worst
  // kind: with only GA4 configured there would be no banner, so no consent,
  // so no analytics — and nothing anywhere saying why.
  const { metaPixelId, googleAdsId, analyticsId, linkedinPartnerId, tiktokPixelId } = marketingTags();
  return Boolean(metaPixelId || googleAdsId || analyticsId || linkedinPartnerId || tiktokPixelId);
}
