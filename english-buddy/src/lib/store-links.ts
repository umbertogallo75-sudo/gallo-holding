const PLAY_PACKAGE_NAME = "it.execlingo.app";
const APPLE_APP_ID = "6800138841";

export const CANONICAL_APP_STORE_URL =
  `https://apps.apple.com/it/app/execlingo/id${APPLE_APP_ID}`;

export const CANONICAL_PLAY_STORE_URL =
  `https://play.google.com/store/apps/details?id=${PLAY_PACKAGE_NAME}`;

const CLICK_ID_PARAMETERS = new Set([
  "gclid",
  "dclid",
  "wbraid",
  "gbraid",
  "fbclid",
  "msclkid",
  "li_fat_id",
]);

export type MarketingSearchInput =
  | URLSearchParams
  | Record<string, string | string[] | undefined>;

function entries(input: MarketingSearchInput): Array<[string, string]> {
  if (input instanceof URLSearchParams) return Array.from(input.entries());
  const result: Array<[string, string]> = [];
  for (const [name, value] of Object.entries(input)) {
    if (Array.isArray(value)) {
      for (const item of value) result.push([name, item]);
    } else if (value !== undefined) {
      result.push([name, value]);
    }
  }
  return result;
}

/**
 * Keeps only campaign parameters that are safe to carry across a public
 * redirect. Tokens, email addresses and arbitrary query parameters must never
 * leak to an app store URL.
 */
export function safeMarketingSearch(input: MarketingSearchInput): URLSearchParams {
  const safe = new URLSearchParams();
  for (const [rawName, rawValue] of entries(input)) {
    const name = rawName.toLowerCase();
    if (!/^utm_[a-z0-9][a-z0-9_]*$/.test(name) && !CLICK_ID_PARAMETERS.has(name)) continue;
    if (safe.has(name)) continue;

    const value = rawValue.trim().slice(0, name === "utm_campaign" ? 80 : 200);
    if (!value) continue;

    const candidate = new URLSearchParams(safe);
    candidate.set(name, value);
    // Google Play accepts a compact install-referrer string. Capping the full
    // value also keeps the Location header small when a link is hand-crafted.
    if (candidate.toString().length <= 1_000) safe.set(name, value);
  }
  return safe;
}

/**
 * PLAY_STORE_URL is both the cutover switch and the destination. Fail closed:
 * an empty, non-HTTPS, wrong-host or wrong-package value keeps every Android
 * badge hidden instead of redirecting visitors somewhere unexpected.
 */
export function configuredPlayStoreUrl(raw = process.env.PLAY_STORE_URL): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    if (
      url.protocol !== "https:" ||
      url.hostname !== "play.google.com" ||
      url.pathname.replace(/\/$/, "") !== "/store/apps/details" ||
      url.searchParams.get("id") !== PLAY_PACKAGE_NAME
    ) {
      return null;
    }
    return CANONICAL_PLAY_STORE_URL;
  } catch {
    return null;
  }
}

/**
 * APP_STORE_URL is normalized for the same reason as its Play counterpart:
 * one mistyped environment value must never send an ExecLingo visitor to a
 * different app. Apple may add or remove the country segment, so validation
 * keys off the official host and the immutable app id before returning the
 * checked Italian listing.
 */
export function configuredAppStoreUrl(raw = process.env.APP_STORE_URL): string | null {
  if (!raw) return null;
  try {
    const url = new URL(raw.trim());
    const lastPathPart = url.pathname.replace(/\/$/, "").split("/").at(-1);
    if (
      url.protocol !== "https:" ||
      url.hostname !== "apps.apple.com" ||
      lastPathPart !== `id${APPLE_APP_ID}`
    ) {
      return null;
    }
    return CANONICAL_APP_STORE_URL;
  } catch {
    return null;
  }
}

/**
 * Carries a web campaign into Google Play's Install Referrer field. The
 * Android shell can consume this later without changing the canonical listing
 * URL used by badges and structured data.
 */
export function playStoreCampaignUrl(
  raw: string | undefined,
  search: MarketingSearchInput,
): string | null {
  const canonical = configuredPlayStoreUrl(raw);
  if (!canonical) return null;

  const campaign = safeMarketingSearch(search).toString();
  if (!campaign) return canonical;

  const destination = new URL(canonical);
  destination.searchParams.set("referrer", campaign);
  return destination.toString();
}

function sourceFromClickId(search: URLSearchParams): string | null {
  if (search.has("gclid") || search.has("dclid") || search.has("wbraid") || search.has("gbraid")) return "google";
  if (search.has("fbclid")) return "facebook";
  if (search.has("li_fat_id")) return "linkedin";
  if (search.has("msclkid")) return "bing";
  return null;
}

/**
 * A direct /app click leaves the site before React can run SourceCapture.
 * Seed the same first-touch cookie on the redirect so the TWA can still attach
 * the campaign when the user later registers. No visitor identifier is made
 * here; attribution-client adds its normal first-party UUID on first launch.
 */
export function redirectAttributionRecord(
  input: MarketingSearchInput,
  referrer: string | null,
  now = new Date(),
): Record<string, string> | null {
  const search = safeMarketingSearch(input);
  const source = search.get("utm_source")?.slice(0, 60) || sourceFromClickId(search);
  if (!source) return null;

  const record: Record<string, string> = {
    s: source,
    t: now.toISOString(),
  };
  const medium = search.get("utm_medium")?.slice(0, 60);
  const campaign = search.get("utm_campaign")?.slice(0, 80);
  if (medium) record.m = medium;
  if (campaign) record.c = campaign;
  if (referrer) record.r = referrer.slice(0, 200);
  return record;
}
