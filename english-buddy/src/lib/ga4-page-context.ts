import { trackablePath } from "@/lib/public-pages";

export type Ga4PageContext = {
  page_path: string;
  page_location: string;
  page_referrer: string;
};

export type Ga4PageInput = {
  pathname: string;
  search: string;
  origin: string;
  referrer: string;
};

const CLICK_ID_PARAMETERS = new Set([
  "gclid",
  "dclid",
  "wbraid",
  "gbraid",
  "fbclid",
  "msclkid",
  "li_fat_id",
]);

function safeMarketingSearch(pathname: string, pagePath: string, search: string): string {
  // A shaped bearer path (/:token, /:code) or /app never keeps any query.
  if (!search || pagePath !== pathname || pagePath.includes("/:")) return "";
  const safe = new URLSearchParams();
  for (const [rawName, value] of new URLSearchParams(search)) {
    const name = rawName.toLowerCase();
    if (/^utm_[a-z0-9][a-z0-9_]*$/.test(name) || CLICK_ID_PARAMETERS.has(name)) {
      safe.append(name, value);
    }
  }
  const query = safe.toString();
  return query ? `?${query}` : "";
}

function safeGa4Location(pathname: string, search: string, origin: string): {
  pagePath: string;
  pageLocation: string;
} {
  const pagePath = trackablePath(pathname) ?? "/app";
  const pageLocation = new URL(pagePath, origin);
  pageLocation.search = safeMarketingSearch(pathname, pagePath, search);
  return { pagePath, pageLocation: pageLocation.href };
}

function safeGa4Referrer(referrer: string, origin: string): string {
  if (!referrer) return "";
  try {
    const currentOrigin = new URL(origin).origin;
    const source = new URL(referrer);
    if (source.origin === "null") return "";
    if (source.origin !== currentOrigin) return source.origin;
    return safeGa4Location(source.pathname, source.search, currentOrigin).pageLocation;
  } catch {
    return "";
  }
}

/**
 * GA4 automatically attaches its global page context to Enhanced Measurement
 * events. Never let that context contain a bearer segment or a private route.
 */
export function safeGa4PageContext(input: Ga4PageInput): Ga4PageContext {
  const { pagePath, pageLocation } = safeGa4Location(
    input.pathname,
    input.search,
    input.origin,
  );
  return {
    page_path: pagePath,
    page_location: pageLocation,
    page_referrer: safeGa4Referrer(input.referrer, input.origin),
  };
}
