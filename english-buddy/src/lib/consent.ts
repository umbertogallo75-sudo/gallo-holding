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

/** Reads a recorded choice. Returns null when there is none, or it is stale. */
export function readConsent(cookieHeader: string | null | undefined): ConsentChoice | null {
  const raw = cookieHeader?.match(new RegExp(`(?:^|;\\s*)${CONSENT_COOKIE}=([^;]+)`))?.[1];
  if (!raw) return null;
  let decoded: string;
  try {
    decoded = decodeURIComponent(raw);
  } catch {
    return null;
  }
  const [version, choice] = decoded.split(":");
  if (version !== CONSENT_VERSION) return null;
  return choice === "granted" || choice === "denied" ? choice : null;
}

export function consentCookieValue(choice: ConsentChoice): string {
  return `${CONSENT_VERSION}:${choice}`;
}

/**
 * The tags this build would load. Read statically so Next can inline them.
 * Both empty is the normal state until advertising actually starts — and then
 * there is nothing to consent to, so no banner is shown at all.
 */
export function marketingTags(): { metaPixelId: string; googleAdsId: string } {
  return {
    metaPixelId: (process.env.NEXT_PUBLIC_META_PIXEL_ID ?? "").trim(),
    googleAdsId: (process.env.NEXT_PUBLIC_GOOGLE_ADS_ID ?? "").trim(),
  };
}

export function hasMarketingTags(): boolean {
  const { metaPixelId, googleAdsId } = marketingTags();
  return Boolean(metaPixelId || googleAdsId);
}
